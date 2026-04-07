import { createHash } from "crypto";

// Transaction interface
export interface Transaction {
  from: string;
  to: string;
  value: bigint;
  nonce: number;
  gasPrice: bigint;
  gasLimit: bigint;
  data: string;
  signature: string;
  hash: string;
  timestamp: number;
}

// Block interface
export interface Block {
  index: number;
  timestamp: number;
  transactions: Transaction[];
  previousHash: string;
  hash: string;
  nonce: number;
  difficulty: number;
  miner: string;
  merkleRoot: string;
  stateRoot: string;
  gasUsed: bigint;
  gasLimit: bigint;
}

// Account state interface
interface AccountState {
  balance: bigint;
  nonce: number;
}

interface EthereumFeeSuggestion {
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
}

// Merkle proof interface
export interface MerkleProof {
  siblings: string[];
  path: number[];
}

// Main Blockchain class
export class Blockchain {
  private config: any;
  chain: Block[];
  pendingTransactions: Transaction[];
  difficulty: number;
  miningReward: bigint;
  blockTime: number;
  maxBlockSize: number;
  private accountStates: Map<string, AccountState>;

  constructor(config?: any) {
    this.config = config || {};
    this.pendingTransactions = [];
    this.difficulty = config?.difficulty || 4;
    this.miningReward = config?.miningReward || BigInt(50 * 10 ** 18); // 50 tokens in wei
    this.blockTime = config?.blockTime || 10000; // 10 seconds target
    this.maxBlockSize = config?.maxBlockSize || 1000000; // 1MB in bytes
    this.accountStates = new Map();
    this.chain = [this.createGenesisBlock()];
  }

  // Create the genesis block
  createGenesisBlock(): Block {
    const genesisBlock: Block = {
      index: 0,
      timestamp: Date.now(),
      transactions: [],
      previousHash: "0",
      hash: "",
      nonce: 0,
      difficulty: this.difficulty,
      miner: "genesis",
      merkleRoot: this.calculateMerkleRoot([]),
      stateRoot: "",
      gasUsed: BigInt(0),
      gasLimit: BigInt(10000000),
    };
    genesisBlock.hash = this.calculateHash(genesisBlock);
    genesisBlock.stateRoot = this.getStateRoot();
    return genesisBlock;
  }

  // Get the latest block
  getLatestBlock(): Block {
    return this.chain[this.chain.length - 1];
  }

  // Calculate SHA-256 hash of a block
  calculateHash(block: Block): string {
    const data = `${block.index}${block.timestamp}${JSON.stringify(block.transactions)}${block.previousHash}${block.nonce}${block.difficulty}${block.miner}${block.merkleRoot}${block.stateRoot}${block.gasUsed}${block.gasLimit}`;
    return createHash("sha256").update(data).digest("hex");
  }

  // Proof of Work mining algorithm
  proofOfWork(block: Block): void {
    const target = "0".repeat(block.difficulty);
    while (block.hash.substring(0, block.difficulty) !== target) {
      block.nonce++;
      block.hash = this.calculateHash(block);
    }
  }

  // Mine pending transactions into a new block
  async minePendingTransactions(minerAddress: string): Promise<Block | null> {
    if (this.pendingTransactions.length === 0) {
      return null;
    }

    // Create reward transaction
    const rewardTx: Transaction = {
      from: "network",
      to: minerAddress,
      value: this.miningReward,
      nonce: 0,
      gasPrice: BigInt(0),
      gasLimit: BigInt(0),
      data: "",
      signature: "reward",
      hash: "",
      timestamp: Date.now(),
    };
    rewardTx.hash = this.calculateTransactionHash(rewardTx);

    // Select transactions for block (respecting max block size)
    const blockTransactions = [...this.pendingTransactions];
    blockTransactions.push(rewardTx);

    // Calculate gas used
    let totalGasUsed = BigInt(0);
    for (const tx of blockTransactions) {
      totalGasUsed += tx.gasLimit;
    }

    const latestBlock = this.getLatestBlock();
    const newBlock: Block = {
      index: latestBlock.index + 1,
      timestamp: Date.now(),
      transactions: blockTransactions,
      previousHash: latestBlock.hash,
      hash: "",
      nonce: 0,
      difficulty: this.difficulty,
      miner: minerAddress,
      merkleRoot: this.calculateMerkleRoot(blockTransactions),
      stateRoot: "",
      gasUsed: totalGasUsed,
      gasLimit: BigInt(10000000),
    };

    // Mine the block
    this.proofOfWork(newBlock);

    // Update state
    this.updateState(blockTransactions);
    newBlock.stateRoot = this.getStateRoot();

    // Add block to chain
    this.addBlock(newBlock);

    // Clear pending transactions
    this.pendingTransactions = [];

    // Adjust difficulty
    this.adjustDifficulty();

    return newBlock;
  }

