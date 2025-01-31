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

# Install Node.js 20
print_status "Setting up Node.js 20 repository"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# Install required packages
print_status "Installing required packages"
apt-get install -y \
    docker.io \
    nodejs \
    curl \
    wget \
    git \
    mdadm \
    smartmontools \
    samba \
    nfs-kernel-server \
    network-manager \
    openssh-server

# Verify Node.js version
NODE_VERSION=$(node --version)
MAJOR_VERSION=$(echo "$NODE_VERSION" | cut -d. -f1 | tr -d 'v')

if (( MAJOR_VERSION < 20 )); then
    echo -e "${RED}Node.js 20 or higher is required. Got version: $NODE_VERSION${NC}"
    exit 1
fi

# Clone NestOS repository
print_status "Cloning NestOS repository"
mkdir -p /opt/nestos
git clone https://github.com/moderniselife/nestos.git /opt/nestos

# Build components
print_status "Building NestOS components"
cd /opt/nestos
npm install
npm run build

# Setup Docker
print_status "Setting up Docker"
systemctl enable docker
systemctl start docker

# Create systemd service file
print_status "Creating systemd service file"

cat > /etc/systemd/system/nestos.service << EOL
[Unit]
Description=NestOS Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nestos
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOL

# Enable and start service
print_status "Enabling and starting NestOS service"
systemctl daemon-reload
systemctl enable nestos.service
systemctl start nestos.service

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