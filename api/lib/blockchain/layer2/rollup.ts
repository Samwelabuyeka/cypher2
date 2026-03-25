import crypto from "crypto";

/**
 * L2 Transaction Interface
 */
export interface L2Transaction {
  from: string;
  to: string;
  value: bigint;
  nonce: number;
  data: string;
  signature: string;
  l2Hash: string;
  batchId: string;
}

/**
 * Batch Interface
 */
export interface Batch {
  batchId: string;
  transactions: L2Transaction[];
  stateRoot: string;
  prevStateRoot: string;
  timestamp: number;
  sequencer: string;
  l1TxHash: string;
}

/**
 * Fraud Proof Interface
 */
export interface FraudProof {
  batchId: string;
  challengedTx: string;
  proof: any;
  challenger: string;
  status: "pending" | "verified" | "rejected";
}

/**
 * Block Interface for L2 Chain
 */
export interface Block {
  blockNumber: number;
  timestamp: number;
  transactions: L2Transaction[];
  stateRoot: string;
  prevBlockHash: string;
  blockHash: string;
}

/**
 * Account State Interface
 */
interface AccountState {
  address: string;
  balance: bigint;
  nonce: number;
}

/**
 * Withdrawal Request Interface
 */
interface WithdrawalRequest {
  address: string;
  amount: bigint;
  timestamp: number;
  batchId: string;
  status: "pending" | "finalized" | "claimed";
}

/**
 * Fast Exit Request Interface
 */
interface FastExitRequest {
  txHash: string;
  from: string;
  amount: bigint;
  liquidityProvider: string;
  fee: bigint;
  status: "pending" | "completed";
}

/**
 * Liquidity Provider Interface
 */
interface LiquidityProvider {
  address: string;
  availableLiquidity: bigint;
}

/**
 * Optimistic Rollup Implementation
 */
export class OptimisticRollup {
  public l2Chain: Block[];
  public pendingBatches: Batch[];
  public l1Contract: string;
  public sequencer: string;
  public challengePeriod: number;

  private accountStates: Map<string, AccountState>;
  private mempool: L2Transaction[];
  private fraudProofs: Map<string, FraudProof>;
  private withdrawalRequests: Map<string, WithdrawalRequest>;
  private fastExitRequests: Map<string, FastExitRequest>;
  private liquidityProviders: Map<string, LiquidityProvider>;
  private batchDataStore: Map<string, Batch>;
  private sequencerRewards: Map<string, bigint>;
  private blockTimes: number[];

  constructor(l1Contract: string, sequencer: string, challengePeriod: number = 7 * 24 * 60 * 60 * 1000) {
    this.l2Chain = [];
    this.pendingBatches = [];
    this.l1Contract = l1Contract;
    this.sequencer = sequencer;
    this.challengePeriod = challengePeriod;
    this.accountStates = new Map();
    this.mempool = [];
    this.fraudProofs = new Map();
    this.withdrawalRequests = new Map();
    this.fastExitRequests = new Map();
    this.liquidityProviders = new Map();
    this.batchDataStore = new Map();
    this.sequencerRewards = new Map();
    this.blockTimes = [];

    this.initializeGenesisBlock();
  }

  /**
   * Initialize genesis block
   */
  private initializeGenesisBlock(): void {
    const genesisBlock: Block = {
      blockNumber: 0,
      timestamp: Date.now(),
      transactions: [],
      stateRoot: this.calculateStateRoot(),
      prevBlockHash: "0x0",
      blockHash: this.hashBlock({
        blockNumber: 0,
        timestamp: Date.now(),
        transactions: [],
        stateRoot: "",
        prevBlockHash: "0x0",
        blockHash: "",
      }),
    };
    this.l2Chain.push(genesisBlock);
  }

  /**
   * Transaction Processing - Submit L2 Transaction
   */
  public submitL2Transaction(tx: Omit<L2Transaction, "l2Hash" | "batchId">): L2Transaction {
    const l2Hash = this.hashTransaction(tx);
    const fullTx: L2Transaction = {
      ...tx,
      l2Hash,
      batchId: "",
    };
    this.mempool.push(fullTx);
    return fullTx;
  }

