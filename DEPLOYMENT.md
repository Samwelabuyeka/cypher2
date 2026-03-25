# CypherCoin Deployment Guide

## Architecture Overview

CypherCoin runs as a peer-to-peer network of independent nodes. No central server controls the blockchain.

### Node Types

1. **Bootstrap Nodes** - Help new nodes discover the network
2. **Validator Nodes** - Mine blocks and validate transactions
3. **Regular Nodes** - Store blockchain data and relay transactions

## Deployment Options

### Option 1: Cloud VPS (Recommended for Production)

**Providers:** DigitalOcean, AWS EC2, Google Cloud, Linode

**Requirements per node:**
- 2 vCPUs
- 4GB RAM
- 100GB SSD
- Ubuntu 22.04 LTS

**Setup:**
```bash
# SSH into your server
ssh root@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone your repository
git clone https://github.com/your-repo/cypher-blockchain.git
cd cypher-blockchain/standalone-node

# Install dependencies
npm install

# Run as validator
npm run validator -- --mining-address YOUR_ADDRESS
```

### Option 2: Docker Containers

```bash
# Build and run
docker build -t cypher-node .
docker run -d -p 8333:8333 -p 3000:3000 \
  -e VALIDATOR=true \
  -e MINING_ADDRESS=0x... \
  --name cypher-validator \
  cypher-node
```

### Option 3: Kubernetes (For Large Scale)

See `k8s/` directory for Kubernetes manifests.

## Network Bootstrap Process

### Step 1: Deploy Bootstrap Nodes (3-5 nodes)

Deploy in different regions:
- US East (New York)
- US West (San Francisco)  
- Europe (London)
- Asia (Singapore)

### Step 2: Deploy Validator Nodes (50+ nodes)

Minimum stake: 10,000 CYP per validator

### Step 3: Allow Public Nodes

Anyone can run a node and connect to the network.

## Your Founder Allocation

Your **500,000 CYP** is coded into the genesis block. When you deploy:

1. The genesis block creates your allocation
2. Your founder address holds the coins
3. You control them with your private key

## Making CYP Publicly Tradeable

### 1. Launch Public Nodes
```bash
# Deploy 10+ nodes globally
for i in {1..10}; do
  # Deploy to different cloud providers
done
```

### 2. Create Public Endpoints
- `rpc.cyphercoin.network` - RPC endpoint
- `explorer.cyphercoin.network` - Block explorer
- `wallet.cyphercoin.network` - Web wallet

### 3. Exchange Listings

Once network is stable:
- Apply to decentralized exchanges (Uniswap, PancakeSwap)
- Apply to centralized exchanges (Binance, Coinbase)

## Monitoring Your Network

```bash
# Check node status
curl http://localhost:3000/status

# Check connected peers
curl http://localhost:3000/peers

# Check your balance
curl http://localhost:3000/balance/YOUR_ADDRESS
```

## Cost Estimation

**Bootstrap Network (5 nodes):** ~$100/month
**Validator Network (50 nodes):** ~$1,000/month
**Full Production Network:** $2,000-5,000/month

As the network grows, community validators will reduce your costs to $0.

## Security Best Practices

1. Use SSH keys, not passwords
2. Enable firewall (allow only 8333, 3000)
3. Keep nodes updated
4. Monitor for attacks
5. Use SSL/TLS for API endpoints

## Next Steps

1. Deploy 3 bootstrap nodes
2. Deploy 10 validator nodes  
3. Test the network
4. Open to public participation
5. List on exchanges

## Estimated Timeline

- Week 1: Deploy test network (5 nodes)
- Week 2-3: Test and secure
- Week 4: Deploy production network (50+ nodes)
- Month 2: Open to public
- Month 3: Exchange listings

**Your $500,000 CYP becomes real tradeable value!**