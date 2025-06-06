#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Setting up NestOS development environment...${NC}"

# Check for required tools
echo -e "\n${BLUE}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 20 or later.${NC}"
    exit 1
fi

# Install dependencies
echo -e "\n${BLUE}Installing dependencies...${NC}"
npm install

# Set up git hooks
echo -e "\n${BLUE}Setting up git hooks...${NC}"
if [ -d .git ]; then
    # Create hooks directory if it doesn't exist 
    mkdir -p .git/hooks
    
    # Get the full path to npm and node
    NPM_PATH=$(which npm)
    NODE_PATH=$(which node)
    
    # Pre-commit hook for linting
    cat > .git/hooks/pre-commit << EOF
#!/bin/sh

# Debug information
echo "Debug: Starting pre-commit hook"
echo "Debug: Current PATH=\$PATH"

# Get the git repo root directory
REPO_ROOT=\$(git rev-parse --show-toplevel)
echo "Debug: REPO_ROOT=\$REPO_ROOT"

# Change to the repo root directory
cd "\$REPO_ROOT"

# Export paths to node and npm
export PATH="$(dirname "$NODE_PATH"):\$PATH"
echo "Debug: Updated PATH=\$PATH"
echo "Debug: Node path: $NODE_PATH"
echo "Debug: NPM path: $NPM_PATH"

# Run lint command
echo "Debug: Running lint command..."
if ! "$NPM_PATH" run lint; then
    echo "Linting failed. Please fix the issues and try committing again."
    exit 1
fi

echo "Debug: Lint command completed successfully"
EOF
    chmod +x .git/hooks/pre-commit
fi

# Create necessary directories
echo -e "\n${BLUE}Creating build directories...${NC}"
mkdir -p packages/iso-builder/build
mkdir -p packages/iso-builder/templates/system
mkdir -p packages/control-panel/dist
mkdir -p packages/system-service/dist
mkdir -p packages/control-panel/ssl

# Generate development SSL certificates
echo -e "\n${BLUE}Generating development SSL certificates...${NC}"
mkdir -p .dev-certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout .dev-certs/private.key \
    -out .dev-certs/certificate.crt \
    -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"

# Copy SSL certificates to packages
cp .dev-certs/private.key packages/control-panel/ssl/
cp .dev-certs/certificate.crt packages/control-panel/ssl/

# Check if Docker is available
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo -e "\n${BLUE}Docker detected. You can start the development environment using either:${NC}"
    echo -e "1. Docker (recommended for full system features):"
    echo -e "   ${GREEN}npm run docker:dev${NC}"
    echo -e "\nOr"
    echo -e "2. Local development (limited system features):"
    echo -e "   ${GREEN}npm run dev${NC}"
else
    echo -e "\n${BLUE}Docker not detected. Starting in local development mode:${NC}"
    echo -e "   ${GREEN}npm run dev${NC}"
fi

echo -e "\n${BLUE}Development URLs:${NC}"
echo -e "Control Panel: ${GREEN}https://localhost:8443${NC}"
echo -e "System Service: ${GREEN}http://localhost:3000${NC}"

echo -e "\n${BLUE}Note: Some features may require Docker for full functionality.${NC}"
echo -e "${BLUE}The first startup may take a few minutes while dependencies are installed.${NC}"