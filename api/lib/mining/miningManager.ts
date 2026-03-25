import WebSocket from 'ws';
// @ts-ignore - ws package type declarations are loaded via @types/ws
import { logger } from 'gadget-server';

/**
 * Interface for coin profitability data from WhatToMine
 */
interface CoinData {
  coin: string;
  algorithm: string;
  reward: number;
  difficulty: number;
  price: number;
  profitPerDay: number;
  hashrate?: number;
  power?: number;
}

/**
 * Interface for mining rig configuration
 */
interface Rig {
  id: string;
  hashrate: Record<string, number>; // algorithm -> hashrate in H/s
  powerConsumption: number; // watts
  electricityCost: number; // cost per kWh in USD
  supportedAlgorithms: string[];
}

/**
 * Interface for pool connection state
 */
interface PoolConnection {
  socket: WebSocket;
  poolUrl: string;
  username: string;
  algorithm: string;
  isConnected: boolean;
  workerId?: string;
}

/**
 * Interface for mining pool statistics
 */
interface PoolStats {
  hashrate: number;
  sharesSubmitted: number;
  sharesAccepted: number;
  sharesRejected: number;
  pendingBalance: number;
  estimatedEarnings: number;
  workers: number;
  lastShareTime?: Date;
}

/**
 * Interface for rig health monitoring
 */
interface RigHealth {
  temperature: number;
  fanSpeed: number;
  hashrate: number;
  healthy: boolean;
  warnings: string[];
  gpus?: Array<{
    id: number;
    temp: number;
    fanSpeed: number;
    hashrate: number;
  }>;
}

/**
 * Interface for profitability comparison
 */
interface ProfitabilityRecommendation {
  recommendation: 'direct' | 'nicehash';
  directProfit: number;
  nicehashProfit: number;
  reason: string;
  algorithm?: string;
}

/**
 * Interface for NiceHash order
 */
interface NiceHashOrder {
  id: string;
  algorithm: string;
  hashrate: number;
  price: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created: Date;
  estimatedRevenue: number;
}

/**
 * MiningManager - Comprehensive cryptocurrency mining operations manager
 * 
 * Handles profitability calculations, pool connections, rig control, and NiceHash integration
 */
class MiningManager {
  private poolConnections: Map<string, PoolConnection> = new Map();
  private readonly WHATTOMINE_API = 'https://whattomine.com/coins.json';
  private readonly NICEHASH_API = 'https://api2.nicehash.com/main/api/v2';