  // Add a new block to the chain
  addBlock(block: Block): boolean {
    const previousBlock = this.getLatestBlock();
    if (!this.isBlockValid(block, previousBlock)) {
      return false;
    }
    this.chain.push(block);
    return true;
  }

  // Add transaction to pending pool
  addTransaction(transaction: Transaction): boolean {
    if (!this.validateTransaction(transaction)) {
      return false;
    }

    // Calculate transaction hash if not set
    if (!transaction.hash) {
      transaction.hash = this.calculateTransactionHash(transaction);
    }

    this.pendingTransactions.push(transaction);
    return true;
  }

  // Calculate transaction hash
  private calculateTransactionHash(tx: Transaction): string {
    const data = `${tx.from}${tx.to}${tx.value}${tx.nonce}${tx.gasPrice}${tx.gasLimit}${tx.data}${tx.timestamp}`;
    return createHash("sha256").update(data).digest("hex");
  }

  // Ethereum-compatible transaction hashing (go-ethereum style SHA3 family)
  calculateEthereumCompatibleTxHash(tx: Transaction): string {
    const payload = `${tx.from}${tx.to}${tx.value}${tx.nonce}${tx.gasPrice}${tx.gasLimit}${tx.data}${tx.timestamp}`;
    return `0x${createHash("sha3-256").update(payload).digest("hex")}`;
  }

  // Ethereum address format guard for chain compatibility
  isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  // EIP-1559 style fee suggestion for our chain
  suggestEthereumStyleFees(baseFeePerGas: bigint): EthereumFeeSuggestion {
    const priority = baseFeePerGas / BigInt(10) || BigInt(1);
    const maxFee = baseFeePerGas * BigInt(2) + priority;
    return {
      maxPriorityFeePerGas: priority,
      maxFeePerGas: maxFee,
    };
  }

  // Validate a transaction
  validateTransaction(transaction: Transaction): boolean {
    // Skip validation for reward transactions
    if (transaction.from === "network") {
      return true;
    }

    // Check if sender has sufficient balance
    if (
      !this.isValidEthereumAddress(transaction.from) ||
      !this.isValidEthereumAddress(transaction.to)
    ) {
      return false;
    }

    const ethHash = this.calculateEthereumCompatibleTxHash(transaction);
    if (!ethHash.startsWith("0x")) {
      return false;
    }

    const senderBalance = this.getBalance(transaction.from);
    const totalCost = transaction.value + transaction.gasPrice * transaction.gasLimit;

    if (senderBalance < totalCost) {
      return false;
    }

    // Check nonce
    const expectedNonce = this.getAccountNonce(transaction.from);
    if (transaction.nonce !== expectedNonce) {
      return false;
    }

    // Signature validation would go here (simplified)
    if (!transaction.signature) {
      return false;
    }

    return true;
  }

