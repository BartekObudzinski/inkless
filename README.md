# Inkless

Driverless printing CLI for network printers. Works with any IPP/AirPrint compatible printer (HP, Epson, Brother, Canon, Xerox, and more). Tested with Canon G3410.

## Features

- **Driverless Printing** - No manufacturer drivers required
- **Multiple Protocols** - IPP, Raw Socket (port 9100), BJNP (port 8611)
- **Auto-Discovery** - Find printers on your network via mDNS/Bonjour
- **Port Scanning** - Detect available protocols on any printer IP
- **File Conversion** - Automatic conversion via Ghostscript when needed
- **Docker BJNP Support** - Print via BJNP protocol using containerized CUPS (Canon only)

## Compatibility

| Protocol | Port | Compatibility |
|----------|------|---------------|
| IPP | 631 | Universal - most modern network printers |
| Raw | 9100 | Universal - JetDirect compatible printers |
| BJNP | 8611 | Canon only |

**Tested with:** Canon G3410, but should work with any printer supporting IPP or Raw Socket protocols.

## Requirements

- Node.js 18+
- Optional: Ghostscript (for file conversion)
- Optional: Docker (for BJNP printing - Canon only)

## Installation

```bash
npm install
npm run build
```

## Usage

### Discover Printers

```bash
# Find all printers on the network
inkless discover

# Include BJNP device scan (Canon only)
inkless discover --bjnp
```

### Scan Printer Protocols

```bash
# Check which protocols a printer supports
inkless scan 192.168.1.100
```

### Test IPP Connection

```bash
# Verify IPP connectivity and get printer capabilities
inkless test-ipp 192.168.1.100
```

### Print a File

```bash
# Print via IPP (default, works with most printers)
inkless print document.pdf -h 192.168.1.100

# Print via Raw Socket
inkless print document.pdf -h 192.168.1.100 -p raw

# Print via BJNP (Canon only, requires Docker)
inkless print document.pdf -h 192.168.1.100 -p bjnp

# With file conversion
inkless print document.docx -h 192.168.1.100 --convert
```

### Setup BJNP (Docker, Canon only)

```bash
# Build Docker image and configure BJNP printing
inkless setup-bjnp 192.168.1.100
```

### Check System Status

```bash
inkless status
```

## Project Structure

```
├── src/
│   ├── index.ts              # CLI entry point
│   ├── discovery/
│   │   ├── mdns-discovery.ts # mDNS/Bonjour printer discovery
│   │   ├── bjnp-discovery.ts # BJNP protocol discovery (Canon)
│   │   └── port-scanner.ts   # Protocol port scanning
│   ├── protocols/
│   │   ├── ipp-client.ts     # IPP protocol client
│   │   ├── raw-socket-client.ts # Raw socket (9100) client
│   │   └── bjnp-docker-client.ts # BJNP via Docker/CUPS (Canon)
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

## Troubleshooting

**No printers found:**
- Ensure the printer is powered on and connected to WiFi
- Check that your computer is on the same network
- Try scanning a specific IP: `inkless scan <ip>`

**IPP connection failed:**
- Some printers require IPP to be enabled in settings
- Try accessing the printer's web interface at `http://<printer-ip>`

**BJNP not working:**
- BJNP is Canon-specific protocol
- Ensure Docker is installed and running
- Run `inkless setup-bjnp` command first

## License

MIT