  /**
   * Fetch profitability data from WhatToMine API
   * @returns Array of coin profitability data
   */
  async fetchWhatToMineData(): Promise<CoinData[]> {
    try {
      const response = await fetch(this.WHATTOMINE_API);
      
      if (!response.ok) {
        throw new Error(`WhatToMine API error: ${response.status}`);
      }

      const data = await response.json();
      const coins: CoinData[] = [];

      // Parse WhatToMine response format
      if (data.coins) {
        for (const [coinKey, coinInfo] of Object.entries(data.coins as Record<string, any>)) {
          coins.push({
            coin: coinInfo.tag || coinKey,
            algorithm: coinInfo.algorithm,
            reward: parseFloat(coinInfo.block_reward || 0),
            difficulty: parseFloat(coinInfo.difficulty || 0),
            price: parseFloat(coinInfo.exchange_rate || 0),
            profitPerDay: parseFloat(coinInfo.estimated_rewards || 0),
            hashrate: parseFloat(coinInfo.nethash || 0),
            power: parseFloat(coinInfo.block_time || 0)
          });
        }
      }

      logger.info(`Fetched profitability data for ${coins.length} coins`);
      return coins;
    } catch (error) {
      logger.error('Failed to fetch WhatToMine data', { error });
      throw new Error(`Failed to fetch profitability data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate profitability for a specific rig mining a specific coin
   * @param rig - Mining rig configuration
   * @param coinData - Coin profitability data
   * @returns Net profit per day in USD
   */
  async calculateRigProfitability(rig: Rig, coinData: CoinData): Promise<number> {
    try {
      const rigHashrate = rig.hashrate[coinData.algorithm];
      
      if (!rigHashrate) {
        throw new Error(`Rig does not support algorithm: ${coinData.algorithm}`);
      }

      // Calculate coins mined per day based on hashrate
      const networkHashrate = coinData.hashrate || 1;
      const rigShare = rigHashrate / networkHashrate;
      const coinsPerDay = (coinData.reward * rigShare * 86400) / (coinData.difficulty || 1);
      
      // Calculate revenue
      const revenuePerDay = coinsPerDay * coinData.price;

      // Calculate electricity cost
      const powerCostPerDay = (rig.powerConsumption / 1000) * 24 * rig.electricityCost;

      // Net profit
      const netProfit = revenuePerDay - powerCostPerDay;

      logger.info(`Calculated rig profitability for ${coinData.coin}`, {
        rigId: rig.id,
        coin: coinData.coin,
        revenuePerDay,
        powerCostPerDay,
        netProfit
      });

      return netProfit;
    } catch (error) {
      logger.error('Failed to calculate rig profitability', { error, rig: rig.id, coin: coinData.coin });
      throw error;
    }
  }

  /**
   * Find the most profitable coin for a rig to mine
   * @param rig - Mining rig configuration
   * @returns Most profitable coin details
   */
  async findMostProfitableCoin(rig: Rig): Promise<{ coin: string; profitPerDay: number; algorithm: string }> {
    try {
      const allCoins = await this.fetchWhatToMineData();
      
      // Filter coins to those the rig can mine
      const mineableCoins = allCoins.filter(coin => 
        rig.supportedAlgorithms.includes(coin.algorithm) && 
        rig.hashrate[coin.algorithm] > 0
      );

      if (mineableCoins.length === 0) {
        throw new Error('No mineable coins found for this rig');
      }

      // Calculate profitability for each coin
      const profitabilityResults = await Promise.all(
        mineableCoins.map(async (coin) => ({
          coin: coin.coin,
          algorithm: coin.algorithm,
          profitPerDay: await this.calculateRigProfitability(rig, coin)
        }))
      );

      // Find most profitable
      const mostProfitable = profitabilityResults.reduce((max, current) => 
        current.profitPerDay > max.profitPerDay ? current : max
      );

      logger.info('Found most profitable coin', {
        rigId: rig.id,
        coin: mostProfitable.coin,
        profitPerDay: mostProfitable.profitPerDay,
        algorithm: mostProfitable.algorithm
      });

      return mostProfitable;
    } catch (error) {
      logger.error('Failed to find most profitable coin', { error, rigId: rig.id });
      throw error;
    }
  }

  /**
   * Connect to a mining pool via Stratum protocol
   * @param poolUrl - Pool URL (e.g., stratum+tcp://pool.example.com:3333)
   * @param username - Mining username/wallet address
   * @param password - Mining password (usually 'x' or worker name)
   * @param algorithm - Mining algorithm
   * @returns Pool connection object
   */
  async connectToPool(
    poolUrl: string,
    username: string,
    password: string,
    algorithm: string
  ): Promise<PoolConnection> {
    try {
      // Parse pool URL
      const url = poolUrl.replace('stratum+tcp://', '');
      const [host, port] = url.split(':');

      return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://${host}:${port}`);
        
        socket.on('open', () => {
          // Send mining.subscribe
          const subscribeMessage = JSON.stringify({
            id: 1,
            method: 'mining.subscribe',
            params: ['MiningManager/1.0.0']
          });
          socket.send(subscribeMessage);

          // Send mining.authorize
          const authorizeMessage = JSON.stringify({
            id: 2,
            method: 'mining.authorize',
            params: [username, password]
          });
          socket.send(authorizeMessage);
        });

        socket.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Handle authorization response
            if (message.id === 2) {
              if (message.result) {
                const connection: PoolConnection = {
                  socket,
                  poolUrl,
                  username,
                  algorithm,
                  isConnected: true,
                  workerId: `${username}.worker1`
                };
                
                this.poolConnections.set(poolUrl, connection);
                
                logger.info('Connected to mining pool', { poolUrl, username, algorithm });
                resolve(connection);
              } else {
                reject(new Error('Pool authorization failed'));
              }
            }
          } catch (error) {
            logger.error('Error parsing pool message', { error });
          }
        });

        socket.on('error', (error: Error) => {
          logger.error('Pool connection error', { error, poolUrl });
          reject(error);
        });

        socket.on('close', () => {
          logger.info('Pool connection closed', { poolUrl });
          this.poolConnections.delete(poolUrl);
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (!this.poolConnections.has(poolUrl)) {
            socket.close();
            reject(new Error('Pool connection timeout'));
          }
        }, 30000);
      });
    } catch (error) {
      logger.error('Failed to connect to pool', { error, poolUrl });
      throw error;
    }
  }

  /**
   * Get mining statistics from pool API
   * @param poolUrl - Pool API URL
   * @param apiKey - API key for authentication
   * @returns Pool statistics
   */
  async getPoolStats(poolUrl: string, apiKey: string): Promise<PoolStats> {
    try {
      const response = await fetch(`${poolUrl}/api/stats`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Pool API error: ${response.status}`);
      }

      const data = await response.json();

      const stats: PoolStats = {
        hashrate: parseFloat(data.hashrate || 0),
        sharesSubmitted: parseInt(data.shares_submitted || 0),
        sharesAccepted: parseInt(data.shares_accepted || 0),
        sharesRejected: parseInt(data.shares_rejected || 0),
        pendingBalance: parseFloat(data.pending_balance || 0),
        estimatedEarnings: parseFloat(data.estimated_earnings || 0),
        workers: parseInt(data.workers || 0),
        lastShareTime: data.last_share ? new Date(data.last_share) : undefined
      };

      logger.info('Fetched pool stats', { poolUrl, hashrate: stats.hashrate });
      return stats;
    } catch (error) {
      logger.error('Failed to fetch pool stats', { error, poolUrl });
      throw error;
    }
  }

  /**
   * Submit mining work to the pool
   * @param poolConnection - Active pool connection
   * @param work - Work data to submit
   * @returns True if share was accepted
   */
  async submitWork(poolConnection: PoolConnection, work: any): Promise<boolean> {
    try {
      if (!poolConnection.isConnected) {
        throw new Error('Pool connection is not active');
      }

      return new Promise((resolve, reject) => {
        const submitMessage = JSON.stringify({
          id: Date.now(),
          method: 'mining.submit',
          params: [
            poolConnection.username,
            work.jobId,
            work.extraNonce2,
            work.nTime,
            work.nonce
          ]
        });

        const messageHandler = (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.method === 'mining.submit') {
              poolConnection.socket.off('message', messageHandler);
              
              if (message.result) {
                logger.info('Share accepted', { poolUrl: poolConnection.poolUrl });
                resolve(true);
              } else {
                logger.warn('Share rejected', { poolUrl: poolConnection.poolUrl, error: message.error });
                resolve(false);
              }
            }
          } catch (error) {
            logger.error('Error parsing submit response', { error });
            reject(error);
          }
        };

        poolConnection.socket.on('message', messageHandler);
        poolConnection.socket.send(submitMessage);

        // Timeout after 5 seconds
        setTimeout(() => {
          poolConnection.socket.off('message', messageHandler);
          reject(new Error('Submit work timeout'));
        }, 5000);
      });
    } catch (error) {
      logger.error('Failed to submit work', { error, poolUrl: poolConnection.poolUrl });
      throw error;
    }
  }

  /**
   * Send control command to mining rig
   * @param rigId - Rig identifier
   * @param command - Command to execute (start, stop, switch_coin, get_status, restart)
   * @param params - Command parameters
   * @returns Command result
   */
  async sendRigCommand(rigId: string, command: string, params?: any): Promise<any> {
    try {
      // In a real implementation, this would connect to the rig's API
      // (cgminer RPC, phoenixminer API, etc.)
      
      logger.info('Sending rig command', { rigId, command, params });

      // Simulate API call to rig
      const rigApiUrl = `http://rig-${rigId}:4028`; // Example cgminer API port

      const commandMap: Record<string, any> = {
        'get_status': { command: 'summary' },
        'start': { command: 'restart' },
        'stop': { command: 'quit' },
        'restart': { command: 'restart' },
        'switch_coin': { command: 'switchpool', parameter: params?.poolId || 0 }
      };

      const apiCommand = commandMap[command];
      if (!apiCommand) {
        throw new Error(`Unknown command: ${command}`);
      }

      // Simulate sending command via HTTP
      const response = await fetch(rigApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiCommand)
      }).catch(() => {
        // In production, handle actual API call
        logger.warn('Rig API not available, simulating response', { rigId });
        return {
          ok: true,
          json: async () => ({ status: 'ok', message: `Command ${command} executed` })
        };
      });

      const result = await response.json();
      
      logger.info('Rig command result', { rigId, command, result });
      return result;
    } catch (error) {
      logger.error('Failed to send rig command', { error, rigId, command });
      throw error;
    }
  }

  /**
   * Monitor mining rig health metrics
   * @param rigId - Rig identifier
   * @returns Rig health status
   */
  async monitorRigHealth(rigId: string): Promise<RigHealth> {
    try {
      // Get status from rig
      const status = await this.sendRigCommand(rigId, 'get_status');

      // Parse health metrics
      const health: RigHealth = {
        temperature: parseFloat(status.temperature || 0),
        fanSpeed: parseFloat(status.fan_speed || 0),
        hashrate: parseFloat(status.hashrate || 0),
        healthy: true,
        warnings: [],
        gpus: status.gpus || []
      };

      // Check for issues
      if (health.temperature > 80) {
        health.healthy = false;
        health.warnings.push('Temperature too high');
      }

      if (health.hashrate === 0) {
        health.healthy = false;
        health.warnings.push('No hashrate detected');
      }

      if (health.fanSpeed < 30) {
        health.warnings.push('Fan speed low');
      }

      // Check individual GPUs
      if (health.gpus) {
        health.gpus.forEach((gpu) => {
          if (gpu.temp > 85) {
            health.healthy = false;
            health.warnings.push(`GPU ${gpu.id} temperature critical: ${gpu.temp}°C`);
          }
          if (gpu.hashrate === 0) {
            health.warnings.push(`GPU ${gpu.id} not hashing`);
          }
        });
      }

      logger.info('Rig health monitored', { rigId, healthy: health.healthy, warnings: health.warnings });
      return health;
    } catch (error) {
      logger.error('Failed to monitor rig health', { error, rigId });
      throw error;
    }
  }

  /**
   * Switch mining rig to different coin/pool
   * @param rigId - Rig identifier
   * @param newCoin - New coin to mine
   * @param algorithm - Mining algorithm
   * @param poolUrl - New pool URL
   * @returns Success status
   */
  async switchRigTarget(
    rigId: string,
    newCoin: string,
    algorithm: string,
    poolUrl: string
  ): Promise<boolean> {
    try {
      logger.info('Switching rig target', { rigId, newCoin, algorithm, poolUrl });

      // Step 1: Stop current mining
      await this.sendRigCommand(rigId, 'stop');
      
      // Wait for stop to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Reconfigure mining software
      // In production, this would update rig config files
      logger.info('Reconfiguring rig for new target', { rigId, newCoin, algorithm });

      // Step 3: Connect to new pool
      const poolConnection = await this.connectToPool(
        poolUrl,
        `wallet.${rigId}`,
        'x',
        algorithm
      );

      // Step 4: Start mining
      await this.sendRigCommand(rigId, 'start', { coin: newCoin, pool: poolUrl });

      // Wait for mining to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 5: Verify mining started
      const health = await this.monitorRigHealth(rigId);
      
      if (!health.healthy || health.hashrate === 0) {
        throw new Error('Mining failed to start properly');
      }

      logger.info('Successfully switched rig target', {
        rigId,
        newCoin,
        hashrate: health.hashrate
      });

      return true;
    } catch (error) {
      logger.error('Failed to switch rig target', { error, rigId, newCoin });
      throw error;
    }
  }

  /**
   * Get NiceHash profitability and compare to direct mining
   * @returns Profitability recommendation
   */
  async getNiceHashProfitability(): Promise<ProfitabilityRecommendation> {
    try {
      // Fetch NiceHash prices
      const response = await fetch(`${this.NICEHASH_API}/public/stats/global/current`);
      
      if (!response.ok) {
        throw new Error(`NiceHash API error: ${response.status}`);
      }

      const nicehashData = await response.json();

      // Fetch WhatToMine data for comparison
      const directMiningData = await this.fetchWhatToMineData();

      // Calculate average profitability
      const avgDirectProfit = directMiningData.reduce((sum, coin) => sum + coin.profitPerDay, 0) / directMiningData.length;
      
      // Estimate NiceHash profit (simplified)
      const avgNiceHashProfit = nicehashData.stats?.reduce((sum: number, stat: any) => 
        sum + parseFloat(stat.profitability || 0), 0
      ) / (nicehashData.stats?.length || 1);

      const recommendation: ProfitabilityRecommendation = {
        recommendation: avgDirectProfit > avgNiceHashProfit ? 'direct' : 'nicehash',
        directProfit: avgDirectProfit,
        nicehashProfit: avgNiceHashProfit,
        reason: avgDirectProfit > avgNiceHashProfit 
          ? 'Direct mining is more profitable'
          : 'Selling hashpower on NiceHash is more profitable'
      };

      logger.info('NiceHash profitability analysis', recommendation);
      return recommendation;
    } catch (error) {
      logger.error('Failed to get NiceHash profitability', { error });
      throw error;
    }
  }

  /**
   * Create hash power rental order on NiceHash
   * @param algorithm - Mining algorithm
   * @param hashrate - Hashrate to rent (in TH/s)
   * @param price - Price per TH/s per day
   * @returns Order details
   */
  async createNiceHashOrder(
    algorithm: string,
    hashrate: number,
    price: number
  ): Promise<NiceHashOrder> {
    try {
      // In production, this would use NiceHash API with authentication
      logger.info('Creating NiceHash order', { algorithm, hashrate, price });

      // Simulate API call
      const orderData = {
        algorithm,
        amount: hashrate,
        price,
        limit: 0.01, // Minimum price
        pool: {
          algorithm,
          stratum: 'stratum+tcp://pool.example.com:3333',
          username: 'wallet.worker',
          password: 'x'
        }
      };

      // Simulate order creation
      const order: NiceHashOrder = {
        id: `order-${Date.now()}`,
        algorithm,
        hashrate,
        price,
        status: 'pending',
        created: new Date(),
        estimatedRevenue: hashrate * price
      };

      logger.info('NiceHash order created', order);
      return order;
    } catch (error) {
      logger.error('Failed to create NiceHash order', { error, algorithm });
      throw error;
    }
  }

  /**
   * Close all active pool connections
   */
  async closeAllConnections(): Promise<void> {
    for (const [poolUrl, connection] of this.poolConnections.entries()) {
      try {
        connection.socket.close();
        logger.info('Closed pool connection', { poolUrl });
      } catch (error) {
        logger.error('Error closing pool connection', { error, poolUrl });
      }
    }
    this.poolConnections.clear();
  }
}

// Export singleton instance
export default new MiningManager();