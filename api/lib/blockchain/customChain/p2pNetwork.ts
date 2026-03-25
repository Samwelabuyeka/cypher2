import * as crypto from "crypto";
import { EventEmitter } from "events";

/**
 * Peer interface representing a network peer
 */
export interface Peer {
  id: string;
  address: string;
  publicKey: string;
  lastSeen: number;
  reputation: number;
  version: string;
  capabilities: string[];
  latency: number;
}

/**
 * Message types for P2P communication
 */
export type MessageType = 'block' | 'transaction' | 'peer_list' | 'sync_request' | 'ping';

/**
 * Message interface for P2P communication
 */
export interface Message {
  type: MessageType;
  payload: any;
  timestamp: number;
  sender: string;
  signature: string;
}

/**
 * Block interface for blockchain blocks
 */
export interface Block {
  hash: string;
  previousHash: string;
  timestamp: number;
  data: any;
  nonce: number;
  height: number;
}

/**
 * Transaction interface
 */
export interface Transaction {
  hash: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  signature: string;
}

/**
 * Peer action types for reputation scoring
 */
export type PeerAction = 'valid_block' | 'invalid_block' | 'valid_tx' | 'invalid_tx' | 'timeout' | 'malicious';

/**
 * Network statistics
 */
export interface NetworkStats {
  peerCount: number;
  averageLatency: number;
  messageQueueSize: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
}

/**
 * P2P Network class for blockchain peer-to-peer communication
 */
export class P2PNetwork extends EventEmitter {
  private peers: Map<string, Peer>;
  private maxPeers: number;
  private port: number;
  private nodeId: string;
  private messageQueue: Message[];
  private bannedPeers: Map<string, number>;
  private seenTransactions: Set<string>;
  private seenBlocks: Set<string>;
  private privateKey: string;
  private publicKey: string;
  private messagesSent: number;
  private messagesReceived: number;

  constructor(maxPeers: number = 100) {
    super();
    this.peers = new Map();
    this.maxPeers = maxPeers;
    this.port = 8333;
    this.nodeId = this.generateNodeId();
    this.messageQueue = [];
    this.bannedPeers = new Map();
    this.seenTransactions = new Set();
    this.seenBlocks = new Set();
    this.messagesSent = 0;
    this.messagesReceived = 0;

    // Generate keypair for node identity
    const { privateKey, publicKey } = this.generateKeyPair();
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  /**
   * Generate a unique node ID
   */
  private generateNodeId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate RSA keypair for node identity
   */
  private generateKeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { privateKey, publicKey };
  }

  // ============================================
  // PEER DISCOVERY
  // ============================================

  /**
   * Connect to a peer at the given address
   */
  async connectToPeer(address: string): Promise<Peer | null> {
    if (this.peers.size >= this.maxPeers) {
      console.log('Max peers reached, cannot connect to new peer');
      return null;
    }

    // Check if peer is banned
    const bannedUntil = this.bannedPeers.get(address);
    if (bannedUntil && Date.now() < bannedUntil) {
      console.log(`Peer ${address} is banned until ${new Date(bannedUntil)}`);
      return null;
    }

    try {
      // In a real implementation, this would establish a TCP/WebSocket connection
      const peerId = crypto.createHash('sha256').update(address).digest('hex');
      
      const peer: Peer = {
        id: peerId,
        address,
        publicKey: '', // Would be exchanged during handshake
        lastSeen: Date.now(),
        reputation: 100,
        version: '1.0.0',
        capabilities: ['block', 'transaction', 'sync'],
        latency: 0
      };

      this.peers.set(peerId, peer);
      this.emit('peer_connected', peer);
      
      // Send ping to measure latency
      await this.pingPeer(peer);
      
      return peer;
    } catch (error) {
      console.error(`Failed to connect to peer ${address}:`, error);
      return null;
    }
  }

