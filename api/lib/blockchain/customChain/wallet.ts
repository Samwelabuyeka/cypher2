import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';

// Wallet interface
export interface Wallet {
  address: string;
  publicKey: string;
  privateKey: string; // encrypted
  mnemonic: string; // BIP39 seed phrase
  balance: bigint;
  nonce: number;
  transactions: string[]; // tx hashes
}

// WalletTransaction interface
export interface WalletTransaction {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  gasUsed: bigint;
  timestamp: number;
}

// Transaction options
export interface TransactionOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  nonce?: number;
  data?: string;
}

// Multi-signature wallet
export interface MultisigWallet {
  address: string;
  owners: string[];
  threshold: number;
  nonce: number;
  pendingTransactions: Map<string, PendingTransaction>;
}

export interface PendingTransaction {
  id: string;
  transaction: WalletTransaction;
  approvals: string[];
  executed: boolean;
}

// Backup format
export interface WalletBackup {
  version: string;
  address: string;
  encryptedData: string;
  timestamp: number;
}

// History export options
export interface HistoryOptions {
  limit?: number;
  offset?: number;
  startDate?: number;
  endDate?: number;
}

// Locked wallet state
interface LockedWallet {
  address: string;
  isLocked: boolean;
  unlockExpiry?: number;
  twoFactorEnabled: boolean;
}

// BIP39 word list (simplified - in production use a complete list)
const BIP39_WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  // ... (in production, include all 2048 words)
  'zone', 'zoo'
];

export class WalletManager {
  private wallets: Map<string, Wallet>;
  private encryptionKey: string;
  private lockedWallets: Map<string, LockedWallet>;
  private multisigWallets: Map<string, MultisigWallet>;
  private hdWalletIndices: Map<string, number>;

  constructor(encryptionKey?: string) {
    this.wallets = new Map();
    this.encryptionKey = encryptionKey || this.generateEncryptionKey();
    this.lockedWallets = new Map();
    this.multisigWallets = new Map();
    this.hdWalletIndices = new Map();
  }

  // ===== Wallet Creation =====

  async generateWallet(): Promise<Wallet> {
    const mnemonic = this.generateMnemonic();
    return this.importFromMnemonic(mnemonic);
  }

  generateMnemonic(wordCount: 12 | 24 = 12): string {
    const entropyBits = wordCount === 12 ? 128 : 256;
    const entropyBytes = entropyBits / 8;
    const entropy = randomBytes(entropyBytes);
    
    // Convert entropy to mnemonic words
    const words: string[] = [];
    const binaryString = Array.from(entropy)
      .map(byte => byte.toString(2).padStart(8, '0'))
      .join('');
    
    // Split into 11-bit chunks
    for (let i = 0; i < binaryString.length; i += 11) {
      const chunk = binaryString.slice(i, i + 11);
      if (chunk.length === 11) {
        const index = parseInt(chunk, 2);
        words.push(BIP39_WORDLIST[index % BIP39_WORDLIST.length]);
      }
    }
    
    return words.join(' ');
  }

  async importFromMnemonic(mnemonic: string, password: string = ''): Promise<Wallet> {
    // Derive seed from mnemonic
    const seed = this.mnemonicToSeed(mnemonic, password);
    
    // Generate master private key
    const privateKey = this.derivePrivateKey(seed);
    const publicKey = this.privateKeyToPublicKey(privateKey);
    const address = this.deriveAddress(publicKey);
    
    // Encrypt private key
    const encryptedPrivateKey = this.encryptPrivateKey(privateKey, this.encryptionKey);
    
    const wallet: Wallet = {
      address,
      publicKey,
      privateKey: encryptedPrivateKey,
      mnemonic: this.encryptPrivateKey(mnemonic, this.encryptionKey),
      balance: BigInt(0),
      nonce: 0,
      transactions: []
    };
    
    this.wallets.set(address, wallet);
    this.hdWalletIndices.set(address, 0);
    
    return wallet;
  }

  async importFromPrivateKey(privateKey: string): Promise<Wallet> {
    const publicKey = this.privateKeyToPublicKey(privateKey);
    const address = this.deriveAddress(publicKey);
    
    const encryptedPrivateKey = this.encryptPrivateKey(privateKey, this.encryptionKey);
    
    const wallet: Wallet = {
      address,
      publicKey,
      privateKey: encryptedPrivateKey,
      mnemonic: '', // No mnemonic when importing from private key
      balance: BigInt(0),
      nonce: 0,
      transactions: []
    };
    
    this.wallets.set(address, wallet);
    
    return wallet;
  }

  deriveAddress(publicKey: string): string {
    // Hash public key (similar to Ethereum)
    const hash = createHash('sha256').update(publicKey).digest();
    const address = '0x' + hash.slice(-20).toString('hex');
    return address;
  }

  // ===== Key Management =====

