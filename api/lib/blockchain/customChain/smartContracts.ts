import crypto from "crypto";

// ==================== Interfaces ====================

export interface SmartContract {
  address: string;
  bytecode: string;
  abi: any[];
  creator: string;
  balance: bigint;
  storage: Map<string, any>;
  createdAt: number;
}

export interface ContractCall {
  contract: string;
  method: string;
  params: any[];
  value: bigint;
  gasLimit: bigint;
  caller: string;
}

export interface ContractEvent {
  contract: string;
  event: string;
  data: any;
  blockNumber: number;
  timestamp: number;
}

export interface EventFilter {
  contract?: string;
  event?: string;
  fromBlock?: number;
  toBlock?: number;
}

// ==================== Enums ====================

export enum Opcode {
  PUSH = "PUSH",
  POP = "POP",
  ADD = "ADD",
  SUB = "SUB",
  MUL = "MUL",
  DIV = "DIV",
  MOD = "MOD",
  STORE = "STORE",
  LOAD = "LOAD",
  CALL = "CALL",
  DELEGATECALL = "DELEGATECALL",
  CREATE = "CREATE",
  CREATE2 = "CREATE2",
  SELFDESTRUCT = "SELFDESTRUCT",
  REVERT = "REVERT",
  RETURN = "RETURN",
  JUMPI = "JUMPI",
  JUMP = "JUMP",
}

// ==================== Gas Costs ====================

export const GAS_COSTS = {
  PUSH: 3n,
  POP: 2n,
  ADD: 3n,
  SUB: 3n,
  MUL: 5n,
  DIV: 5n,
  MOD: 5n,
  STORE: 20000n,
  LOAD: 200n,
  CALL: 700n,
  DELEGATECALL: 700n,
  CREATE: 32000n,
  CREATE2: 32000n,
  SELFDESTRUCT: 5000n,
  REVERT: 0n,
  RETURN: 0n,
  JUMPI: 10n,
  JUMP: 8n,
  TRANSFER: 21000n,
};

// ==================== Execution Context ====================

interface ExecutionContext {
  stack: any[];
  memory: Map<number, any>;
  gasUsed: bigint;
  gasLimit: bigint;
  returnData: any;
  logs: ContractEvent[];
  callDepth: number;
  reentrantLock: boolean;
}

// ==================== Smart Contract VM ====================

export class SmartContractVM {
  public contracts: Map<string, SmartContract>;
  public globalState: Map<string, any>;
  public gasPrice: bigint;
  private eventLogs: ContractEvent[];
  private eventSubscriptions: Map<string, ((event: ContractEvent) => void)[]>;
  private nonces: Map<string, number>;
  private blockNumber: number;

  constructor(gasPrice: bigint = 1000000000n) {
    this.contracts = new Map();
    this.globalState = new Map();
    this.gasPrice = gasPrice;
    this.eventLogs = [];
    this.eventSubscriptions = new Map();
    this.nonces = new Map();
    this.blockNumber = 0;

    // Deploy built-in contracts
    this.deployBuiltInContracts();
  }

  // ==================== Contract Deployment ====================

  public async deployContract(
    bytecode: string,
    abi: any[],
    constructorArgs: any[] = [],
    deployer: string,
    value: bigint = 0n
  ): Promise<string> {
    // Validate bytecode
    this.validateBytecode(bytecode);

    // Generate contract address
    const nonce = this.getNonce(deployer);
    const address = this.generateContractAddress(deployer, nonce);
    this.incrementNonce(deployer);

    // Create contract
    const contract: SmartContract = {
      address,
      bytecode,
      abi,
      creator: deployer,
      balance: value,
      storage: new Map(),
      createdAt: Date.now(),
    };

    // Initialize contract
    await this.initializeContract(contract);

    // Execute constructor if exists
    if (constructorArgs.length > 0) {
      await this.executeConstructor(contract, constructorArgs);
    }

    // Store contract
    this.contracts.set(address, contract);

    return address;
  }

