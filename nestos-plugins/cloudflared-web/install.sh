#!/bin/bash

# Create data directories
mkdir -p /var/lib/nestos/plugins/cloudflared-web/data
mkdir -p /var/lib/nestos/plugins/cloudflared-web/certs

# Generate random password if not set
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 12)
fi

# Create default configuration
cat > /var/lib/nestos/plugins/cloudflared-web/.env << EOL
WEB_PORT=3001
CLOUDFLARED_PORT=3002
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ENABLE_HTTPS=false
HTTPS_PORT=3003
DATA_DIR=/var/lib/nestos/plugins/cloudflared-web
EOL

# Start the container
docker compose up -d