  /**
   * Broadcast known peer list to all connected peers
   */
  broadcastPeerList(): void {
    const peerList = Array.from(this.peers.values()).map(peer => ({
      address: peer.address,
      publicKey: peer.publicKey,
      version: peer.version,
      capabilities: peer.capabilities
    }));

    const message: Message = {
      type: 'peer_list',
      payload: peerList,
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    this.broadcastMessage(message);
  }

  /**
   * Receive peer list from another peer and add new peers
   */
  async receivePeerList(peers: Array<{ address: string; publicKey: string; version: string; capabilities: string[] }>): Promise<void> {
    for (const peerInfo of peers) {
      // Check if we already have this peer
      const existingPeer = Array.from(this.peers.values()).find(p => p.address === peerInfo.address);
      if (!existingPeer && this.peers.size < this.maxPeers) {
        await this.connectToPeer(peerInfo.address);
      }
    }
  }

  /**
   * Find and connect to new peers
   */
  async findPeers(count: number): Promise<Peer[]> {
    // In a real implementation, this would use DNS seeds, bootstrap nodes, etc.
    const newPeers: Peer[] = [];
    
    // Request peer lists from existing peers
    this.broadcastPeerList();
    
    return newPeers;
  }

  /**
   * Remove a peer from the network
   */
  removePeer(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.peers.delete(peerId);
      this.emit('peer_disconnected', peer);
      return true;
    }
    return false;
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  /**
   * Sign a message with the node's private key
   */
  private signMessage(message: Omit<Message, 'signature'>): string {
    const messageString = JSON.stringify({
      type: message.type,
      payload: message.payload,
      timestamp: message.timestamp,
      sender: message.sender
    });
    
    const sign = crypto.createSign('SHA256');
    sign.update(messageString);
    return sign.sign(this.privateKey, 'hex');
  }

  /**
   * Verify a message signature
   */
  private verifyMessageSignature(message: Message, publicKey: string): boolean {
    const messageString = JSON.stringify({
      type: message.type,
      payload: message.payload,
      timestamp: message.timestamp,
      sender: message.sender
    });
    
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(messageString);
      return verify.verify(publicKey, message.signature, 'hex');
    } catch (error) {
      return false;
    }
  }

  /**
   * Send a message to a specific peer
   */
  async sendMessage(peer: Peer, message: Message): Promise<boolean> {
    try {
      // Update last seen
      peer.lastSeen = Date.now();
      
      // In a real implementation, this would send over TCP/WebSocket
      this.messagesSent++;
      this.emit('message_sent', { peer, message });
      
      return true;
    } catch (error) {
      console.error(`Failed to send message to peer ${peer.id}:`, error);
      return false;
    }
  }

  /**
   * Broadcast a message to all connected peers
   */
  broadcastMessage(message: Message): void {
    for (const peer of this.peers.values()) {
      this.sendMessage(peer, message);
    }
  }

  /**
   * Receive and process an incoming message
   */
  async receiveMessage(message: Message): Promise<void> {
    this.messagesReceived++;
    
    // Validate message
    if (!this.validateMessage(message)) {
      console.warn('Invalid message received');
      return;
    }

    // Update peer's last seen
    const peer = Array.from(this.peers.values()).find(p => p.id === message.sender);
    if (peer) {
      peer.lastSeen = Date.now();
    }

    // Handle message based on type
    switch (message.type) {
      case 'block':
        await this.handleBlockMessage(message, peer);
        break;
      case 'transaction':
        await this.handleTransactionMessage(message, peer);
        break;
      case 'peer_list':
        await this.receivePeerList(message.payload);
        break;
      case 'sync_request':
        await this.handleSyncRequest(message, peer);
        break;
      case 'ping':
        await this.handlePing(message, peer);
        break;
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }

    this.emit('message_received', message);
  }

  /**
   * Validate a message
   */
  validateMessage(message: Message): boolean {
    // Check required fields
    if (!message.type || !message.payload || !message.timestamp || !message.sender || !message.signature) {
      return false;
    }

    // Check timestamp (reject messages too old or in the future)
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (message.timestamp < now - maxAge || message.timestamp > now + 60000) {
      return false;
    }

    // Verify signature
    const peer = Array.from(this.peers.values()).find(p => p.id === message.sender);
    if (peer && peer.publicKey) {
      return this.verifyMessageSignature(message, peer.publicKey);
    }

    return true;
  }

  /**
   * Queue a message for processing
   */
  queueMessage(message: Message): void {
    this.messageQueue.push(message);
    this.emit('message_queued', message);
  }

