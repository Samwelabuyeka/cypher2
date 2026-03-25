#!/bin/bash

# CypherCoin Cloud Deployment Script
# Deploy blockchain nodes to cloud VPS servers

set -e

echo "☁️  CypherCoin Cloud Network Deployment"
echo "========================================"
echo ""

# Configuration
NODES_FILE="cloud-nodes.txt"

if [ ! -f "$NODES_FILE" ]; then
    echo "❌ $NODES_FILE not found!"
    echo ""
    echo "Please create $NODES_FILE with your server IPs:"
    echo ""
    echo "Format (one per line):"
    echo "bootstrap,user@ip-address"
    echo "validator,user@ip-address,mining-address"
    echo "regular,user@ip-address"
    echo ""
    echo "Example:"
    echo "bootstrap,root@203.0.113.1"
    echo "validator,root@203.0.113.2,0xYourMiningAddress"
    echo "regular,root@203.0.113.3"
    exit 1
fi

echo "📋 Reading node configuration from $NODES_FILE..."
echo ""

BOOTSTRAP_IP=""

while IFS=',' read -r node_type connection mining_address; do
    if [ "$node_type" = "bootstrap" ]; then
        BOOTSTRAP_IP=$(echo $connection | cut -d'@' -f2)
        break
    fi
done < "$NODES_FILE"

if [ -z "$BOOTSTRAP_IP" ]; then
    echo "❌ No bootstrap node found in configuration!"
    exit 1
fi

echo "✅ Bootstrap node: $BOOTSTRAP_IP"
echo ""

# Deploy to each server
while IFS=',' read -r node_type connection mining_address; do
    echo "🚀 Deploying $node_type node to $connection..."
    
    ssh $connection << 'ENDSSH'
# Update system
sudo apt-get update
sudo apt-get install -y git curl

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository (replace with your repo)
git clone https://github.com/YOUR_USERNAME/cypher-blockchain.git || (cd cypher-blockchain && git pull)
cd cypher-blockchain/standalone-node

# Install dependencies
npm install

# Build
npm run build
ENDSSH

    # Start the appropriate node type
    if [ "$node_type" = "bootstrap" ]; then
        ssh $connection "cd cypher-blockchain/standalone-node && nohup npm start > node.log 2>&1 &"
        echo "✅ Bootstrap node started"
    elif [ "$node_type" = "validator" ]; then
        ssh $connection "cd cypher-blockchain/standalone-node && nohup npm run validator -- --mining-address $mining_address --bootstrap $BOOTSTRAP_IP:8333 > node.log 2>&1 &"
        echo "✅ Validator node started (mining to $mining_address)"
    elif [ "$node_type" = "regular" ]; then
        ssh $connection "cd cypher-blockchain/standalone-node && nohup npm start -- --bootstrap $BOOTSTRAP_IP:8333 > node.log 2>&1 &"
        echo "✅ Regular node started"
    fi
    
    echo ""
    sleep 2
done < "$NODES_FILE"

echo "🎉 All nodes deployed!"
echo ""
echo "📊 Check status:"
while IFS=',' read -r node_type connection mining_address; do
    ip=$(echo $connection | cut -d'@' -f2)
    echo "   curl http://$ip:3000/status"
done < "$NODES_FILE"
echo ""