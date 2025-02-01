#!/bin/bash

# Create data directory
mkdir -p /var/lib/nestos/plugins/vscode-server/{config,data}

# Create default configuration
cat > /var/lib/nestos/plugins/vscode-server/.env << EOL
DOMAIN=http://localhost:8200
PASSWORD=nestos
PORT=8200
DATA_DIR=/var/lib/nestos/plugins/vscode-server
EOL

# Start the container
docker pull linuxserver/code-server
docker compose up -d