  /**
   * Process queued messages
   */
  async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        await this.receiveMessage(message);
      }
    }
  }

  // ============================================
  // BLOCK PROPAGATION
  // ============================================

  /**
   * Announce a new block to all peers
   */
  announceBlock(block: Block): void {
    // Add to seen blocks to prevent loops
    this.seenBlocks.add(block.hash);

    const message: Message = {
      type: 'block',
      payload: block,
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    this.broadcastMessage(message);
  }

  /**
   * Request a specific block from a peer
   */
  async requestBlock(hash: string, peer?: Peer): Promise<void> {
    const targetPeer = peer || this.selectBestPeers(1)[0];
    if (!targetPeer) {
      console.error('No peers available to request block from');
      return;
    }

    const message: Message = {
      type: 'sync_request',
      payload: { type: 'block', hash },
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    await this.sendMessage(targetPeer, message);
  }

  /**
   * Send a block to a specific peer
   */
  async sendBlock(peer: Peer, block: Block): Promise<void> {
    const message: Message = {
      type: 'block',
      payload: block,
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    await this.sendMessage(peer, message);
  }

  /**
   * Validate a block received from a peer
   */
  validateBlock(block: Block, peer?: Peer): boolean {
    // Basic validation
    if (!block.hash || !block.previousHash || !block.timestamp || block.height === undefined) {
      if (peer) {
        this.updateReputation(peer, 'invalid_block');
      }
      return false;
    }

    // Check if we've seen this block before
    if (this.seenBlocks.has(block.hash)) {
      return false;
    }

    // In a real implementation, validate proof of work, merkle root, etc.
    
    if (peer) {
      this.updateReputation(peer, 'valid_block');
    }

    return true;
  }

  /**
   * Handle incoming block message
   */
  private async handleBlockMessage(message: Message, peer?: Peer): Promise<void> {
    const block = message.payload as Block;
    
    if (this.validateBlock(block, peer)) {
      this.seenBlocks.add(block.hash);
      this.emit('block_received', block);
    }
  }

  // ============================================
  // TRANSACTION PROPAGATION
  // ============================================

  /**
   * Announce a new transaction to all peers
   */
  announceTransaction(tx: Transaction): void {
    // Add to seen transactions to prevent loops
    this.seenTransactions.add(tx.hash);

    const message: Message = {
      type: 'transaction',
      payload: tx,
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    this.broadcastMessage(message);
  }

  /**
   * Request a specific transaction from a peer
   */
  async requestTransaction(hash: string, peer?: Peer): Promise<void> {
    const targetPeer = peer || this.selectBestPeers(1)[0];
    if (!targetPeer) {
      console.error('No peers available to request transaction from');
      return;
    }

    const message: Message = {
      type: 'sync_request',
      payload: { type: 'transaction', hash },
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    await this.sendMessage(targetPeer, message);
  }

  /**
   * Send a transaction to a specific peer
   */
  async sendTransaction(peer: Peer, tx: Transaction): Promise<void> {
    const message: Message = {
      type: 'transaction',
      payload: tx,
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    await this.sendMessage(peer, message);
  }

  /**
   * Check if transaction has been seen before
   */
  deduplicateTransaction(tx: Transaction): boolean {
    if (this.seenTransactions.has(tx.hash)) {
      return false;
    }
    this.seenTransactions.add(tx.hash);
    return true;
  }

  /**
   * Handle incoming transaction message
   */
  private async handleTransactionMessage(message: Message, peer?: Peer): Promise<void> {
    const tx = message.payload as Transaction;
    
    if (this.deduplicateTransaction(tx)) {
      // Basic validation
      if (tx.hash && tx.from && tx.to && tx.signature) {
        if (peer) {
          this.updateReputation(peer, 'valid_tx');
        }
        this.emit('transaction_received', tx);
      } else {
        if (peer) {
          this.updateReputation(peer, 'invalid_tx');
        }
      }
    }
  }

  // ============================================
  // SYNCHRONIZATION
  // ============================================

  /**
   * Synchronize blockchain with a peer
   */
  async syncChain(peer: Peer): Promise<void> {
    try {
      // Get peer's chain height
      const peerHeight = await this.getChainHeight(peer);
      
      this.emit('sync_started', { peer, height: peerHeight });
      
      // Request blocks in batches
      // This is a simplified implementation
      
    } catch (error) {
      console.error(`Failed to sync chain with peer ${peer.id}:`, error);
      this.updateReputation(peer, 'timeout');
    }
  }

  /**
   * Get the chain height from a peer
   */
  async getChainHeight(peer: Peer): Promise<number> {
    const message: Message = {
      type: 'sync_request',
      payload: { type: 'height' },
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    await this.sendMessage(peer, message);
    
    // In a real implementation, wait for response
    return 0;
  }

  /**
   * Request a range of blocks from a peer
   */
  async requestBlockRange(start: number, end: number, peer?: Peer): Promise<void> {
    const targetPeer = peer || this.selectBestPeers(1)[0];
    if (!targetPeer) {
      console.error('No peers available to request blocks from');
      return;
    }

    const message: Message = {
      type: 'sync_request',
      payload: { type: 'range', start, end },
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    await this.sendMessage(targetPeer, message);
  }

  /**
   * Validate a segment of the blockchain
   */
  validateChainSegment(blocks: Block[]): boolean {
    if (blocks.length === 0) return true;

    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].previousHash !== blocks[i - 1].hash) {
        return false;
      }
      if (blocks[i].height !== blocks[i - 1].height + 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Handle sync request from peer
   */
  private async handleSyncRequest(message: Message, peer?: Peer): Promise<void> {
    const request = message.payload;
    
    // In a real implementation, respond with requested data
    this.emit('sync_request', { request, peer });
  }

  // ============================================
  // PEER SCORING & REPUTATION
  // ============================================

  /**
   * Update peer's reputation based on action
   */
  updateReputation(peer: Peer, action: PeerAction): void {
    const reputationChanges: Record<PeerAction, number> = {
      valid_block: 10,
      invalid_block: -50,
      valid_tx: 5,
      invalid_tx: -20,
      timeout: -10,
      malicious: -100
    };

    peer.reputation += reputationChanges[action] || 0;
    
    // Clamp reputation between 0 and 200
    peer.reputation = Math.max(0, Math.min(200, peer.reputation));

    // Ban peer if reputation drops too low
    if (peer.reputation < 20) {
      this.banPeer(peer, 24 * 60 * 60 * 1000); // 24 hours
    }

    this.emit('reputation_updated', { peer, action });
  }

  /**
   * Temporarily ban a peer
   */
  banPeer(peer: Peer, duration: number): void {
    const bannedUntil = Date.now() + duration;
    this.bannedPeers.set(peer.address, bannedUntil);
    this.removePeer(peer.id);
    
    this.emit('peer_banned', { peer, until: bannedUntil });
  }

  /**
   * Calculate overall quality score for a peer
   */
  getPeerQuality(peer: Peer): number {
    const reputationScore = peer.reputation / 200; // 0-1
    const latencyScore = Math.max(0, 1 - (peer.latency / 1000)); // 0-1
    const uptimeScore = Math.min(1, (Date.now() - peer.lastSeen) / (24 * 60 * 60 * 1000)); // 0-1
    
    return (reputationScore * 0.5 + latencyScore * 0.3 + uptimeScore * 0.2);
  }

  /**
   * Select the best peers based on quality score
   */
  selectBestPeers(count: number): Peer[] {
    const sortedPeers = Array.from(this.peers.values())
      .sort((a, b) => this.getPeerQuality(b) - this.getPeerQuality(a));
    
    return sortedPeers.slice(0, count);
  }

  // ============================================
  // NETWORK HEALTH
  // ============================================

  /**
   * Get number of connected peers
   */
  getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Calculate average network latency
   */
  getNetworkLatency(): number {
    if (this.peers.size === 0) return 0;
    
    const totalLatency = Array.from(this.peers.values())
      .reduce((sum, peer) => sum + peer.latency, 0);
    
    return totalLatency / this.peers.size;
  }

  /**
   * Check network connectivity
   */
  async checkConnectivity(): Promise<boolean> {
    if (this.peers.size === 0) return false;

    // Ping all peers
    const promises = Array.from(this.peers.values()).map(peer => this.pingPeer(peer));
    const results = await Promise.all(promises);
    
    // At least one peer should respond
    return results.some(result => result);
  }

  /**
   * Get information about this node
   */
  getNodeInfo(): { id: string; port: number; publicKey: string; version: string; peerCount: number } {
    return {
      id: this.nodeId,
      port: this.port,
      publicKey: this.publicKey,
      version: '1.0.0',
      peerCount: this.peers.size
    };
  }

  /**
   * Get network statistics
   */
  getNetworkStats(): NetworkStats {
    return {
      peerCount: this.peers.size,
      averageLatency: this.getNetworkLatency(),
      messageQueueSize: this.messageQueue.length,
      totalMessagesSent: this.messagesSent,
      totalMessagesReceived: this.messagesReceived
    };
  }

  // ============================================
  // SECURITY
  // ============================================

  /**
   * Verify peer's identity using public key
   */
  verifyPeerIdentity(peer: Peer): boolean {
    if (!peer.publicKey) return false;

    // In a real implementation, verify the peer's public key matches their claimed identity
    // This could involve challenge-response authentication
    
    return true;
  }

  /**
   * Encrypt a message for a specific peer
   */
  encryptMessage(message: Message, peer: Peer): string {
    try {
      const messageString = JSON.stringify(message);
      const encrypted = crypto.publicEncrypt(
        {
          key: peer.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        Buffer.from(messageString)
      );
      return encrypted.toString('base64');
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      return '';
    }
  }

  /**
   * Decrypt a message using node's private key
   */
  decryptMessage(encryptedMessage: string): Message | null {
    try {
      const decrypted = crypto.privateDecrypt(
        {
          key: this.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        Buffer.from(encryptedMessage, 'base64')
      );
      return JSON.parse(decrypted.toString());
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      return null;
    }
  }

  /**
   * Detect potential Sybil attack
   */
  detectSybilAttack(): { detected: boolean; suspiciousPeers: Peer[] } {
    const suspiciousPeers: Peer[] = [];
    const ipAddresses = new Map<string, Peer[]>();

    // Group peers by IP address (simplified)
    for (const peer of this.peers.values()) {
      const ip = peer.address.split(':')[0];
      if (!ipAddresses.has(ip)) {
        ipAddresses.set(ip, []);
      }
      ipAddresses.get(ip)!.push(peer);
    }

    // Detect if too many peers share the same IP
    for (const [ip, peersWithIp] of ipAddresses) {
      if (peersWithIp.length > 5) { // Threshold
        suspiciousPeers.push(...peersWithIp);
      }
    }

    // Check for peers with similar behavior patterns
    const versionCounts = new Map<string, number>();
    for (const peer of this.peers.values()) {
      versionCounts.set(peer.version, (versionCounts.get(peer.version) || 0) + 1);
    }

    return {
      detected: suspiciousPeers.length > 0,
      suspiciousPeers
    };
  }

  /**
   * Ping a peer to measure latency
   */
  private async pingPeer(peer: Peer): Promise<boolean> {
    const start = Date.now();
    
    const message: Message = {
      type: 'ping',
      payload: { timestamp: start },
      timestamp: start,
      sender: this.nodeId,
      signature: ''
    };

    message.signature = this.signMessage(message);
    
    try {
      await this.sendMessage(peer, message);
      // In a real implementation, wait for pong response
      peer.latency = Date.now() - start;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle ping message
   */
  private async handlePing(message: Message, peer?: Peer): Promise<void> {
    if (!peer) return;

    // Send pong response
    const pongMessage: Message = {
      type: 'ping',
      payload: { ...message.payload, pong: true },
      timestamp: Date.now(),
      sender: this.nodeId,
      signature: ''
    };

    pongMessage.signature = this.signMessage(pongMessage);
    await this.sendMessage(peer, pongMessage);
  }

  /**
   * Clean up old seen transactions and blocks
   */
  cleanupSeenData(maxAge: number = 60 * 60 * 1000): void {
    // In a real implementation, transactions and blocks would have timestamps
    // and we'd remove those older than maxAge
    
    if (this.seenTransactions.size > 10000) {
      this.seenTransactions.clear();
    }
    
    if (this.seenBlocks.size > 10000) {
      this.seenBlocks.clear();
    }
  }

  /**
   * Shutdown the P2P network
   */
  shutdown(): void {
    // Disconnect all peers
    for (const peer of this.peers.values()) {
      this.removePeer(peer.id);
    }

    // Clear message queue
    this.messageQueue = [];
    
    this.emit('shutdown');
  }
}

// Export types and class
export default P2PNetwork;