# NestOS

> 🏠 A modern, user-friendly home server operating system built with TypeScript and Debian

NestOS is designed to make home server management simple and beautiful. It provides an intuitive web interface for managing storage, containers, and network services, all while maintaining the power and flexibility of a Debian-based system.

## ✨ Features

- 🎨 Modern, intuitive web interface
- 💾 Smart storage management
- 🐳 Docker container orchestration
- 🌐 Network service management
- 📊 Real-time system monitoring
- 🔒 Security-focused design
- 🔄 Live system updates
- 📱 Mobile-responsive interface

## 📸 Screenshots

<div align="center">

### Dashboard
![Dashboard](docs/assets/screenshots/dashboard.png)
*Real-time system monitoring and overview*

### Docker Management
![Docker](docs/assets/screenshots/docker.png)
*Container management and orchestration*

### Network Configuration
![Network](docs/assets/screenshots/network.png)
*Network interfaces and services management*

### Storage Management
![Storage](docs/assets/screenshots/storage.png)
*Disk management and volume control*

### System Settings
![Settings](docs/assets/screenshots/settings.png)
*System configuration and preferences*

</div>

## 🚧 Development Status

> ⚠️ **Active Development**: NestOS is currently under heavy development and is not ready for production use. Features and APIs may change significantly.

Current focus areas:

- Core system architecture
- Storage management
- Docker integration
- Network configuration
- System monitoring

## 🚀 Quick Start

Prerequisites:

- Node.js 20+
- Docker & Docker Compose
- Git

```bash
# Clone repository
git clone https://github.com/moderniselife/nestos.git
cd nestos

# Setup development environment
chmod +x setup.sh
./setup.sh

# Start development environment
npm run dev
# or with Docker
npm run docker:dev
```

Access:

- Web UI: https://localhost:8443
- API: http://localhost:3000

## 🏗️ Project Structure

```
nestos/
├── packages/
│   ├── control-panel/    # React frontend
│   ├── system-service/   # Node.js backend
│   └── iso-builder/     # ISO/USB builder
```

## 🛠️ Technology Stack

- Frontend:

  - React with TypeScript
  - Material-UI
  - Real-time updates
  - Responsive design

- Backend:

  - Node.js with TypeScript
  - Fastify
  - System integration
  - WebSocket support

- Base System:

  - Debian-based
  - Docker support
  - Hardware monitoring
  - Network management

## 🤝 Contributing

We welcome contributions! As this project is under active development, there are many areas where you can help:

- Core Features
- Testing
- Documentation
- UI/UX
- Bug Fixes

## 📝 License

MIT License - See [LICENSE](LICENSE)

---

<div align="center">
Made with ❤️ for home server enthusiasts
</div>
