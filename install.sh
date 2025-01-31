#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}NestOS Installation Script${NC}"
echo "=============================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# Function to print status
print_status() {
    echo -e "${BLUE}[*] $1...${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}[✓] $1${NC}"
}

# Update system
print_status "Updating system packages"
apt-get update
apt-get upgrade -y

# Install required packages
print_status "Installing required packages"
apt-get install -y \
    docker.io \
    nodejs \
    npm \
    curl \
    wget \
    git \
    mdadm \
    smartmontools \
    samba \
    nfs-kernel-server \
    network-manager \
    openssh-server

# Clone NestOS repository
print_status "Cloning NestOS repository"
git clone https://github.com/moderniselife/nestos.git /tmp/nestos
cd /tmp/nestos

# Build components
print_status "Building NestOS components"
npm install
npm run build

# Install NestOS components
print_status "Creating NestOS directories"
mkdir -p /opt/nestos/{system-service,control-panel}

# Copy built components
print_status "Installing system service"
cp -r packages/system-service/dist/* /opt/nestos/system-service/
print_status "Installing control panel"
cp -r packages/control-panel/dist/* /opt/nestos/control-panel/

# Clean up build files
rm -rf /tmp/nestos

# Setup Docker
print_status "Setting up Docker"
systemctl enable docker
systemctl start docker

# Create systemd service files
print_status "Creating systemd service files"

cat > /etc/systemd/system/nestos-system.service << EOL
[Unit]
Description=NestOS System Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nestos/system-service
ExecStart=/usr/bin/node /opt/nestos/system-service/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOL

cat > /etc/systemd/system/nestos-control-panel.service << EOL
[Unit]
Description=NestOS Control Panel
After=network.target nestos-system.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nestos/control-panel
ExecStart=/usr/bin/node /opt/nestos/control-panel/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOL

# Enable and start services
print_status "Enabling and starting NestOS services"
systemctl daemon-reload
systemctl enable nestos-system.service
systemctl enable nestos-control-panel.service
systemctl start nestos-system.service
systemctl start nestos-control-panel.service

# Configure network
print_status "Configuring network"
systemctl enable NetworkManager
systemctl start NetworkManager

# Final setup
print_status "Performing final setup"
# Set hostname
hostnamectl set-hostname nestos

print_success "NestOS installation completed!"
echo -e "${BLUE}You can access the control panel at http://localhost:8443${NC}"
echo -e "${BLUE}System service is running on port 3000${NC}"