/**
 * Standalone Blockchain Node Runner
 * 
 * This is an independent blockchain node that can be deployed on any server.
 * 
 * Usage:
 * 
 * Install dependencies:
 * npm install
 * 
 * Run a validator node:
 * node standalone-node/index.ts --port 8333 --validator true --mining-address 0x123... --bootstrap node1.example.com:8333,node2.example.com:8333
 * 
 * Run a regular node:
 * node standalone-node/index.ts --port 8334 --bootstrap node1.example.com:8333
 * 
 * Run with custom REST API port:
 * node standalone-node/index.ts --port 8333 --api-port 4000
 */

import express, { Request, Response } from 'express';
import { Blockchain } from '../api/lib/blockchain/customChain/blockchain';
import { P2PNetwork } from '../api/lib/blockchain/customChain/p2pNetwork';
import { ConsensusEngine } from '../api/lib/blockchain/customChain/consensus';
import { promises as fs } from 'fs';
import path from 'path';

// Parse command-line arguments
interface NodeConfig {
  port: number;
  apiPort: number;
  bootstrapNodes: string[];
  isValidator: boolean;
  miningAddress?: string;
  dataDir: string;
}

function parseArgs(): NodeConfig {
  const args = process.argv.slice(2);
  const config: NodeConfig = {
    port: 8333,
    apiPort: 3000,
    bootstrapNodes: [],
    isValidator: false,
    dataDir: './blockchain-data',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--port':
        config.port = parseInt(nextArg, 10);
        i++;
        break;
      case '--api-port':
        config.apiPort = parseInt(nextArg, 10);
        i++;
        break;
      case '--bootstrap':
        config.bootstrapNodes = nextArg.split(',').filter(Boolean);
        i++;
        break;
      case '--validator':
        config.isValidator = nextArg === 'true';
        i++;
        break;
      case '--mining-address':
        config.miningAddress = nextArg;
        i++;
        break;
      case '--data-dir':
        config.dataDir = nextArg;
        i++;
        break;
    }
  }

  return config;
}

// Logger utility
class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  info(message: string, ...args: any[]) {
    console.log(`[${new Date().toISOString()}] [${this.prefix}] [INFO]`, message, ...args);
  }

  error(message: string, ...args: any[]) {
    console.error(`[${new Date().toISOString()}] [${this.prefix}] [ERROR]`, message, ...args);
  }

  warn(message: string, ...args: any[]) {
    console.warn(`[${new Date().toISOString()}] [${this.prefix}] [WARN]`, message, ...args);
  }

  debug(message: string, ...args: any[]) {
    console.debug(`[${new Date().toISOString()}] [${this.prefix}] [DEBUG]`, message, ...args);
  }
}

// Main Node class
class BlockchainNode {
  private config: NodeConfig;
  private blockchain: Blockchain;
  private p2pNetwork: P2PNetwork;
  private consensusEngine: ConsensusEngine;
  private logger: Logger;
  private app: express.Application;
  private miningInterval?: NodeJS.Timeout;
  private saveInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(config: NodeConfig) {
    this.config = config;
    this.logger = new Logger('BlockchainNode');
    this.app = express();
    this.app.use(express.json());

    // Initialize blockchain components
    this.blockchain = new Blockchain();
    this.p2pNetwork = new P2PNetwork(this.config.port);
    this.consensusEngine = new ConsensusEngine(this.blockchain);
  }

  async initialize() {
    this.logger.info('Initializing blockchain node...');

    // Ensure data directory exists
    await fs.mkdir(this.config.dataDir, { recursive: true });

    // Try to load existing blockchain state
    await this.loadBlockchainState();

    // Initialize P2P network
    await this.initializeP2P();

    // Set up REST API
    this.setupRestAPI();

    // Set up event listeners
    this.setupEventListeners();

    // Start mining if validator
    if (this.config.isValidator) {
      if (!this.config.miningAddress) {
        throw new Error('Mining address is required for validator nodes');
      }
      this.startMining();
    }

    // Start periodic state saving
    this.startPeriodicSave();

    this.logger.info('Blockchain node initialized successfully');
  }

