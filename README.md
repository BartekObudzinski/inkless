# Inkless

Driverless printing CLI for network printers. Works with any IPP/AirPrint compatible printer (HP, Epson, Brother, Canon, Xerox, and more).

## Features

- **Driverless Printing** - No manufacturer drivers required
- **Multiple Protocols** - IPP (port 631), Raw Socket (port 9100)
- **Auto-Discovery** - Find printers on your network via mDNS/Bonjour
- **Port Scanning** - Detect available protocols on any printer IP
- **File Conversion** - Automatic conversion via Ghostscript when needed
- **Desktop GUI** - Native app built with Tauri (WIP)

## Compatibility

| Protocol | Port | Compatibility |
|----------|------|---------------|
| IPP | 631 | Universal - most modern network printers |
| Raw | 9100 | Universal - JetDirect compatible printers |

## Requirements

- Node.js 18+
- Optional: Ghostscript (for file conversion)

## Installation

```bash
npm install
npm run build
```

## Usage

### Discover Printers

```bash
inkless discover
```

### Scan Printer Protocols

```bash
inkless scan 192.168.1.100
```

### Test IPP Connection

```bash
inkless test-ipp 192.168.1.100
```

### Print a File

```bash
# Print via IPP (default)
inkless print document.pdf -h 192.168.1.100

# Print via Raw Socket
inkless print document.pdf -h 192.168.1.100 -p raw

# With file conversion
inkless print document.docx -h 192.168.1.100 --convert
```

### Check System Status

```bash
inkless status
```

## GUI

Desktop application built with [Tauri](https://tauri.app/). Located in `gui/` directory.

```bash
cd gui/inkless-gui
npm install
npm run tauri dev
```

## Troubleshooting

**No printers found:**
- Ensure the printer is powered on and connected to WiFi
- Check that your computer is on the same network
- Try scanning a specific IP: `inkless scan <ip>`

**IPP connection failed:**
- Some printers require IPP to be enabled in settings
- Try accessing the printer's web interface at `http://<printer-ip>`

## License

MIT
