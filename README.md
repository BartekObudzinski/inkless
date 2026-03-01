# Canon Print CLI

A driverless printing solution for Canon printers (tested with G3410). Print documents without installing proprietary drivers using standard protocols.

## Features

- **Driverless Printing** - No Canon drivers required
- **Multiple Protocols** - IPP, Raw Socket (port 9100), BJNP (port 8611)
- **Auto-Discovery** - Find printers on your network via mDNS/Bonjour
- **Port Scanning** - Detect available protocols on any printer IP
- **File Conversion** - Automatic conversion via Ghostscript when needed
- **Docker BJNP Support** - Print via BJNP protocol using containerized CUPS

## Requirements

- Node.js 18+
- Optional: Ghostscript (for file conversion)
- Optional: Docker (for BJNP printing)

## Installation

```bash
npm install
npm run build
```

## Usage

### Discover Printers

```bash
# Find all printers on the network
npx ts-node src/index.ts discover

# Include BJNP device scan
npx ts-node src/index.ts discover --bjnp
```

### Scan Printer Protocols

```bash
# Check which protocols a printer supports
npx ts-node src/index.ts scan 192.168.1.100
```

### Test IPP Connection

```bash
# Verify IPP connectivity and get printer capabilities
npx ts-node src/index.ts test-ipp 192.168.1.100
```

### Print a File

```bash
# Print via IPP (default)
npx ts-node src/index.ts print document.pdf -h 192.168.1.100

# Print via Raw Socket
npx ts-node src/index.ts print document.pdf -h 192.168.1.100 -p raw

# Print via BJNP (requires Docker setup)
npx ts-node src/index.ts print document.pdf -h 192.168.1.100 -p bjnp

# With file conversion
npx ts-node src/index.ts print document.docx -h 192.168.1.100 --convert
```

### Setup BJNP (Docker)

```bash
# Build Docker image and configure BJNP printing
npx ts-node src/index.ts setup-bjnp 192.168.1.100
```

### Check System Status

```bash
npx ts-node src/index.ts status
```

## Project Structure

```
├── src/
│   ├── index.ts              # CLI entry point
│   ├── discovery/
│   │   ├── mdns-discovery.ts # mDNS/Bonjour printer discovery
│   │   ├── bjnp-discovery.ts # BJNP protocol discovery
│   │   └── port-scanner.ts   # Protocol port scanning
│   ├── protocols/
│   │   ├── ipp-client.ts     # IPP protocol client
│   │   ├── raw-socket-client.ts # Raw socket (9100) client
│   │   └── bjnp-docker-client.ts # BJNP via Docker/CUPS
│   ├── conversion/
│   │   ├── ghostscript.ts    # Ghostscript file conversion
│   │   └── mime-detector.ts  # MIME type detection
│   └── utils/
│       └── logger.ts         # Logging utilities
├── docker/
│   └── Dockerfile            # CUPS with BJNP backend
├── examples/
│   └── hello-world-print.ts  # Example usage
└── gui/                      # Tauri desktop GUI (WIP)
```

## Supported Protocols

| Protocol | Port | Description |
|----------|------|-------------|
| IPP | 631 | Internet Printing Protocol - recommended |
| Raw | 9100 | Raw socket / JetDirect |
| BJNP | 8611 | Canon proprietary protocol |

## Troubleshooting

**No printers found:**
- Ensure the printer is powered on and connected to WiFi
- Check that your computer is on the same network
- Try scanning a specific IP: `npx ts-node src/index.ts scan <ip>`

**IPP connection failed:**
- Some Canon printers require IPP to be enabled in settings
- Try accessing the printer's web interface at `http://<printer-ip>`

**BJNP not working:**
- Ensure Docker is installed and running
- Run `setup-bjnp` command first

## License

MIT
