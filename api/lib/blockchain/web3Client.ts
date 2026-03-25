import { ethers } from "ethers";

// Type definitions
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrls: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer?: string;
}

export interface TransactionOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  value?: bigint;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export interface TransactionHistoryOptions {
  startBlock?: number;
  endBlock?: number;
  limit?: number;
}

export interface PoolInfo {
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippage: number;
  deadline?: number;
}

// Supported chains configuration
const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrls: [
      "https://eth.llamarpc.com",
      "https://ethereum.publicnode.com",
      "https://rpc.ankr.com/eth",
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    blockExplorer: "https://etherscan.io",
  },
  56: {
    chainId: 56,
    name: "BSC Mainnet",
    rpcUrls: [
      "https://bsc-dataseed.binance.org",
      "https://bsc.publicnode.com",
      "https://rpc.ankr.com/bsc",
    ],
    nativeCurrency: {
      name: "BNB",
      symbol: "BNB",
      decimals: 18,
    },
    blockExplorer: "https://bscscan.com",
  },
  137: {
    chainId: 137,
    name: "Polygon Mainnet",
    rpcUrls: [
      "https://polygon-rpc.com",
      "https://polygon.llamarpc.com",
      "https://rpc.ankr.com/polygon",
    ],
    nativeCurrency: {
      name: "MATIC",
      symbol: "MATIC",
      decimals: 18,
    },
    blockExplorer: "https://polygonscan.com",
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    rpcUrls: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.llamarpc.com",
      "https://rpc.ankr.com/arbitrum",
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    blockExplorer: "https://arbiscan.io",
  },
  10: {
    chainId: 10,
    name: "Optimism",
    rpcUrls: [
      "https://mainnet.optimism.io",
      "https://optimism.llamarpc.com",
      "https://rpc.ankr.com/optimism",
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    blockExplorer: "https://optimistic.etherscan.io",
  },
};

// ERC20 ABI (minimal)
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// Uniswap V2 Router ABI (minimal)
const UNISWAP_V2_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
];

// Uniswap V2 Pair ABI (minimal)
const UNISWAP_V2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
];

export class Web3Client {
  private provider: ethers.JsonRpcProvider;
  private currentChainId: number;
  private providerIndex: number;
  private maxRetries: number;

  constructor(chainId: number = 1, maxRetries: number = 3) {
    this.currentChainId = chainId;
    this.providerIndex = 0;
    this.maxRetries = maxRetries;
    this.provider = this.createProvider(chainId);
  }

  // Create provider with fallback support
  private createProvider(chainId: number): ethers.JsonRpcProvider {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    const rpcUrl = chain.rpcUrls[this.providerIndex % chain.rpcUrls.length];
    return new ethers.JsonRpcProvider(rpcUrl, {
      chainId: chain.chainId,
      name: chain.name,
    });
  }

  // Retry logic wrapper
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Try next RPC endpoint on error
        const chain = SUPPORTED_CHAINS[this.currentChainId];
        if (attempt < this.maxRetries - 1 && chain.rpcUrls.length > 1) {
          this.providerIndex++;
          this.provider = this.createProvider(this.currentChainId);
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }

  // Wallet Management

  createWallet(): ethers.Wallet {
    return ethers.Wallet.createRandom();
  }

  importWallet(privateKey: string): ethers.Wallet {
    return new ethers.Wallet(privateKey, this.provider);
  }

  async getBalance(address: string, token?: string): Promise<bigint> {
    return this.withRetry(async () => {
      if (!token) {
        // Get native currency balance
        return await this.provider.getBalance(address);
      } else {
        // Get ERC20 token balance
        const contract = new ethers.Contract(token, ERC20_ABI, this.provider);
        return await contract.balanceOf(address);
      }
    });
  }

  async getTransactionHistory(
    address: string,
    options: TransactionHistoryOptions = {}
  ): Promise<ethers.TransactionResponse[]> {
    return this.withRetry(async () => {
      const startBlock = options.startBlock || 0;
      const endBlock = options.endBlock || await this.provider.getBlockNumber();
      const limit = options.limit || 100;

      // Note: This is a simplified version. For production, use an indexer service
      const history: ethers.TransactionResponse[] = [];
      
      for (let i = endBlock; i >= startBlock && history.length < limit; i--) {
        try {
          const block = await this.provider.getBlock(i, true);
          if (block && block.transactions) {
            for (const tx of block.transactions) {
              if (typeof tx === "object") {
                if (tx.from === address || tx.to === address) {
                  history.push(tx as ethers.TransactionResponse);
                  if (history.length >= limit) break;
                }
              }
            }
          }
        } catch (error) {
          // Skip blocks that can't be retrieved
          continue;
        }
      }

      return history;
    });
  }

