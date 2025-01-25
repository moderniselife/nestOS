# NASOS

> ⚠️ **ACTIVE DEVELOPMENT**: This project is under heavy development and is not ready for production use. Breaking changes are expected.

A modern Network Attached Storage Operating System built with TypeScript and Debian.

## Development Status

Currently implementing core features:

- Storage Management (RAID, disk health)
- Docker Integration
- Web Interface
- System Monitoring
- Network Configuration

## Quick Start

Prerequisites:

- Node.js 20+
- Git

Optional (for full features):

- Docker & Docker Compose

```bash
# Clone repository
git clone https://github.com/moderniselife/nasos.git
cd nasos

# Setup development environment
chmod +x setup.sh
./setup.sh
```

### Development Options

1. Local Development (Limited Features):

```bash
npm run dev
```

2. Docker Development (Full Features):

```bash
npm run docker:dev
```

Access:

- Web UI: https://localhost:8443
- API: http://localhost:3000

## Project Structure

```
nasos/
├── packages/
│   ├── control-panel/    # React frontend
│   ├── system-service/   # Node.js backend
│   └── iso-builder/     # ISO/USB builder
```

## Features in Development

- Modern TypeScript/React web interface
- Secure HTTPS access
- Docker container management
- Advanced storage management
  - RAID configuration
  - Disk health monitoring
  - Volume management
- Network file sharing
  - SMB/NFS support
  - User management
  - Access control
- System monitoring
  - Real-time metrics
  - Hardware status
  - Resource usage
- Live system updates

## Development Notes

- Local development mode provides limited system features due to permission restrictions
- Docker development mode provides full system access for testing all features
- SSL certificates are automatically generated for development
- Hot-reloading is enabled for both frontend and backend
- TypeScript strict mode is enabled for better code quality

## Contributing

We welcome contributions! The project is in active development, so there are many areas where you can help:

- Core Features
- Testing
- Documentation
- UI/UX
- Bug Fixes

## License

MIT
