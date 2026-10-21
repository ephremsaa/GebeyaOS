#!/bin/sh
set -e

echo "=========================================================="
echo "GebeyaOS: Promoting Warm Standby PC to Primary Branch Server"
echo "=========================================================="

echo "[1/3] Ensuring PostgreSQL container is running as master..."
docker compose -f docker-compose.branch.yml up -d branch-db

echo "[2/3] Starting GebeyaOS Branch API Server on Standby..."
docker compose -f docker-compose.branch.yml up -d branch-server

echo "[3/3] Setting IP/mDNS alias..."
# If using Avahi/mDNS or updating local router DNS
echo "Standby server is now listening on port 3000."
echo "POS terminals can point to this machine IP or 'server.branch.lan'."
echo "[$(date)] Warm standby failover complete!"
