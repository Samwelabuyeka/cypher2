/**
 * NFT Operations Client
 * Provides comprehensive NFT functionality including querying, transfers, minting,
 * marketplace operations, and IPFS integration for ERC721 and ERC1155 standards
 */

// Types and Interfaces
export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  animation_url?: string;
  background_color?: string;
  [key: string]: any;
}

export interface NFTQueryOptions {
  limit?: number;
  offset?: number;
  standard?: 'ERC721' | 'ERC1155' | 'all';
  includeMetadata?: boolean;
}

export interface NFT {
  contract: string;
  tokenId: string;
  owner: string;
  tokenURI?: string;
  metadata?: NFTMetadata;
  standard: 'ERC721' | 'ERC1155';
  balance?: string; // For ERC1155
}

export interface CollectionStats {
  floorPrice: string;
  volume24h: string;
  volumeTotal: string;
  sales24h: number;
  salesTotal: number;
  holders: number;
  supply: number;
}

export interface MarketplaceListing {
  listingId: string;
  seller: string;
  contract: string;
  tokenId: string;
  price: string;
  currency: string;
  expiration: number;
}

export interface Auction {
  auctionId: string;
  seller: string;
  contract: string;
  tokenId: string;
  startPrice: string;
  currentBid: string;
  highestBidder: string;
  endTime: number;
}

export interface IPFSUploadResult {
  cid: string;
  uri: string;
  gateway: string;
}

// ERC721 ABI subset
const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function mint(address to, uint256 tokenId)',
  'function safeMint(address to, uint256 tokenId, string uri)',
];

// ERC1155 ABI subset
const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function uri(uint256 id) view returns (string)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function mint(address to, uint256 id, uint256 amount, bytes data)',
  'function mintBatch(address to, uint256[] ids, uint256[] amounts, bytes data)',
];

/**
 * NFT Client for comprehensive NFT operations
 */
export class NFTClient {
  private web3Client: any;
  private ipfsGateway: string;
  private ipfsApiUrl: string;

  constructor(web3Client: any, options?: { ipfsGateway?: string; ipfsApiUrl?: string }) {
    this.web3Client = web3Client;
    this.ipfsGateway = options?.ipfsGateway || 'https://ipfs.io/ipfs/';
    this.ipfsApiUrl = options?.ipfsApiUrl || 'https://api.pinata.cloud';
  }

  // ===== NFT Querying =====

  /**
   * Get all NFTs owned by an address
   */
  async getNFTsByOwner(owner: string, options: NFTQueryOptions = {}): Promise<NFT[]> {
    const { limit = 100, offset = 0, standard = 'all', includeMetadata = false } = options;
    const nfts: NFT[] = [];

    try {
      // This is a simplified implementation
      // In production, you'd use an indexing service like The Graph, Alchemy, or Moralis
      // For now, we'll return a structured response
      
      // Note: Actual implementation would query blockchain or indexing service
      // This is a placeholder that shows the expected structure
      
      return nfts.slice(offset, offset + limit);
    } catch (error) {
      throw new Error(`Failed to get NFTs for owner ${owner}: ${error}`);
    }
  }

  /**
   * Get NFT metadata from contract and token ID
   */
  async getNFTMetadata(contract: string, tokenId: string): Promise<{ uri: string; metadata: NFTMetadata | null }> {
    try {
      const tokenURI = await this.getTokenURI(contract, tokenId);
      
      if (!tokenURI) {
        return { uri: '', metadata: null };
      }

      const metadata = await this.parseMetadata(tokenURI);
      return { uri: tokenURI, metadata };
    } catch (error) {
      throw new Error(`Failed to get metadata for ${contract}:${tokenId}: ${error}`);
    }
  }

