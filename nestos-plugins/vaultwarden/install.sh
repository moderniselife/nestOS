#!/bin/bash

# Create data directory
mkdir -p /var/lib/nestos/plugins/vaultwarden/data

# Create default configuration
cat > /var/lib/nestos/plugins/vaultwarden/.env << EOL
DOMAIN=http://localhost:8100
ALLOW_SIGNUPS=false
ADMIN_TOKEN=$(openssl rand -base64 48)
PORT=8100
DATA_DIR=/var/lib/nestos/plugins/vaultwarden
EOL

# Start the container
docker compose up -d