  /**
   * Execute L2 Transaction
   */
  public executeL2Transaction(tx: L2Transaction): boolean {
    const fromAccount = this.accountStates.get(tx.from);
    const toAccount = this.accountStates.get(tx.to) || { address: tx.to, balance: 0n, nonce: 0 };

    if (!fromAccount) {
      throw new Error(`Account ${tx.from} not found`);
    }

    if (fromAccount.nonce !== tx.nonce) {
      throw new Error(`Invalid nonce. Expected ${fromAccount.nonce}, got ${tx.nonce}`);
    }

    if (fromAccount.balance < tx.value) {
      throw new Error(`Insufficient balance. Required ${tx.value}, available ${fromAccount.balance}`);
    }

    fromAccount.balance -= tx.value;
    fromAccount.nonce += 1;
    toAccount.balance += tx.value;

    this.accountStates.set(tx.from, fromAccount);
    this.accountStates.set(tx.to, toAccount);

    return true;
  }

  /**
   * Batch Transactions
   */
  public batchTransactions(txs: L2Transaction[]): Batch {
    const batchId = this.generateBatchId();
    const prevStateRoot = this.calculateStateRoot();

    for (const tx of txs) {
      tx.batchId = batchId;
      this.executeL2Transaction(tx);
    }

    const batch: Batch = {
      batchId,
      transactions: txs,
      stateRoot: this.calculateStateRoot(),
      prevStateRoot,
      timestamp: Date.now(),
      sequencer: this.sequencer,
      l1TxHash: "",
    };

    this.pendingBatches.push(batch);
    return batch;
  }

  /**
   * Compress Transactions
   */
  public compressTransactions(txs: L2Transaction[]): string {
    const compressed = txs.map((tx) => ({
      f: tx.from.slice(2, 12),
      t: tx.to.slice(2, 12),
      v: tx.value.toString(16),
      n: tx.nonce,
      d: tx.data ? tx.data.slice(0, 20) : "",
    }));
    return JSON.stringify(compressed);
  }

  /**
   * State Management - Update L2 State
   */
  public updateL2State(txs: L2Transaction[]): void {
    for (const tx of txs) {
      this.executeL2Transaction(tx);
    }
  }

  /**
   * Calculate State Root (Merkle root of all accounts)
   */
  public calculateStateRoot(): string {
    const accountHashes: string[] = [];
    
    this.accountStates.forEach((account) => {
      const accountData = `${account.address}:${account.balance}:${account.nonce}`;
      accountHashes.push(crypto.createHash("sha256").update(accountData).digest("hex"));
    });

    if (accountHashes.length === 0) {
      return crypto.createHash("sha256").update("empty").digest("hex");
    }

    return this.buildMerkleRoot(accountHashes);
  }

  /**
   * Get L2 Balance
   */
  public getL2Balance(address: string): bigint {
    const account = this.accountStates.get(address);
    return account ? account.balance : 0n;
  }

  /**
   * Migrate State
   */
  public migrateState(address: string, amount: bigint, direction: "l1-to-l2" | "l2-to-l1"): void {
    if (direction === "l1-to-l2") {
      this.depositFromL1(address, amount);
    } else {
      this.withdrawToL1(address, amount);
    }
  }

  /**
   * Batch Submission to L1 - Submit Batch
   */
  public async submitBatchToL1(batch: Batch): Promise<string> {
    const compressedData = this.compressBatchData(batch);
    const batchRoot = this.calculateBatchRoot(batch);
    
    const l1TxHash = await this.simulateL1Transaction({
      contract: this.l1Contract,
      method: "submitBatch",
      params: {
        batchId: batch.batchId,
        batchRoot,
        compressedData,
        sequencer: batch.sequencer,
      },
    });

    batch.l1TxHash = l1TxHash;
    this.batchDataStore.set(batch.batchId, batch);

    const batchIndex = this.pendingBatches.findIndex((b) => b.batchId === batch.batchId);
    if (batchIndex !== -1) {
      this.pendingBatches.splice(batchIndex, 1);
    }

    return l1TxHash;
  }