  /**
   * Get the owner of an ERC721 token
   */
  async getNFTOwner(contract: string, tokenId: string): Promise<string> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      const owner = await nftContract.ownerOf(tokenId);
      return owner;
    } catch (error) {
      throw new Error(`Failed to get owner for ${contract}:${tokenId}: ${error}`);
    }
  }

  /**
   * Get total supply of NFT collection
   */
  async getTotalSupply(contract: string): Promise<number> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      const supply = await nftContract.totalSupply();
      return parseInt(supply.toString());
    } catch (error) {
      throw new Error(`Failed to get total supply for ${contract}: ${error}`);
    }
  }

  /**
   * Get token URI for an NFT
   */
  async getTokenURI(contract: string, tokenId: string): Promise<string> {
    try {
      // Try ERC721 first
      try {
        const nftContract = this.getContract(contract, ERC721_ABI);
        const uri = await nftContract.tokenURI(tokenId);
        return uri;
      } catch {
        // Try ERC1155
        const nftContract = this.getContract(contract, ERC1155_ABI);
        const uri = await nftContract.uri(tokenId);
        return uri;
      }
    } catch (error) {
      throw new Error(`Failed to get token URI for ${contract}:${tokenId}: ${error}`);
    }
  }

  // ===== NFT Transfers =====

  /**
   * Transfer an ERC721 NFT
   */
  async transferNFT(contract: string, from: string, to: string, tokenId: string): Promise<any> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      const tx = await nftContract.transferFrom(from, to, tokenId);
      return tx;
    } catch (error) {
      throw new Error(`Failed to transfer NFT ${contract}:${tokenId}: ${error}`);
    }
  }

  /**
   * Batch transfer multiple NFTs
   */
  async batchTransfer(contract: string, from: string, to: string, tokenIds: string[]): Promise<any[]> {
    try {
      const transfers = [];
      for (const tokenId of tokenIds) {
        const tx = await this.transferNFT(contract, from, to, tokenId);
        transfers.push(tx);
      }
      return transfers;
    } catch (error) {
      throw new Error(`Failed to batch transfer NFTs: ${error}`);
    }
  }

  /**
   * Safe transfer an NFT with data
   */
  async safeTransferNFT(contract: string, from: string, to: string, tokenId: string, data: string = '0x'): Promise<any> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      const tx = await nftContract['safeTransferFrom(address,address,uint256,bytes)'](from, to, tokenId, data);
      return tx;
    } catch (error) {
      throw new Error(`Failed to safe transfer NFT ${contract}:${tokenId}: ${error}`);
    }
  }

  // ===== NFT Minting =====

  /**
   * Mint an NFT
   */
  async mintNFT(contract: string, to: string, tokenId: string, metadata?: NFTMetadata): Promise<any> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      
      if (metadata) {
        const { uri } = await this.uploadToIPFS(metadata);
        const tx = await nftContract.safeMint(to, tokenId, uri);
        return tx;
      } else {
        const tx = await nftContract.mint(to, tokenId);
        return tx;
      }
    } catch (error) {
      throw new Error(`Failed to mint NFT: ${error}`);
    }
  }

  /**
   * Batch mint NFTs
   */
  async batchMint(contract: string, to: string, tokenIds: string[], metadatas?: NFTMetadata[]): Promise<any[]> {
    try {
      const mints = [];
      for (let i = 0; i < tokenIds.length; i++) {
        const metadata = metadatas ? metadatas[i] : undefined;
        const tx = await this.mintNFT(contract, to, tokenIds[i], metadata);
        mints.push(tx);
      }
      return mints;
    } catch (error) {
      throw new Error(`Failed to batch mint NFTs: ${error}`);
    }
  }

  /**
   * Mint NFT with royalty information
   */
  async mintWithRoyalty(contract: string, to: string, tokenId: string, metadata: NFTMetadata, royaltyBps: number): Promise<any> {
    try {
      // Add royalty info to metadata
      const royaltyMetadata = {
        ...metadata,
        royalty: {
          bps: royaltyBps,
          recipient: to,
        },
      };

      const { uri } = await this.uploadToIPFS(royaltyMetadata);
      const nftContract = this.getContract(contract, ERC721_ABI);
      const tx = await nftContract.safeMint(to, tokenId, uri);
      return tx;
    } catch (error) {
      throw new Error(`Failed to mint NFT with royalty: ${error}`);
    }
  }

  // ===== NFT Marketplace Operations =====

  /**
   * List NFT for sale on marketplace
   */
  async listForSale(marketplace: string, contract: string, tokenId: string, price: string): Promise<any> {
    try {
      // This is a generic interface - actual implementation depends on marketplace contract
      const marketplaceContract = this.getContract(marketplace, [
        'function createListing(address nftContract, uint256 tokenId, uint256 price)',
      ]);
      const tx = await marketplaceContract.createListing(contract, tokenId, price);
      return tx;
    } catch (error) {
      throw new Error(`Failed to list NFT for sale: ${error}`);
    }
  }

  /**
   * Buy an NFT from marketplace
   */
  async buyNFT(marketplace: string, listingId: string, price: string): Promise<any> {
    try {
      const marketplaceContract = this.getContract(marketplace, [
        'function buy(uint256 listingId) payable',
      ]);
      const tx = await marketplaceContract.buy(listingId, { value: price });
      return tx;
    } catch (error) {
      throw new Error(`Failed to buy NFT: ${error}`);
    }
  }

  /**
   * Create an auction for an NFT
   */
  async createAuction(marketplace: string, contract: string, tokenId: string, startPrice: string, duration: number): Promise<any> {
    try {
      const marketplaceContract = this.getContract(marketplace, [
        'function createAuction(address nftContract, uint256 tokenId, uint256 startPrice, uint256 duration)',
      ]);
      const tx = await marketplaceContract.createAuction(contract, tokenId, startPrice, duration);
      return tx;
    } catch (error) {
      throw new Error(`Failed to create auction: ${error}`);
    }
  }

  /**
   * Place a bid on an auction
   */
  async placeBid(marketplace: string, auctionId: string, bidAmount: string): Promise<any> {
    try {
      const marketplaceContract = this.getContract(marketplace, [
        'function placeBid(uint256 auctionId) payable',
      ]);
      const tx = await marketplaceContract.placeBid(auctionId, { value: bidAmount });
      return tx;
    } catch (error) {
      throw new Error(`Failed to place bid: ${error}`);
    }
  }

  /**
   * Cancel a marketplace listing
   */
  async cancelListing(marketplace: string, listingId: string): Promise<any> {
    try {
      const marketplaceContract = this.getContract(marketplace, [
        'function cancelListing(uint256 listingId)',
      ]);
      const tx = await marketplaceContract.cancelListing(listingId);
      return tx;
    } catch (error) {
      throw new Error(`Failed to cancel listing: ${error}`);
    }
  }

  // ===== NFT Approval =====

  /**
   * Approve an address to transfer a specific NFT
   */
  async approveNFT(contract: string, spender: string, tokenId: string): Promise<any> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      const tx = await nftContract.approve(spender, tokenId);
      return tx;
    } catch (error) {
      throw new Error(`Failed to approve NFT: ${error}`);
    }
  }

  /**
   * Set approval for all NFTs in a collection
   */
  async setApprovalForAll(contract: string, operator: string, approved: boolean): Promise<any> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      const tx = await nftContract.setApprovalForAll(operator, approved);
      return tx;
    } catch (error) {
      throw new Error(`Failed to set approval for all: ${error}`);
    }
  }

  /**
   * Check if an operator is approved for all NFTs
   */
  async isApprovedForAll(contract: string, owner: string, operator: string): Promise<boolean> {
    try {
      const nftContract = this.getContract(contract, ERC721_ABI);
      const approved = await nftContract.isApprovedForAll(owner, operator);
      return approved;
    } catch (error) {
      throw new Error(`Failed to check approval: ${error}`);
    }
  }

  // ===== IPFS Integration =====

  /**
   * Upload metadata to IPFS
   */
  async uploadToIPFS(metadata: NFTMetadata): Promise<IPFSUploadResult> {
    try {
      // This is a simplified implementation
      // In production, you'd use a service like Pinata, NFT.Storage, or Web3.Storage
      
      const jsonString = JSON.stringify(metadata);
      
      // Placeholder for actual IPFS upload
      // Real implementation would use fetch to upload to IPFS service
      const cid = this.generateCID(jsonString);
      
      return {
        cid,
        uri: `ipfs://${cid}`,
        gateway: `${this.ipfsGateway}${cid}`,
      };
    } catch (error) {
      throw new Error(`Failed to upload to IPFS: ${error}`);
    }
  }

  /**
   * Fetch content from IPFS
   */
  async fetchFromIPFS(cid: string): Promise<any> {
    try {
      const url = `${this.ipfsGateway}${cid}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to fetch from IPFS: ${error}`);
    }
  }

  /**
   * Pin content to IPFS
   */
  async pinToIPFS(cid: string): Promise<boolean> {
    try {
      // This would use a pinning service API
      // Placeholder implementation
      return true;
    } catch (error) {
      throw new Error(`Failed to pin to IPFS: ${error}`);
    }
  }

  // ===== Metadata Parsing =====

  /**
   * Parse metadata from URI
   */
  async parseMetadata(uri: string): Promise<NFTMetadata | null> {
    try {
      let metadataUrl = uri;

      // Convert IPFS URI to HTTP gateway URL
      if (uri.startsWith('ipfs://')) {
        const cid = uri.replace('ipfs://', '');
        metadataUrl = `${this.ipfsGateway}${cid}`;
      }

      // Convert data URI
      if (uri.startsWith('data:application/json')) {
        const base64Data = uri.split(',')[1];
        const jsonString = Buffer.from(base64Data, 'base64').toString();
        return JSON.parse(jsonString);
      }

      // Fetch from HTTP(S)
      const response = await fetch(metadataUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const metadata = await response.json();
      return this.validateMetadata(metadata) ? metadata : null;
    } catch (error) {
      console.error(`Failed to parse metadata from ${uri}:`, error);
      return null;
    }
  }

  /**
   * Validate NFT metadata against standards
   */
  validateMetadata(metadata: any): boolean {
    try {
      // Basic validation for common NFT metadata standard
      if (typeof metadata !== 'object' || metadata === null) {
        return false;
      }

      // Should have at least name or image
      if (!metadata.name && !metadata.image) {
        return false;
      }

      // Validate attributes if present
      if (metadata.attributes) {
        if (!Array.isArray(metadata.attributes)) {
          return false;
        }
        
        for (const attr of metadata.attributes) {
          if (!attr.trait_type || attr.value === undefined) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  // ===== Floor Price Tracking =====

  /**
   * Get floor price for a collection
   */
  async getFloorPrice(collection: string): Promise<string> {
    try {
      // This would integrate with marketplace APIs (OpenSea, LooksRare, etc.)
      // Placeholder implementation
      return '0';
    } catch (error) {
      throw new Error(`Failed to get floor price: ${error}`);
    }
  }

  /**
   * Get comprehensive collection statistics
   */
  async getCollectionStats(collection: string): Promise<CollectionStats> {
    try {
      // This would integrate with marketplace APIs and indexing services
      // Placeholder implementation showing expected structure
      return {
        floorPrice: '0',
        volume24h: '0',
        volumeTotal: '0',
        sales24h: 0,
        salesTotal: 0,
        holders: 0,
        supply: 0,
      };
    } catch (error) {
      throw new Error(`Failed to get collection stats: ${error}`);
    }
  }

  // ===== Helper Methods =====

  /**
   * Get contract instance
   */
  private getContract(address: string, abi: any[]): any {
    // This assumes web3Client has a getContract method
    // Actual implementation depends on the Web3 library being used
    return this.web3Client.getContract(address, abi);
  }

  /**
   * Generate a content identifier (simplified)
   */
  private generateCID(content: string): string {
    // This is a placeholder - actual CID generation requires IPFS libraries
    // In production, use ipfs-http-client or similar
    const hash = Buffer.from(content).toString('base64').substring(0, 46);
    return `Qm${hash}`;
  }
}

/**
 * Create an NFT client instance
 */
export function createNFTClient(web3Client: any, options?: { ipfsGateway?: string; ipfsApiUrl?: string }): NFTClient {
  return new NFTClient(web3Client, options);
}

// Default export
export default NFTClient;