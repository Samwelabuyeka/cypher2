# CypherCoin Standalone Node

## Overview
Run your own CypherCoin blockchain node and participate in the decentralized network.

## Requirements
- Node.js 18+
- 2GB RAM minimum
- 50GB disk space
- Open port for P2P communication

## Quick Start

### Install Dependencies
```bash
cd standalone-node
npm install
```

### Run a Validator Node
```bash
npm run validator -- --mining-address YOUR_ADDRESS --bootstrap bootstrap.cyphercoin.network:8333
```

### Run a Regular Node
```bash
npm start -- --bootstrap bootstrap.cyphercoin.network:8333
```

## Configuration Options

- `--port` - P2P network port (default: 8333)
- `--api-port` - REST API port (default: 3000)
- `--validator` - Enable validator mode (default: false)
- `--mining-address` - Address to receive mining rewards
- `--bootstrap` - Comma-separated list of bootstrap nodes
- `--data-dir` - Directory for blockchain data (default: ./data)

## API Endpoints

### GET /status
Get node status and blockchain info

### GET /blocks
Get all blocks in the chain

### GET /blocks/:hash
Get specific block by hash

### POST /transactions
Submit a new transaction
```json
{
  "from": "0x...",
  "to": "0x...",
  "value": 100,
  "signature": "..."
}
```

### GET /balance/:address
Get account balance for an address

### GET /peers
Get list of connected peers

## Running Multiple Nodes

To create a local test network:

```bash
# Terminal 1 - Bootstrap node
npm start -- --port 8333 --api-port 3000

# Terminal 2 - Validator node
npm run validator -- --port 8334 --api-port 3001 --mining-address 0x123 --bootstrap localhost:8333

# Terminal 3 - Regular node
npm start -- --port 8335 --api-port 3002 --bootstrap localhost:8333
```

## Production Deployment

### Using Docker
```bash
docker build -t cypher-node .
docker run -p 8333:8333 -p 3000:3000 cypher-node --bootstrap bootstrap.cyphercoin.network:8333
```

### Using PM2
```bash
pm2 start index.ts --name cypher-node -- --bootstrap bootstrap.cyphercoin.network:8333
```

## Becoming a Validator

1. Stake minimum 10,000 CYP
2. Run node with `--validator true`
3. Ensure 99.9% uptime
4. Keep node software updated

## Support

Join our Discord: https://discord.gg/cyphercoin
Docs: https://docs.cyphercoin.network