  /**
   * Compress Batch Data
   */
  public compressBatchData(batch: Batch): string {
    return this.compressTransactions(batch.transactions);
  }

  /**
   * Calculate Batch Root
   */
  public calculateBatchRoot(batch: Batch): string {
    const batchData = JSON.stringify({
      batchId: batch.batchId,
      txCount: batch.transactions.length,
      stateRoot: batch.stateRoot,
      prevStateRoot: batch.prevStateRoot,
    });
    return crypto.createHash("sha256").update(batchData).digest("hex");
  }

  /**
   * Wait for L1 Confirmation
   */
  public async waitForL1Confirmation(txHash: string): Promise<boolean> {
    await this.simulateDelay(5000);
    return true;
  }

  /**
   * Fraud Proof System - Challenge Batch
   */
  public challengeBatch(batchId: string, proof: any, challenger: string): FraudProof {
    const fraudProof: FraudProof = {
      batchId,
      challengedTx: proof.txHash || "",
      proof,
      challenger,
      status: "pending",
    };

    this.fraudProofs.set(batchId, fraudProof);
    return fraudProof;
  }

  /**
   * Verify Fraud Proof
   */
  public verifyFraudProof(proof: FraudProof): boolean {
    const batch = this.batchDataStore.get(proof.batchId);
    if (!batch) {
      proof.status = "rejected";
      return false;
    }

    const prevState = new Map(this.accountStates);
    
    try {
      for (const tx of batch.transactions) {
        this.executeL2Transaction(tx);
      }
      
      const calculatedRoot = this.calculateStateRoot();
      
      this.accountStates = prevState;
      
      if (calculatedRoot !== batch.stateRoot) {
        proof.status = "verified";
        return true;
      }
      
      proof.status = "rejected";
      return false;
    } catch (error) {
      this.accountStates = prevState;
      proof.status = "verified";
      return true;
    }
  }

  /**
   * Revert Batch
   */
  public revertBatch(batchId: string): void {
    const batch = this.batchDataStore.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const stateSnapshot = batch.prevStateRoot;
    
    for (const tx of batch.transactions) {
      const fromAccount = this.accountStates.get(tx.from);
      const toAccount = this.accountStates.get(tx.to);

      if (fromAccount && toAccount) {
        fromAccount.balance += tx.value;
        fromAccount.nonce -= 1;
        toAccount.balance -= tx.value;

        this.accountStates.set(tx.from, fromAccount);
        this.accountStates.set(tx.to, toAccount);
      }
    }

    this.batchDataStore.delete(batchId);
  }

  /**
   * Slash Sequencer
   */
  public slashSequencer(sequencer: string): void {
    const rewards = this.sequencerRewards.get(sequencer) || 0n;
    const slashAmount = rewards / 2n;
    
    this.sequencerRewards.set(sequencer, rewards - slashAmount);
  }

  /**
   * Bridge Operations - Deposit from L1
   */
  public depositFromL1(address: string, amount: bigint): void {
    let account = this.accountStates.get(address);
    
    if (!account) {
      account = {
        address,
        balance: 0n,
        nonce: 0,
      };
    }
    
    account.balance += amount;
    this.accountStates.set(address, account);
  }

  /**
   * Withdraw to L1
   */
  public withdrawToL1(address: string, amount: bigint): string {
    const account = this.accountStates.get(address);
    
    if (!account || account.balance < amount) {
      throw new Error("Insufficient balance for withdrawal");
    }
    
    account.balance -= amount;
    this.accountStates.set(address, account);
    
    const withdrawalId = this.generateWithdrawalId();
    const withdrawal: WithdrawalRequest = {
      address,
      amount,
      timestamp: Date.now(),
      batchId: "",
      status: "pending",
    };
    
    this.withdrawalRequests.set(withdrawalId, withdrawal);
    return withdrawalId;
  }

  /**
   * Finalize Withdrawal
   */
  public finalizeWithdrawal(txHash: string): boolean {
    const withdrawal = this.withdrawalRequests.get(txHash);
    
    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }
    
    const timePassed = Date.now() - withdrawal.timestamp;
    