  private async initializeP2P() {
    this.logger.info(`Starting P2P network on port ${this.config.port}...`);
    
    await this.p2pNetwork.start();
    
    // Connect to bootstrap nodes
    if (this.config.bootstrapNodes.length > 0) {
      this.logger.info(`Connecting to ${this.config.bootstrapNodes.length} bootstrap nodes...`);
      for (const peerAddress of this.config.bootstrapNodes) {
        try {
          await this.p2pNetwork.connectToPeer(peerAddress);
          this.logger.info(`Connected to peer: ${peerAddress}`);
        } catch (error) {
          this.logger.error(`Failed to connect to peer ${peerAddress}:`, error);
        }
      }
    }
  }

  private setupEventListeners() {
    // Listen for new blocks from the network
    this.p2pNetwork.on('block', async (block: any) => {
      this.logger.info(`Received new block from network: ${block.hash}`);
      try {
        const isValid = await this.blockchain.validateBlock(block);
        if (isValid) {
          await this.blockchain.addBlock(block);
          this.logger.info(`Added block ${block.hash} to chain`);
          await this.saveBlockchainState();
        } else {
          this.logger.warn(`Rejected invalid block: ${block.hash}`);
        }
      } catch (error) {
        this.logger.error('Error processing received block:', error);
      }
    });

    // Listen for new transactions from the network
    this.p2pNetwork.on('transaction', async (transaction: any) => {
      this.logger.info(`Received new transaction: ${transaction.hash}`);
      try {
        await this.blockchain.addPendingTransaction(transaction);
        this.logger.info(`Added transaction ${transaction.hash} to pending pool`);
      } catch (error) {
        this.logger.error('Error processing received transaction:', error);
      }
    });

    // Listen for new peers
    this.p2pNetwork.on('peer_connected', (peerId: string) => {
      this.logger.info(`New peer connected: ${peerId}`);
    });

    this.p2pNetwork.on('peer_disconnected', (peerId: string) => {
      this.logger.info(`Peer disconnected: ${peerId}`);
    });
  }

  private setupRestAPI() {
    // GET /blocks - get all blocks
    this.app.get('/blocks', async (req: Request, res: Response) => {
      try {
        const blocks = await this.blockchain.getAllBlocks();
        res.json({
          success: true,
          count: blocks.length,
          blocks,
        });
      } catch (error) {
        this.logger.error('Error fetching blocks:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch blocks',
        });
      }
    });

