# Cypher Blockchain Node Dockerfile
# This creates a containerized blockchain node for the Cypher network

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy blockchain source code from parent directory
# This includes the core blockchain implementation
COPY ../api/lib/blockchain ./lib/blockchain

# Copy node runner and configuration
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Expose ports:
# - Port 8333: P2P networking for blockchain node communication
#   Used for peer discovery, block propagation, and transaction broadcasting
# - Port 3000: REST API endpoint
#   Provides HTTP interface for querying blockchain data and submitting transactions
EXPOSE 8333 3000

# Health check to monitor node status
# Checks every 30 seconds if the node is responsive
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Environment variables for configuration:
# - NODE_ENV: Set to 'production' for production deployment
# - BLOCKCHAIN_DATA_DIR: Directory for persistent blockchain data (default: /app/data)
# - GENESIS_PEERS: Comma-separated list of initial peer addresses
# - MAX_PEERS: Maximum number of concurrent peer connections
# - MINING_ENABLED: Enable/disable mining on this node
# - API_PORT: Override default API port (default: 3000)
# - P2P_PORT: Override default P2P port (default: 8333)
#
# Volume mounting for persistent blockchain data:
# Mount a volume at /app/data to persist blockchain state across container restarts
# Example: docker run -v /host/path/data:/app/data cypher-node
#
# Recommended volume mounts:
# - /app/data: Blockchain database and state
# - /app/logs: Node logs for debugging and monitoring
# - /app/config: Custom configuration files

# Run the blockchain node
CMD ["node", "dist/index.js"]