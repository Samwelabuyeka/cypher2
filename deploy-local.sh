#!/bin/bash

# CypherCoin Local Network Deployment Script
# This deploys a complete blockchain network on your local machine

set -e

echo "🚀 CypherCoin Local Network Deployment"
echo "======================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Navigate to standalone-node directory
cd standalone-node

echo "📦 Building blockchain node Docker image..."
docker-compose build

echo ""
echo "🌐 Starting blockchain network..."
echo "   - 1 Bootstrap node"
echo "   - 2 Validator nodes (mining blocks)"
echo "   - 1 Regular node"
echo ""

docker-compose up -d

echo ""
echo "✅ Network is starting up!"
echo ""
echo "📊 Node endpoints:"
echo "   Bootstrap Node:  http://localhost:3000"
echo "   Validator 1:     http://localhost:3001"
echo "   Validator 2:     http://localhost:3002"
echo "   Regular Node:    http://localhost:3003"
echo ""
echo "🔍 Check node status:"
echo "   curl http://localhost:3000/status"
echo ""
echo "📜 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop network:"
echo "   docker-compose down"
echo ""
echo "🎉 Your decentralized blockchain is now running!"
echo "   Your 500,000 CYP founder allocation is in the genesis block."
echo ""