  public generateContractAddress(deployer: string, nonce: number): string {
    const hash = crypto
      .createHash("sha256")
      .update(`${deployer}${nonce}`)
      .digest("hex");
    return `0x${hash.substring(0, 40)}`;
  }

  private async initializeContract(contract: SmartContract): Promise<void> {
    // Set initial storage values
    contract.storage.set("initialized", true);
    contract.storage.set("owner", contract.creator);
  }

  public validateBytecode(bytecode: string): void {
    if (!bytecode || bytecode.length === 0) {
      throw new Error("Invalid bytecode: empty");
    }
    if (!bytecode.startsWith("0x")) {
      throw new Error("Invalid bytecode: must start with 0x");
    }
    // Check if valid hex
    const hexPattern = /^0x[0-9a-fA-F]+$/;
    if (!hexPattern.test(bytecode)) {
      throw new Error("Invalid bytecode: not valid hex");
    }
  }

  // ==================== Contract Execution ====================

  public async executeContract(call: ContractCall): Promise<any> {
    const contract = this.contracts.get(call.contract);
    if (!contract) {
      throw new Error(`Contract not found: ${call.contract}`);
    }

    // Check gas limit
    if (call.gasLimit <= 0n) {
      throw new Error("Gas limit must be positive");
    }

    // Create execution context
    const context: ExecutionContext = {
      stack: [],
      memory: new Map(),
      gasUsed: 0n,
      gasLimit: call.gasLimit,
      returnData: null,
      logs: [],
      callDepth: 0,
      reentrantLock: false,
    };

    try {
      // Execute the function
      const result = await this.executeFunction(
        contract,
        call.method,
        call.params,
        context,
        call.caller,
        call.value
      );

      // Store logs
      this.eventLogs.push(...context.logs);

      return result;
    } catch (error) {
      await this.revertExecution(error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  public async executeFunction(
    contract: SmartContract,
    method: string,
    params: any[],
    context: ExecutionContext,
    caller: string,
    value: bigint = 0n
  ): Promise<any> {
    // Find method in ABI
    const methodAbi = contract.abi.find(
      (item) => item.type === "function" && item.name === method
    );

    if (!methodAbi) {
      throw new Error(`Method not found: ${method}`);
    }

    // Check reentrancy guard
    this.reentrancyGuard(context);

    // Validate calldata
    this.validateCalldata(params, methodAbi.inputs);

    // Transfer value if needed
    if (value > 0n) {
      await this.transferFromContract(contract, caller, value);
    }

    // Simulate function execution
    const result = await this.sandboxExecution(
      contract,
      method,
      params,
      context,
      caller
    );

    return result;
  }

  public async executeConstructor(
    contract: SmartContract,
    params: any[]
  ): Promise<void> {
    const constructorAbi = contract.abi.find((item) => item.type === "constructor");

    if (!constructorAbi) {
      return; // No constructor
    }

    // Validate parameters
    this.validateCalldata(params, constructorAbi.inputs);

    // Execute constructor logic (simplified)
    contract.storage.set("constructorExecuted", true);
  }

  public async revertExecution(reason: string): Promise<void> {
    throw new Error(`Execution reverted: ${reason}`);
  }

  // ==================== State Management ====================

  public getStorage(contractAddress: string, key: string): any {
    const contract = this.contracts.get(contractAddress);
    if (!contract) {
      throw new Error(`Contract not found: ${contractAddress}`);
    }
    return contract.storage.get(key);
  }

  public setStorage(contractAddress: string, key: string, value: any): void {
    const contract = this.contracts.get(contractAddress);
    if (!contract) {
      throw new Error(`Contract not found: ${contractAddress}`);
    }
    contract.storage.set(key, value);
  }

  public getContractBalance(address: string): bigint {
    const contract = this.contracts.get(address);
    if (!contract) {
      throw new Error(`Contract not found: ${address}`);
    }
    return contract.balance;
  }

  public async transferFromContract(
    contract: SmartContract,
    to: string,
    amount: bigint
  ): Promise<void> {
    if (contract.balance < amount) {
      throw new Error("Insufficient balance");
    }

    contract.balance -= amount;

    // If recipient is a contract, credit their balance
    const recipientContract = this.contracts.get(to);
    if (recipientContract) {
      recipientContract.balance += amount;
    }
  }

  // ==================== Gas Metering ====================

  public calculateGasCost(operation: Opcode): bigint {
    return GAS_COSTS[operation] || 1n;
  }

  private deductGas(context: ExecutionContext, amount: bigint): void {
    context.gasUsed += amount;
    if (context.gasUsed > context.gasLimit) {
      throw new Error("Out of gas");
    }
  }

  private refundGas(context: ExecutionContext, amount: bigint): void {
    context.gasUsed = context.gasUsed > amount ? context.gasUsed - amount : 0n;
  }

  private checkGasLimit(used: bigint, limit: bigint): void {
    if (used > limit) {
      throw new Error(`Gas limit exceeded: ${used} > ${limit}`);
    }
  }

  // ==================== Opcode Execution ====================

  private async executeOpcode(
    opcode: Opcode,
    context: ExecutionContext,
    contract: SmartContract
  ): Promise<void> {
    const gasCost = this.calculateGasCost(opcode);
    this.deductGas(context, gasCost);

    switch (opcode) {
      case Opcode.PUSH:
        // Push value to stack (simplified)
        context.stack.push(0);
        break;

      case Opcode.POP:
        if (context.stack.length === 0) {
          throw new Error("Stack underflow");
        }
        context.stack.pop();
        break;

      case Opcode.ADD:
        if (context.stack.length < 2) {
          throw new Error("Stack underflow");
        }
        const b = BigInt(context.stack.pop());
        const a = BigInt(context.stack.pop());
        context.stack.push(a + b);
        break;

      case Opcode.SUB:
        if (context.stack.length < 2) {
          throw new Error("Stack underflow");
        }
        const sub_b = BigInt(context.stack.pop());
        const sub_a = BigInt(context.stack.pop());
        context.stack.push(sub_a - sub_b);
        break;

      case Opcode.MUL:
        if (context.stack.length < 2) {
          throw new Error("Stack underflow");
        }
        const mul_b = BigInt(context.stack.pop());
        const mul_a = BigInt(context.stack.pop());
        context.stack.push(mul_a * mul_b);
        break;

      case Opcode.DIV:
        if (context.stack.length < 2) {
          throw new Error("Stack underflow");
        }
        const div_b = BigInt(context.stack.pop());
        const div_a = BigInt(context.stack.pop());
        if (div_b === 0n) {
          throw new Error("Division by zero");
        }
        context.stack.push(div_a / div_b);
        break;

      case Opcode.STORE:
        if (context.stack.length < 2) {
          throw new Error("Stack underflow");
        }
        const value = context.stack.pop();
        const key = context.stack.pop();
        contract.storage.set(String(key), value);
        break;

      case Opcode.LOAD:
        if (context.stack.length < 1) {
          throw new Error("Stack underflow");
        }
        const loadKey = context.stack.pop();
        const loadValue = contract.storage.get(String(loadKey)) || 0;
        context.stack.push(loadValue);
        break;

      case Opcode.RETURN:
        context.returnData = context.stack.pop();
        break;

      case Opcode.REVERT:
        throw new Error("Execution reverted");

      case Opcode.SELFDESTRUCT:
        // Simplified: mark contract as destroyed
        contract.storage.set("destroyed", true);
        break;

      default:
        throw new Error(`Unsupported opcode: ${opcode}`);
    }
  }

  // ==================== Events & Logs ====================

  public emitEvent(
    contractAddress: string,
    event: string,
    data: any,
    context?: ExecutionContext
  ): void {
    const eventLog: ContractEvent = {
      contract: contractAddress,
      event,
      data,
      blockNumber: this.blockNumber,
      timestamp: Date.now(),
    };

    if (context) {
      context.logs.push(eventLog);
    } else {
      this.eventLogs.push(eventLog);
    }

    // Notify subscribers
    const key = `${contractAddress}:${event}`;
    const subscribers = this.eventSubscriptions.get(key) || [];
    for (const callback of subscribers) {
      callback(eventLog);
    }
  }

  public getEventLogs(filter: EventFilter = {}): ContractEvent[] {
    return this.eventLogs.filter((log) => {
      if (filter.contract && log.contract !== filter.contract) {
        return false;
      }
      if (filter.event && log.event !== filter.event) {
        return false;
      }
      if (filter.fromBlock !== undefined && log.blockNumber < filter.fromBlock) {
        return false;
      }
      if (filter.toBlock !== undefined && log.blockNumber > filter.toBlock) {
        return false;
      }
      return true;
    });
  }

  public subscribeToEvents(
    contractAddress: string,
    event: string,
    callback: (event: ContractEvent) => void
  ): void {
    const key = `${contractAddress}:${event}`;
    const subscribers = this.eventSubscriptions.get(key) || [];
    subscribers.push(callback);
    this.eventSubscriptions.set(key, subscribers);
  }

  // ==================== Security Features ====================

  private reentrancyGuard(context: ExecutionContext): void {
    if (context.reentrantLock) {
      throw new Error("Reentrancy detected");
    }
    context.reentrantLock = true;
  }

  private validateCalldata(params: any[], inputs: any[]): void {
    if (params.length !== inputs.length) {
      throw new Error(
        `Invalid parameter count: expected ${inputs.length}, got ${params.length}`
      );
    }

    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const input = inputs[i];

      // Type checking (simplified)
      if (input.type === "uint256" || input.type === "uint") {
        if (typeof param !== "bigint" && typeof param !== "number") {
          throw new Error(`Invalid parameter type for ${input.name}: expected uint`);
        }
      } else if (input.type === "address") {
        if (typeof param !== "string" || !param.startsWith("0x")) {
          throw new Error(`Invalid parameter type for ${input.name}: expected address`);
        }
      }
    }
  }

  private async sandboxExecution(
    contract: SmartContract,
    method: string,
    params: any[],
    context: ExecutionContext,
    caller: string
  ): Promise<any> {
    // Simplified sandbox - in reality, this would execute bytecode
    // For now, we'll simulate execution based on method name

    try {
      // Increment call depth
      context.callDepth++;
      if (context.callDepth > 100) {
        throw new Error("Call depth exceeded");
      }

      // Execute based on method (simplified simulation)
      let result: any = null;

      // This is a simplified execution - in a real EVM, we'd parse and execute bytecode
      if (method === "transfer") {
        const [to, amount] = params;
        await this.transferFromContract(contract, to, BigInt(amount));
        result = true;
      } else if (method === "balanceOf") {
        result = contract.balance;
      } else if (method === "approve") {
        const [spender, amount] = params;
        contract.storage.set(`allowance:${caller}:${spender}`, amount);
        result = true;
      } else {
        // Generic method execution
        result = { success: true, method, params };
      }

      context.returnData = result;
      return result;
    } finally {
      context.callDepth--;
      context.reentrantLock = false;
    }
  }

  // ==================== Utility Methods ====================

  private getNonce(address: string): number {
    return this.nonces.get(address) || 0;
  }

  private incrementNonce(address: string): void {
    const current = this.getNonce(address);
    this.nonces.set(address, current + 1);
  }

  public incrementBlockNumber(): void {
    this.blockNumber++;
  }

  // ==================== Built-in Contracts ====================

  private deployBuiltInContracts(): void {
    // ERC20 Token Standard
    const erc20Abi = [
      {
        type: "function",
        name: "transfer",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
      {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
      {
        type: "function",
        name: "allowance",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "event",
        name: "Transfer",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "value", type: "uint256" },
        ],
      },
    ];

    // ERC721 NFT Standard
    const erc721Abi = [
      {
        type: "function",
        name: "ownerOf",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ type: "address" }],
      },
      {
        type: "function",
        name: "transferFrom",
        inputs: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "tokenId", type: "uint256" },
        ],
        outputs: [],
      },
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "to", type: "address" },
          { name: "tokenId", type: "uint256" },
        ],
        outputs: [],
      },
      {
        type: "event",
        name: "Transfer",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "tokenId", type: "uint256", indexed: true },
        ],
      },
    ];

    // Store ABIs for reference
    this.globalState.set("ERC20_ABI", erc20Abi);
    this.globalState.set("ERC721_ABI", erc721Abi);
  }

  public async deployERC20(
    name: string,
    symbol: string,
    totalSupply: bigint,
    deployer: string
  ): Promise<string> {
    const abi = this.globalState.get("ERC20_ABI");
    const bytecode = "0x" + crypto.randomBytes(32).toString("hex");

    const address = await this.deployContract(bytecode, abi, [], deployer);

    const contract = this.contracts.get(address);
    if (contract) {
      contract.storage.set("name", name);
      contract.storage.set("symbol", symbol);
      contract.storage.set("totalSupply", totalSupply);
      contract.storage.set(`balance:${deployer}`, totalSupply);
    }

    return address;
  }

  public async deployERC721(
    name: string,
    symbol: string,
    deployer: string
  ): Promise<string> {
    const abi = this.globalState.get("ERC721_ABI");
    const bytecode = "0x" + crypto.randomBytes(32).toString("hex");

    const address = await this.deployContract(bytecode, abi, [], deployer);

    const contract = this.contracts.get(address);
    if (contract) {
      contract.storage.set("name", name);
      contract.storage.set("symbol", symbol);
      contract.storage.set("nextTokenId", 1);
    }

    return address;
  }

  public async deployGovernanceContract(
    votingPeriod: number,
    quorumPercentage: number,
    deployer: string
  ): Promise<string> {
    const abi = [
      {
        type: "function",
        name: "propose",
        inputs: [
          { name: "description", type: "string" },
          { name: "actions", type: "bytes[]" },
        ],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "function",
        name: "vote",
        inputs: [
          { name: "proposalId", type: "uint256" },
          { name: "support", type: "bool" },
        ],
        outputs: [],
      },
      {
        type: "function",
        name: "execute",
        inputs: [{ name: "proposalId", type: "uint256" }],
        outputs: [],
      },
    ];

    const bytecode = "0x" + crypto.randomBytes(32).toString("hex");
    const address = await this.deployContract(bytecode, abi, [], deployer);

    const contract = this.contracts.get(address);
    if (contract) {
      contract.storage.set("votingPeriod", votingPeriod);
      contract.storage.set("quorumPercentage", quorumPercentage);
      contract.storage.set("proposalCount", 0);
    }

    return address;
  }

  public async deployStakingContract(
    rewardRate: bigint,
    stakingToken: string,
    deployer: string
  ): Promise<string> {
    const abi = [
      {
        type: "function",
        name: "stake",
        inputs: [{ name: "amount", type: "uint256" }],
        outputs: [],
      },
      {
        type: "function",
        name: "withdraw",
        inputs: [{ name: "amount", type: "uint256" }],
        outputs: [],
      },
      {
        type: "function",
        name: "claimRewards",
        inputs: [],
        outputs: [],
      },
      {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ];

    const bytecode = "0x" + crypto.randomBytes(32).toString("hex");
    const address = await this.deployContract(bytecode, abi, [], deployer);

    const contract = this.contracts.get(address);
    if (contract) {
      contract.storage.set("rewardRate", rewardRate);
      contract.storage.set("stakingToken", stakingToken);
      contract.storage.set("totalStaked", 0n);
    }

    return address;
  }
}

// ==================== Export ====================

export default SmartContractVM;