    if (timePassed < this.challengePeriod) {
      throw new Error(`Challenge period not ended. ${this.challengePeriod - timePassed}ms remaining`);
    }
    
    withdrawal.status = "finalized";
    this.withdrawalRequests.set(txHash, withdrawal);
    return true;
  }

  /**
   * Claim Withdrawal
   */
  public claimWithdrawal(address: string): bigint {
    let totalClaimed = 0n;
    
    this.withdrawalRequests.forEach((withdrawal, txHash) => {
      if (withdrawal.address === address && withdrawal.status === "finalized") {
        totalClaimed += withdrawal.amount;
        withdrawal.status = "claimed";
        this.withdrawalRequests.set(txHash, withdrawal);
      }
    });
    
    return totalClaimed;
  }

  /**
   * Sequencer Operations - Select Sequencer
   */
  public selectSequencer(): string {
    const candidates = Array.from(this.sequencerRewards.keys());
    
    if (candidates.length === 0) {
      return this.sequencer;
    }
    
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Rotate Sequencer
   */
  public rotateSequencer(): void {
    this.sequencer = this.selectSequencer();
  }

  /**
   * Propose Block
   */
  public proposeBlock(transactions: L2Transaction[]): Block {
    const prevBlock = this.l2Chain[this.l2Chain.length - 1];
    const blockNumber = prevBlock.blockNumber + 1;
    const timestamp = Date.now();
    
    for (const tx of transactions) {
      this.executeL2Transaction(tx);
    }
    
    const block: Block = {
      blockNumber,
      timestamp,
      transactions,
      stateRoot: this.calculateStateRoot(),
      prevBlockHash: prevBlock.blockHash,
      blockHash: "",
    };
    
    block.blockHash = this.hashBlock(block);
    this.l2Chain.push(block);
    
    if (this.blockTimes.length > 0) {
      this.blockTimes.push(timestamp - prevBlock.timestamp);
    } else {
      this.blockTimes.push(0);
    }
    
    const mempoolTxs = transactions.filter((tx) => this.mempool.includes(tx));
    this.mempool = this.mempool.filter((tx) => !mempoolTxs.includes(tx));
    
    return block;
  }

  /**
   * Receive Sequencer Reward
   */
  public receiveSequencerReward(batch: Batch): void {
    const reward = BigInt(batch.transactions.length) * 100n;
    const currentReward = this.sequencerRewards.get(batch.sequencer) || 0n;
    this.sequencerRewards.set(batch.sequencer, currentReward + reward);
  }

  /**
   * Data Availability - Publish Batch Data
   */
  public publishBatchData(batch: Batch): void {
    this.batchDataStore.set(batch.batchId, batch);
  }

  /**
   * Retrieve Batch Data
   */
  public retrieveBatchData(batchId: string): Batch | undefined {
    return this.batchDataStore.get(batchId);
  }

  /**
   * Verify Data Available
   */
  public verifyDataAvailable(batch: Batch): boolean {
    const storedBatch = this.batchDataStore.get(batch.batchId);
    return storedBatch !== undefined && storedBatch.l1TxHash !== "";
  }

  /**
   * Fast Exits - Request Fast Exit
   */
  public requestFastExit(tx: L2Transaction): string {
    const lpAddress = this.findLiquidityProvider(tx.value);
    
    if (!lpAddress) {
      throw new Error("No liquidity provider available for this amount");
    }
    
    const fee = tx.value / 100n;
    const exitId = this.generateExitId();
    
    const fastExit: FastExitRequest = {
      txHash: tx.l2Hash,
      from: tx.from,
      amount: tx.value,
      liquidityProvider: lpAddress,
      fee,
      status: "pending",
    };
    
    this.fastExitRequests.set(exitId, fastExit);
    
    const lp = this.liquidityProviders.get(lpAddress);
    if (lp) {
      lp.availableLiquidity -= tx.value;
      this.liquidityProviders.set(lpAddress, lp);
    }
    
    return exitId;
  }

  /**
   * Provide Liquidity
   */
  public provideLiquidity(amount: bigint, provider: string): void {
    let lp = this.liquidityProviders.get(provider);
    
    if (!lp) {
      lp = {
        address: provider,
        availableLiquidity: 0n,
      };
    }
    
    lp.availableLiquidity += amount;
    this.liquidityProviders.set(provider, lp);
  }

  /**
   * Claim Fast Exit
   */
  public claimFastExit(txHash: string): boolean {
    let claimed = false;
    
    this.fastExitRequests.forEach((exit, exitId) => {
      if (exit.txHash === txHash && exit.status === "pending") {
        exit.status = "completed";
        this.fastExitRequests.set(exitId, exit);
        
        const lp = this.liquidityProviders.get(exit.liquidityProvider);
        if (lp) {
          lp.availableLiquidity += exit.amount + exit.fee;
          this.liquidityProviders.set(exit.liquidityProvider, lp);
        }
        
        claimed = true;
      }
    });
    
    return claimed;
  }

  /**
   * Performance Metrics - Get L2 TPS
   */
  public getL2TPS(): number {
    if (this.l2Chain.length < 2) return 0;
    
    const recentBlocks = this.l2Chain.slice(-10);
    const totalTxs = recentBlocks.reduce((sum, block) => sum + block.transactions.length, 0);
    const timeSpan = recentBlocks[recentBlocks.length - 1].timestamp - recentBlocks[0].timestamp;
    
    return timeSpan > 0 ? (totalTxs / timeSpan) * 1000 : 0;
  }

  /**
   * Get L2 Block Time
   */
  public getL2BlockTime(): number {
    if (this.blockTimes.length === 0) return 0;
    
    const sum = this.blockTimes.reduce((a, b) => a + b, 0);
    return sum / this.blockTimes.length;
  }

  /**
   * Get L1 Gas Savings
   */
  public getL1GasSavings(): number {
    const totalL2Txs = this.l2Chain.reduce((sum, block) => sum + block.transactions.length, 0);
    const totalBatches = this.batchDataStore.size;
    
    if (totalBatches === 0) return 0;
    
    const l1GasPerTx = 21000;
    const l1GasPerBatch = 500000;
    const directL1Gas = totalL2Txs * l1GasPerTx;
    const rollupL1Gas = totalBatches * l1GasPerBatch;
    
    return ((directL1Gas - rollupL1Gas) / directL1Gas) * 100;
  }

  /**
   * Get Batch Size
   */
  public getBatchSize(): number {
    if (this.batchDataStore.size === 0) return 0;
    
    let totalTxs = 0;
    this.batchDataStore.forEach((batch) => {
      totalTxs += batch.transactions.length;
    });
    
    return totalTxs / this.batchDataStore.size;
  }

  /**
   * Helper Methods
   */

  private hashTransaction(tx: Partial<L2Transaction>): string {
    const txData = JSON.stringify({
      from: tx.from,
      to: tx.to,
      value: tx.value?.toString(),
      nonce: tx.nonce,
      data: tx.data,
    });
    return crypto.createHash("sha256").update(txData).digest("hex");
  }

  private hashBlock(block: Block): string {
    const blockData = JSON.stringify({
      blockNumber: block.blockNumber,
      timestamp: block.timestamp,
      txCount: block.transactions.length,
      stateRoot: block.stateRoot,
      prevBlockHash: block.prevBlockHash,
    });
    return crypto.createHash("sha256").update(blockData).digest("hex");
  }

  private buildMerkleRoot(hashes: string[]): string {
    if (hashes.length === 1) return hashes[0];
    
    const newLevel: string[] = [];
    
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : left;
      const combined = crypto.createHash("sha256").update(left + right).digest("hex");
      newLevel.push(combined);
    }
    
    return this.buildMerkleRoot(newLevel);
  }

  private generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateWithdrawalId(): string {
    return `withdrawal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateExitId(): string {
    return `exit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private findLiquidityProvider(amount: bigint): string | null {
    for (const [address, lp] of this.liquidityProviders.entries()) {
      if (lp.availableLiquidity >= amount) {
        return address;
      }
    }
    return null;
  }

  private async simulateL1Transaction(params: any): Promise<string> {
    await this.simulateDelay(2000);
    return `0x${crypto.randomBytes(32).toString("hex")}`;
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default OptimisticRollup;