    // GET /blocks/:hash - get block by hash
    this.app.get('/blocks/:hash', async (req: Request, res: Response) => {
      try {
        const block = await this.blockchain.getBlockByHash(req.params.hash);
        if (block) {
          res.json({
            success: true,
            block,
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Block not found',
          });
        }
      } catch (error) {
        this.logger.error('Error fetching block:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch block',
        });
      }
    });

    // POST /transactions - submit new transaction
    this.app.post('/transactions', async (req: Request, res: Response) => {
      try {
        const { from, to, amount, data } = req.body;
        
        if (!from || !to || !amount) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: from, to, amount',
          });
        }

        const transaction = await this.blockchain.createTransaction({
          from,
          to,
          amount: parseFloat(amount),
          data,
        });

        // Broadcast to network
        await this.p2pNetwork.broadcastTransaction(transaction);

        res.json({
          success: true,
          transaction,
        });
      } catch (error) {
        this.logger.error('Error creating transaction:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create transaction',
        });
      }
    });

    // GET /balance/:address - get account balance
    this.app.get('/balance/:address', async (req: Request, res: Response) => {
      try {
        const balance = await this.blockchain.getBalance(req.params.address);
        res.json({
          success: true,
          address: req.params.address,
          balance,
        });
      } catch (error) {
        this.logger.error('Error fetching balance:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch balance',
        });
      }
    });

    // GET /peers - get connected peers
    this.app.get('/peers', (req: Request, res: Response) => {
      try {
        const peers = this.p2pNetwork.getPeers();
        res.json({
          success: true,
          count: peers.length,
          peers,
        });
      } catch (error) {
        this.logger.error('Error fetching peers:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch peers',
        });
      }
    });

    // GET /status - get node status
    this.app.get('/status', async (req: Request, res: Response) => {
      try {
        const chainHeight = await this.blockchain.getHeight();
        const pendingTxCount = await this.blockchain.getPendingTransactionCount();
        const peers = this.p2pNetwork.getPeers();

        res.json({
          success: true,
          status: {
            isValidator: this.config.isValidator,
            chainHeight,
            pendingTransactions: pendingTxCount,
            connectedPeers: peers.length,
            p2pPort: this.config.port,
            apiPort: this.config.apiPort,
            uptime: process.uptime(),
          },
        });
      } catch (error) {
        this.logger.error('Error fetching status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch status',
        });
      }
    });
  }

  private startMining() {
    if (!this.config.miningAddress) {
      this.logger.error('Cannot start mining without mining address');
      return;
    }

    this.logger.info(`Starting mining with address: ${this.config.miningAddress}`);

    // Mine a new block every 10 seconds
    this.miningInterval = setInterval(async () => {
      try {
        const pendingTxCount = await this.blockchain.getPendingTransactionCount();
        
        if (pendingTxCount === 0) {
          this.logger.debug('No pending transactions, skipping mining');
          return;
        }

        this.logger.info('Mining new block...');
        const block = await this.consensusEngine.mineBlock(this.config.miningAddress!);
        
        this.logger.info(`Successfully mined block: ${block.hash}`);
        
        // Broadcast to network
        await this.p2pNetwork.broadcastBlock(block);
        
        // Save state
        await this.saveBlockchainState();
      } catch (error) {
        this.logger.error('Error during mining:', error);
      }
    }, 10000);
  }

  private startPeriodicSave() {
    // Save blockchain state every 60 seconds
    this.saveInterval = setInterval(async () => {
      try {
        await this.saveBlockchainState();
        this.logger.debug('Blockchain state saved');
      } catch (error) {
        this.logger.error('Error saving blockchain state:', error);
      }
    }, 60000);
  }

  private async saveBlockchainState() {
    const statePath = path.join(this.config.dataDir, 'blockchain-state.json');
    try {
      const state = await this.blockchain.exportState();
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    } catch (error) {
      this.logger.error('Failed to save blockchain state:', error);
      throw error;
    }
  }

  private async loadBlockchainState() {
    const statePath = path.join(this.config.dataDir, 'blockchain-state.json');
    try {
      const data = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(data);
      await this.blockchain.importState(state);
      this.logger.info('Loaded existing blockchain state');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.logger.info('No existing blockchain state found, starting fresh');
      } else {
        this.logger.error('Failed to load blockchain state:', error);
      }
    }
  }

  async start() {
    await this.initialize();

    // Start REST API server
    return new Promise<void>((resolve) => {
      this.app.listen(this.config.apiPort, () => {
        this.logger.info(`REST API server listening on port ${this.config.apiPort}`);
        this.logger.info('Node is ready to accept requests');
        resolve();
      });
    });
  }

  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Initiating graceful shutdown...');

    // Stop mining
    if (this.miningInterval) {
      clearInterval(this.miningInterval);
      this.logger.info('Mining stopped');
    }

    // Stop periodic save
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    // Save final state
    try {
      await this.saveBlockchainState();
      this.logger.info('Final blockchain state saved');
    } catch (error) {
      this.logger.error('Failed to save final state:', error);
    }

    // Stop P2P network
    try {
      await this.p2pNetwork.stop();
      this.logger.info('P2P network stopped');
    } catch (error) {
      this.logger.error('Failed to stop P2P network:', error);
    }

    this.logger.info('Shutdown complete');
    process.exit(0);
  }
}

// Main execution
async function main() {
  const config = parseArgs();
  const logger = new Logger('Main');

  logger.info('Starting Cypher Blockchain Node');
  logger.info('Configuration:', config);

  const node = new BlockchainNode(config);

  // Set up graceful shutdown handlers
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await node.shutdown();
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await node.shutdown();
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    node.shutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    node.shutdown();
  });

  try {
    await node.start();
  } catch (error) {
    logger.error('Failed to start node:', error);
    process.exit(1);
  }
}

// Run the node
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});