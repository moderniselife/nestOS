#!/bin/bash

# Create necessary directories
mkdir -p /var/lib/nestos/plugins/plex/{config,transcode,media/{movies,tv,music}}

# Get host IP
HOST_IP=$(hostname -I | awk '{print $1}')

# Create default configuration
cat > /var/lib/nestos/plugins/plex/.env << EOL
TIMEZONE=$(timedatectl show --property=Timezone --value)
HOST_IP=$HOST_IP
CONFIG_DIR=/var/lib/nestos/plugins/plex
TRANSCODE_DIR=/var/lib/nestos/plugins/plex
MEDIA_DIR=/var/lib/nestos/plugins/plex/media
EOL

# Print instructions
echo "Please visit https://www.plex.tv/claim to get your claim token"
echo "Then edit /var/lib/nestos/plugins/plex/.env and add:"
echo "PLEX_CLAIM=your-claim-token"

# Start the container
docker compose up -d