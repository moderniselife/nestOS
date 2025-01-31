#!/bin/bash

# Stop and remove containers
docker compose down

# Optionally remove data directory (commented out for safety)
# rm -rf /var/lib/nestos/plugins/cloudflared-web