  // Transaction Operations

  async sendTransaction(
    wallet: ethers.Wallet,
    to: string,
    amount: bigint,
    options: TransactionOptions = {}
  ): Promise<ethers.TransactionResponse> {
    return this.withRetry(async () => {
      const connectedWallet = wallet.connect(this.provider);
      
      const tx: ethers.TransactionRequest = {
        to,
        value: amount,
        ...options,
      };

      return await connectedWallet.sendTransaction(tx);
    });
  }

  async sendTokenTransfer(
    token: string,
    wallet: ethers.Wallet,
    to: string,
    amount: bigint
  ): Promise<ethers.TransactionResponse> {
    return this.withRetry(async () => {
      const connectedWallet = wallet.connect(this.provider);
      const contract = new ethers.Contract(token, ERC20_ABI, connectedWallet);
      
      return await contract.transfer(to, amount);
    });
  }

  async estimateGas(transaction: ethers.TransactionRequest): Promise<bigint> {
    return this.withRetry(async () => {
      return await this.provider.estimateGas(transaction);
    });
  }

  async getGasPrice(): Promise<ethers.FeeData> {
    return this.withRetry(async () => {
      return await this.provider.getFeeData();
    });
  }

  async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    return this.withRetry(async () => {
      return await this.provider.getTransactionReceipt(txHash);
    });
  }

  async waitForTransaction(
    txHash: string,
    confirmations: number = 1
  ): Promise<ethers.TransactionReceipt | null> {
    return this.withRetry(async () => {
      return await this.provider.waitForTransaction(txHash, confirmations);
    });
  }

  // Smart Contract Interaction

  async deployContract(
    abi: ethers.InterfaceAbi,
    bytecode: string,
    wallet: ethers.Wallet,
    args: any[] = []
  ): Promise<ethers.Contract> {
    return this.withRetry(async () => {
      const connectedWallet = wallet.connect(this.provider);
      const factory = new ethers.ContractFactory(abi, bytecode, connectedWallet);
      const contract = await factory.deploy(...args);
      await contract.waitForDeployment();
      return contract;
    });
  }

  getContract(address: string, abi: ethers.InterfaceAbi, signer?: ethers.Wallet): ethers.Contract {
    if (signer) {
      const connectedSigner = signer.connect(this.provider);
      return new ethers.Contract(address, abi, connectedSigner);
    }
    return new ethers.Contract(address, abi, this.provider);
  }

  async callContractMethod(
    contract: ethers.Contract,
    method: string,
    args: any[] = []
  ): Promise<any> {
    return this.withRetry(async () => {
      return await contract[method](...args);
    });
  }

  async estimateContractGas(
    contract: ethers.Contract,
    method: string,
    args: any[] = []
  ): Promise<bigint> {
    return this.withRetry(async () => {
      return await contract[method].estimateGas(...args);
    });
  }

  // Token Operations

  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
    return this.getBalance(walletAddress, tokenAddress);
  }

  async approveToken(
    tokenAddress: string,
    wallet: ethers.Wallet,
    spenderAddress: string,
    amount: bigint
  ): Promise<ethers.TransactionResponse> {
    return this.withRetry(async () => {
      const connectedWallet = wallet.connect(this.provider);
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, connectedWallet);
      
      return await contract.approve(spenderAddress, amount);
    });
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    return this.withRetry(async () => {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
      ]);

      return {
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply,
      };
    });
  }

  // DeFi Operations

  async swapTokens(
    dexRouterAddress: string,
    wallet: ethers.Wallet,
    params: SwapParams
  ): Promise<ethers.TransactionResponse> {
    return this.withRetry(async () => {
      const connectedWallet = wallet.connect(this.provider);
      const router = new ethers.Contract(dexRouterAddress, UNISWAP_V2_ROUTER_ABI, connectedWallet);
      
      const path = [params.tokenIn, params.tokenOut];
      const amountsOut = await router.getAmountsOut(params.amountIn, path);
      const amountOutMin = (amountsOut[1] * BigInt(10000 - params.slippage * 100)) / BigInt(10000);
      
      const deadline = params.deadline || Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
      
      return await router.swapExactTokensForTokens(
        params.amountIn,
        amountOutMin,
        path,
        wallet.address,
        deadline
      );
    });
  }

  async addLiquidity(
    dexRouterAddress: string,
    wallet: ethers.Wallet,
    token0: string,
    token1: string,
    amount0: bigint,
    amount1: bigint,
    slippage: number = 0.5
  ): Promise<ethers.TransactionResponse> {
    return this.withRetry(async () => {
      const connectedWallet = wallet.connect(this.provider);
      const router = new ethers.Contract(dexRouterAddress, UNISWAP_V2_ROUTER_ABI, connectedWallet);
      
      const amount0Min = (amount0 * BigInt(10000 - slippage * 100)) / BigInt(10000);
      const amount1Min = (amount1 * BigInt(10000 - slippage * 100)) / BigInt(10000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      
      return await router.addLiquidity(
        token0,
        token1,
        amount0,
        amount1,
        amount0Min,
        amount1Min,
        wallet.address,
        deadline
      );
    });
  }

  async removeLiquidity(
    dexRouterAddress: string,
    wallet: ethers.Wallet,
    token0: string,
    token1: string,
    lpTokenAmount: bigint,
    slippage: number = 0.5
  ): Promise<ethers.TransactionResponse> {
    return this.withRetry(async () => {
      const connectedWallet = wallet.connect(this.provider);
      const router = new ethers.Contract(dexRouterAddress, UNISWAP_V2_ROUTER_ABI, connectedWallet);
      
      // Note: In production, calculate min amounts based on current pool state
      const amount0Min = BigInt(0);
      const amount1Min = BigInt(0);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      
      return await router.removeLiquidity(
        token0,
        token1,
        lpTokenAmount,
        amount0Min,
        amount1Min,
        wallet.address,
        deadline
      );
    });
  }

  async getPoolInfo(pairAddress: string): Promise<PoolInfo> {
    return this.withRetry(async () => {
      const pair = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, this.provider);
      
      const [token0, token1, reserves, totalSupply] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        pair.totalSupply(),
      ]);

      return {
        token0,
        token1,
        reserve0: reserves[0],
        reserve1: reserves[1],
        totalSupply,
      };
    });
  }

  // Event Listening

  async subscribeToBlocks(callback: (blockNumber: number) => void): Promise<void> {
    this.provider.on("block", callback);
  }

  async subscribeToTransfers(
    tokenAddress: string,
    address: string | null,
    callback: (from: string, to: string, value: bigint) => void
  ): Promise<ethers.ContractEventName> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    
    const filter = address 
      ? contract.filters.Transfer(address, null)
      : contract.filters.Transfer();
    
    contract.on(filter, callback);
    
    return filter;
  }

  async subscribeToPendingTransactions(
    callback: (txHash: string) => void
  ): Promise<void> {
    this.provider.on("pending", callback);
  }

  unsubscribe(event?: ethers.ContractEventName | string): void {
    if (event) {
      this.provider.off(event);
    } else {
      this.provider.removeAllListeners();
    }
  }

  // Chain Utilities

  async getCurrentBlock(): Promise<number> {
    return this.withRetry(async () => {
      return await this.provider.getBlockNumber();
    });
  }

  async getBlock(blockNumber: number): Promise<ethers.Block | null> {
    return this.withRetry(async () => {
      return await this.provider.getBlock(blockNumber);
    });
  }

  isAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  toChecksumAddress(address: string): string {
    return ethers.getAddress(address);
  }

  parseUnits(value: string, decimals: number = 18): bigint {
    return ethers.parseUnits(value, decimals);
  }

  formatUnits(value: bigint, decimals: number = 18): string {
    return ethers.formatUnits(value, decimals);
  }

  // Multi-chain Support

  async switchChain(chainId: number): Promise<void> {
    if (!SUPPORTED_CHAINS[chainId]) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    this.currentChainId = chainId;
    this.providerIndex = 0;
    this.provider = this.createProvider(chainId);
  }

  getChainId(): number {
    return this.currentChainId;
  }

  getSupportedChains(): ChainConfig[] {
    return Object.values(SUPPORTED_CHAINS);
  }

  getChainConfig(chainId?: number): ChainConfig {
    const id = chainId || this.currentChainId;
    const config = SUPPORTED_CHAINS[id];
    if (!config) {
      throw new Error(`Unsupported chain ID: ${id}`);
    }
    return config;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }
}

// Export singleton instance
export const createWeb3Client = (chainId: number = 1, maxRetries: number = 3): Web3Client => {
  return new Web3Client(chainId, maxRetries);
};

// Export ABIs for external use
export { ERC20_ABI, UNISWAP_V2_ROUTER_ABI, UNISWAP_V2_PAIR_ABI };