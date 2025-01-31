#!/bin/bash

# Create data directories
mkdir -p /var/lib/nestos/plugins/cloudflared-web/config

# Generate random password if not set
if [ -z "$BASIC_AUTH_PASS" ]; then
    BASIC_AUTH_PASS=$(openssl rand -base64 12)
fi

# Create default configuration
cat > /var/lib/nestos/plugins/cloudflared-web/.env << EOL
WEBUI_PORT=14333
EDGE_IP_VERSION=auto
PROTOCOL=auto
METRICS_ENABLE=false
METRICS_PORT=60123
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=${BASIC_AUTH_PASS}
DATA_DIR=/var/lib/nestos/plugins/cloudflared-web
EOL

# Start the container
docker compose up -d