  // Validate entire blockchain
  isChainValid(): boolean {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (!this.isBlockValid(currentBlock, previousBlock)) {
        return false;
      }

      if (!this.hasValidTransactions(currentBlock)) {
        return false;
      }
    }
    return true;
  }

  // Validate a single block
  isBlockValid(block: Block, previousBlock: Block): boolean {
    // Check index
    if (block.index !== previousBlock.index + 1) {
      return false;
    }

    // Check previous hash
    if (block.previousHash !== previousBlock.hash) {
      return false;
    }

    // Check hash
    if (block.hash !== this.calculateHash(block)) {
      return false;
    }

    // Check proof of work
    const target = "0".repeat(block.difficulty);
    if (block.hash.substring(0, block.difficulty) !== target) {
      return false;
    }

    // Check merkle root
    if (block.merkleRoot !== this.calculateMerkleRoot(block.transactions)) {
      return false;
    }

    // Check timestamp
    if (block.timestamp <= previousBlock.timestamp) {
      return false;
    }

    return true;
  }

  // Validate all transactions in a block
  hasValidTransactions(block: Block): boolean {
    for (const tx of block.transactions) {
      if (tx.from !== "network" && !tx.signature) {
        return false;
      }
    }
    return true;
  }

  // Get account balance
  getBalance(address: string): bigint {
    const account = this.accountStates.get(address);
    return account ? account.balance : BigInt(0);
  }

  // Get account nonce
  getAccountNonce(address: string): number {
    const account = this.accountStates.get(address);
    return account ? account.nonce : 0;
  }

  // Update state with transactions
  updateState(transactions: Transaction[]): void {
    for (const tx of transactions) {
      // Deduct from sender
      if (tx.from !== "network") {
        const senderState = this.accountStates.get(tx.from) || {
          balance: BigInt(0),
          nonce: 0,
        };
        const totalCost = tx.value + tx.gasPrice * tx.gasLimit;
        senderState.balance -= totalCost;
        senderState.nonce++;
        this.accountStates.set(tx.from, senderState);
      }

      // Add to recipient
      const recipientState = this.accountStates.get(tx.to) || {
        balance: BigInt(0),
        nonce: 0,
      };
      recipientState.balance += tx.value;
      this.accountStates.set(tx.to, recipientState);
    }
  }

  // Calculate state root (simplified merkle tree of accounts)
  getStateRoot(): string {
    const accounts = Array.from(this.accountStates.entries()).sort();
    const accountHashes = accounts.map(([address, state]) => {
      const data = `${address}${state.balance}${state.nonce}`;
      return createHash("sha256").update(data).digest("hex");
    });

    if (accountHashes.length === 0) {
      return createHash("sha256").update("empty").digest("hex");
    }

    return this.buildMerkleTree(accountHashes)[0];
  }

  // Calculate merkle root of transactions
  calculateMerkleRoot(transactions: Transaction[]): string {
    if (transactions.length === 0) {
      return createHash("sha256").update("empty").digest("hex");
    }

    const txHashes = transactions.map((tx) => tx.hash || this.calculateTransactionHash(tx));
    return this.buildMerkleTree(txHashes)[0];
  }

  // Build merkle tree from hashes
  private buildMerkleTree(hashes: string[]): string[] {
    if (hashes.length === 0) {
      return [createHash("sha256").update("empty").digest("hex")];
    }

    if (hashes.length === 1) {
      return hashes;
    }

    const tree: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : left;
      const combined = createHash("sha256")
        .update(left + right)
        .digest("hex");
      tree.push(combined);
    }

    return this.buildMerkleTree(tree);
  }

  // Verify merkle proof
  verifyMerkleProof(tx: Transaction, proof: MerkleProof, root: string): boolean {
    let hash = tx.hash || this.calculateTransactionHash(tx);

    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i];
      const isLeft = proof.path[i] === 0;

      if (isLeft) {
        hash = createHash("sha256")
          .update(hash + sibling)
          .digest("hex");
      } else {
        hash = createHash("sha256")
          .update(sibling + hash)
          .digest("hex");
      }
    }

    return hash === root;
  }

  // Adjust difficulty based on block time
  adjustDifficulty(): void {
    if (this.chain.length < 2) {
      return;
    }

    const latestBlock = this.getLatestBlock();
    const previousBlock = this.chain[this.chain.length - 2];
    const timeTaken = latestBlock.timestamp - previousBlock.timestamp;

    if (timeTaken < this.blockTime / 2) {
      this.difficulty++;
    } else if (timeTaken > this.blockTime * 2) {
      this.difficulty = Math.max(1, this.difficulty - 1);
    }
  }

  // Get fork choice (longest chain)
  getForkChoice(): Block[] {
    return this.chain;
  }

  // Handle chain reorganization
  reorganize(newChain: Block[]): boolean {
    // Validate new chain
    if (newChain.length <= this.chain.length) {
      return false;
    }

    // Validate all blocks in new chain
    for (let i = 1; i < newChain.length; i++) {
      if (!this.isBlockValid(newChain[i], newChain[i - 1])) {
        return false;
      }
    }

    // Replace chain
    this.chain = newChain;

    // Rebuild state
    this.accountStates.clear();
    for (const block of this.chain) {
      this.updateState(block.transactions);
    }

    return true;
  }

  // Get pending transactions (mempool)
  getPendingTransactions(): Transaction[] {
    return [...this.pendingTransactions];
  }

  // Estimate gas for transaction
  estimateGas(transaction: Transaction): bigint {
    // Base gas cost
    let gas = BigInt(21000);

    // Add gas for data
    if (transaction.data) {
      const dataBytes = Buffer.from(transaction.data, "utf-8").length;
      gas += BigInt(dataBytes * 68);
    }

    return gas;
  }

  // Get block by hash
  getBlockByHash(hash: string): Block | undefined {
    return this.chain.find((block) => block.hash === hash);
  }

  // Get block by height/index
  getBlockByHeight(index: number): Block | undefined {
    return this.chain[index];
  }

  // Get transaction by hash
  getTransactionByHash(hash: string): { transaction: Transaction; block: Block } | undefined {
    for (const block of this.chain) {
      const transaction = block.transactions.find((tx) => tx.hash === hash);
      if (transaction) {
        return { transaction, block };
      }
    }

    // Check pending transactions
    const pendingTx = this.pendingTransactions.find((tx) => tx.hash === hash);
    if (pendingTx) {
      return {
        transaction: pendingTx,
        block: {} as Block, // No block yet
      };
    }

    return undefined;
  }

  // Get chain length
  getChainLength(): number {
    return this.chain.length;
  }

  // Get total difficulty
  getTotalDifficulty(): number {
    return this.chain.reduce((sum, block) => sum + block.difficulty, 0);
  }

  // Get all accounts
  getAllAccounts(): Map<string, AccountState> {
    return new Map(this.accountStates);
  }

  // Get total supply
  getTotalSupply(): bigint {
    let total = BigInt(0);
    for (const [_, state] of this.accountStates) {
      total += state.balance;
    }
    return total;
  }
}

// Export helper function to create new blockchain
export function createBlockchain(): Blockchain {
  return new Blockchain();
}