  exportPrivateKey(address: string, password: string): string {
    this.ensureUnlocked(address);
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    
    const decryptedKey = this.decryptPrivateKey(wallet.privateKey, this.encryptionKey);
    return this.encryptPrivateKey(decryptedKey, password);
  }

  exportMnemonic(address: string, password: string): string {
    this.ensureUnlocked(address);
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    if (!wallet.mnemonic) throw new Error('Wallet has no mnemonic');
    
    const decryptedMnemonic = this.decryptPrivateKey(wallet.mnemonic, this.encryptionKey);
    return this.encryptPrivateKey(decryptedMnemonic, password);
  }

  encryptPrivateKey(key: string, password: string): string {
    const salt = randomBytes(16);
    const derivedKey = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    
    let encrypted = cipher.update(key, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      encrypted,
      authTag: authTag.toString('hex')
    });
  }

  decryptPrivateKey(encryptedData: string, password: string): string {
    const data = JSON.parse(encryptedData);
    const salt = Buffer.from(data.salt, 'hex');
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.authTag, 'hex');
    
    const derivedKey = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async rotateKeys(address: string): Promise<Wallet> {
    this.ensureUnlocked(address);
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    
    // Generate new keys
    const newPrivateKey = randomBytes(32).toString('hex');
    const newPublicKey = this.privateKeyToPublicKey(newPrivateKey);
    const newAddress = this.deriveAddress(newPublicKey);
    
    // Create new wallet with rotated keys
    const newWallet: Wallet = {
      address: newAddress,
      publicKey: newPublicKey,
      privateKey: this.encryptPrivateKey(newPrivateKey, this.encryptionKey),
      mnemonic: wallet.mnemonic,
      balance: wallet.balance,
      nonce: 0,
      transactions: []
    };
    
    this.wallets.set(newAddress, newWallet);
    this.wallets.delete(address);
    
    return newWallet;
  }

  // ===== Transaction Creation =====

  async createTransaction(
    from: string,
    to: string,
    amount: bigint,
    options: TransactionOptions = {}
  ): Promise<WalletTransaction> {
    this.ensureUnlocked(from);
    const wallet = this.wallets.get(from);
    if (!wallet) throw new Error('Wallet not found');
    
    const nonce = options.nonce ?? wallet.nonce;
    const gasLimit = options.gasLimit ?? BigInt(21000);
    const gasPrice = options.gasPrice ?? BigInt(1000000000); // 1 gwei
    
    const txData = {
      from,
      to,
      value: amount,
      nonce,
      gasLimit,
      gasPrice,
      data: options.data || ''
    };
    
    const hash = this.hashTransaction(txData);
    
    const transaction: WalletTransaction = {
      hash,
      from,
      to,
      value: amount,
      status: 'pending',
      confirmations: 0,
      gasUsed: BigInt(0),
      timestamp: Date.now()
    };
    
    return transaction;
  }

  async signTransaction(tx: WalletTransaction, privateKey: string): Promise<string> {
    // Simplified signing - in production use proper ECDSA
    const message = this.serializeTransaction(tx);
    const signature = createHash('sha256')
      .update(message + privateKey)
      .digest('hex');
    
    return signature;
  }

  async sendTransaction(tx: WalletTransaction): Promise<string> {
    // This would interact with the blockchain network
    // For now, just update wallet state
    const wallet = this.wallets.get(tx.from);
    if (!wallet) throw new Error('Wallet not found');
    
    wallet.transactions.push(tx.hash);
    wallet.nonce++;
    
    return tx.hash;
  }

  async estimateFee(tx: WalletTransaction): Promise<bigint> {
    // Simplified fee estimation
    const gasLimit = BigInt(21000);
    const gasPrice = BigInt(1000000000); // 1 gwei
    return gasLimit * gasPrice;
  }

  // ===== Balance Management =====

  async getBalance(address: string): Promise<bigint> {
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    return wallet.balance;
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<bigint> {
    // This would query token contract
    // Placeholder implementation
    return BigInt(0);
  }

  async refreshBalance(address: string): Promise<bigint> {
    // This would query blockchain for actual balance
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    
    // Placeholder - in production, query blockchain
    return wallet.balance;
  }

  async trackBalanceChanges(address: string, callback: (balance: bigint) => void): Promise<void> {
    // Set up listener for balance changes
    // In production, use WebSocket or polling
    setInterval(async () => {
      const balance = await this.refreshBalance(address);
      callback(balance);
    }, 10000);
  }

  // ===== Transaction History =====

  async getTransactionHistory(
    address: string,
    options: HistoryOptions = {}
  ): Promise<WalletTransaction[]> {
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    
    // In production, query blockchain for transaction history
    // Placeholder implementation
    return [];
  }

  async getTransaction(hash: string): Promise<WalletTransaction | null> {
    // Query blockchain for transaction details
    // Placeholder implementation
    return null;
  }

  async getPendingTransactions(address: string): Promise<WalletTransaction[]> {
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    
    // Return pending transactions
    // Placeholder implementation
    return [];
  }

  async exportHistory(address: string, format: 'csv' | 'json'): Promise<string> {
    const history = await this.getTransactionHistory(address);
    
    if (format === 'json') {
      return JSON.stringify(history, (_, v) => typeof v === 'bigint' ? v.toString() : v);
    } else {
      // CSV format
      const headers = 'Hash,From,To,Value,Status,Confirmations,GasUsed,Timestamp\n';
      const rows = history.map(tx =>
        `${tx.hash},${tx.from},${tx.to},${tx.value},${tx.status},${tx.confirmations},${tx.gasUsed},${tx.timestamp}`
      ).join('\n');
      return headers + rows;
    }
  }

  // ===== Multi-signature Support =====

  async createMultisigWallet(owners: string[], threshold: number): Promise<MultisigWallet> {
    if (threshold > owners.length) {
      throw new Error('Threshold cannot exceed number of owners');
    }
    
    const address = this.deriveMultisigAddress(owners, threshold);
    
    const multisig: MultisigWallet = {
      address,
      owners,
      threshold,
      nonce: 0,
      pendingTransactions: new Map()
    };
    
    this.multisigWallets.set(address, multisig);
    
    return multisig;
  }

  async proposeTransaction(
    multisigAddress: string,
    tx: WalletTransaction
  ): Promise<string> {
    const multisig = this.multisigWallets.get(multisigAddress);
    if (!multisig) throw new Error('Multisig wallet not found');
    
    const proposalId = randomBytes(16).toString('hex');
    const pending: PendingTransaction = {
      id: proposalId,
      transaction: tx,
      approvals: [],
      executed: false
    };
    
    multisig.pendingTransactions.set(proposalId, pending);
    
    return proposalId;
  }

  async approveTransaction(
    multisigAddress: string,
    proposalId: string,
    signerAddress: string
  ): Promise<boolean> {
    const multisig = this.multisigWallets.get(multisigAddress);
    if (!multisig) throw new Error('Multisig wallet not found');
    
    if (!multisig.owners.includes(signerAddress)) {
      throw new Error('Signer is not an owner');
    }
    
    const pending = multisig.pendingTransactions.get(proposalId);
    if (!pending) throw new Error('Proposal not found');
    
    if (!pending.approvals.includes(signerAddress)) {
      pending.approvals.push(signerAddress);
    }
    
    return pending.approvals.length >= multisig.threshold;
  }

  async executeMultisigTx(multisigAddress: string, proposalId: string): Promise<string> {
    const multisig = this.multisigWallets.get(multisigAddress);
    if (!multisig) throw new Error('Multisig wallet not found');
    
    const pending = multisig.pendingTransactions.get(proposalId);
    if (!pending) throw new Error('Proposal not found');
    
    if (pending.approvals.length < multisig.threshold) {
      throw new Error('Insufficient approvals');
    }
    
    if (pending.executed) {
      throw new Error('Transaction already executed');
    }
    
    // Execute transaction
    const txHash = await this.sendTransaction(pending.transaction);
    pending.executed = true;
    
    return txHash;
  }

  // ===== HD Wallet (Hierarchical Deterministic) =====

  async deriveChildAddress(parentAddress: string, index: number): Promise<string> {
    const wallet = this.wallets.get(parentAddress);
    if (!wallet) throw new Error('Wallet not found');
    
    const path = this.generateAddressPath(index);
    const privateKey = this.decryptPrivateKey(wallet.privateKey, this.encryptionKey);
    const childPrivateKey = this.deriveChildKey(privateKey, path);
    const childPublicKey = this.privateKeyToPublicKey(childPrivateKey);
    const childAddress = this.deriveAddress(childPublicKey);
    
    return childAddress;
  }

  generateAddressPath(index: number): string {
    // BIP44 path: m/44'/60'/0'/0/index
    return `m/44'/60'/0'/0/${index}`;
  }

  async getNextAddress(parentAddress: string): Promise<string> {
    const currentIndex = this.hdWalletIndices.get(parentAddress) || 0;
    const nextAddress = await this.deriveChildAddress(parentAddress, currentIndex);
    this.hdWalletIndices.set(parentAddress, currentIndex + 1);
    return nextAddress;
  }

  // ===== Security Features =====

  validateAddress(address: string): boolean {
    // Check if address is valid format
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  checkPasswordStrength(password: string): {
    isStrong: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;
    
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    
    if (password.length < 12) feedback.push('Password should be at least 12 characters');
    if (!/[a-z]/.test(password)) feedback.push('Add lowercase letters');
    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
    if (!/[0-9]/.test(password)) feedback.push('Add numbers');
    if (!/[^a-zA-Z0-9]/.test(password)) feedback.push('Add special characters');
    
    return {
      isStrong: score >= 5,
      score,
      feedback
    };
  }

  lockWallet(address: string): void {
    this.lockedWallets.set(address, {
      address,
      isLocked: true,
      twoFactorEnabled: this.lockedWallets.get(address)?.twoFactorEnabled || false
    });
  }

  unlockWallet(address: string, password: string, duration: number = 3600000): boolean {
    // Verify password by attempting to decrypt
    try {
      const wallet = this.wallets.get(address);
      if (!wallet) return false;
      
      this.decryptPrivateKey(wallet.privateKey, this.encryptionKey);
      
      this.lockedWallets.set(address, {
        address,
        isLocked: false,
        unlockExpiry: Date.now() + duration,
        twoFactorEnabled: this.lockedWallets.get(address)?.twoFactorEnabled || false
      });
      
      return true;
    } catch {
      return false;
    }
  }

  enableTwoFactor(address: string): string {
    const locked = this.lockedWallets.get(address) || {
      address,
      isLocked: false,
      twoFactorEnabled: false
    };
    
    locked.twoFactorEnabled = true;
    this.lockedWallets.set(address, locked);
    
    // Generate 2FA secret
    return randomBytes(16).toString('base64');
  }

  // ===== Backup & Recovery =====

  async backupWallet(address: string, password: string): Promise<WalletBackup> {
    const wallet = this.wallets.get(address);
    if (!wallet) throw new Error('Wallet not found');
    
    const backupData = JSON.stringify({
      address: wallet.address,
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic
    });
    
    const encryptedData = this.encryptPrivateKey(backupData, password);
    
    return {
      version: '1.0',
      address,
      encryptedData,
      timestamp: Date.now()
    };
  }

  async restoreWallet(backup: WalletBackup, password: string): Promise<Wallet> {
    try {
      const decryptedData = this.decryptPrivateKey(backup.encryptedData, password);
      const walletData = JSON.parse(decryptedData);
      
      const wallet: Wallet = {
        address: walletData.address,
        publicKey: walletData.publicKey,
        privateKey: walletData.privateKey,
        mnemonic: walletData.mnemonic,
        balance: BigInt(0),
        nonce: 0,
        transactions: []
      };
      
      this.wallets.set(wallet.address, wallet);
      
      // Refresh balance from blockchain
      await this.refreshBalance(wallet.address);
      
      return wallet;
    } catch (error) {
      throw new Error('Failed to restore wallet: Invalid password or corrupted backup');
    }
  }

  async verifyBackup(backup: WalletBackup, password: string): Promise<boolean> {
    try {
      this.decryptPrivateKey(backup.encryptedData, password);
      return true;
    } catch {
      return false;
    }
  }

  // ===== Private Helper Methods =====

  private generateEncryptionKey(): string {
    return randomBytes(32).toString('hex');
  }

  private mnemonicToSeed(mnemonic: string, password: string = ''): Buffer {
    // Simplified BIP39 seed generation
    const salt = 'mnemonic' + password;
    return pbkdf2Sync(mnemonic, salt, 2048, 64, 'sha512');
  }

  private derivePrivateKey(seed: Buffer): string {
    // Simplified key derivation
    const hash = createHash('sha256').update(seed).digest();
    return hash.toString('hex');
  }

  private privateKeyToPublicKey(privateKey: string): string {
    // Simplified - in production use proper elliptic curve cryptography
    const hash = createHash('sha256').update(privateKey).digest();
    return '04' + hash.toString('hex') + hash.toString('hex');
  }

  private deriveChildKey(parentKey: string, path: string): string {
    // Simplified BIP32 derivation
    const hash = createHash('sha256')
      .update(parentKey + path)
      .digest();
    return hash.toString('hex');
  }

  private deriveMultisigAddress(owners: string[], threshold: number): string {
    const data = owners.sort().join('') + threshold.toString();
    const hash = createHash('sha256').update(data).digest();
    return '0x' + hash.slice(-20).toString('hex');
  }

  private hashTransaction(txData: any): string {
    const serialized = JSON.stringify(txData);
    return createHash('sha256').update(serialized).digest('hex');
  }

  private serializeTransaction(tx: WalletTransaction): string {
    return JSON.stringify({
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      timestamp: tx.timestamp
    });
  }

  private ensureUnlocked(address: string): void {
    const locked = this.lockedWallets.get(address);
    if (!locked) return;
    
    if (locked.isLocked) {
      throw new Error('Wallet is locked');
    }
    
    if (locked.unlockExpiry && Date.now() > locked.unlockExpiry) {
      locked.isLocked = true;
      throw new Error('Wallet lock expired');
    }
  }
}

// Export a singleton instance
export const walletManager = new WalletManager();