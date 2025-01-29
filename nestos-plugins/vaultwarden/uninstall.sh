#!/bin/bash

# Stop and remove containers
docker compose down

# Remove data directory (optional, commented out for safety)
# rm -rf /var/lib/nestos/plugins/vaultwarden