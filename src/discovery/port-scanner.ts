import * as net from 'net';
import { logger } from '../utils/logger.js';

export interface PortScanResult {
  port: number;
  protocol: string;
  service: string;
  open: boolean;
}

const PRINTER_PORTS: { port: number; protocol: string; service: string }[] = [
  { port: 631, protocol: 'TCP', service: 'IPP (Internet Printing Protocol)' },
  { port: 9100, protocol: 'TCP', service: 'AppSocket/JetDirect (Raw)' },
  { port: 8611, protocol: 'TCP', service: 'Canon BJNP (Proprietary)' },
  { port: 515, protocol: 'TCP', service: 'LPD/LPR' },
  { port: 80, protocol: 'TCP', service: 'HTTP (Web Interface)' },
  { port: 443, protocol: 'TCP', service: 'HTTPS (Web Interface)' },
];

async function checkPort(
  host: string,
  port: number,
  timeout: number = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      cleanup();
      resolve(true);
    });

    socket.on('timeout', () => {
      cleanup();
      resolve(false);
    });

    socket.on('error', () => {
      cleanup();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

export async function scanPorts(
  host: string,
  timeout: number = 2000
): Promise<PortScanResult[]> {
  logger.info(`Scanning ${host} for printer protocols...`);

  const results: PortScanResult[] = [];

  const scanPromises = PRINTER_PORTS.map(async ({ port, protocol, service }) => {
    const open = await checkPort(host, port, timeout);
    return { port, protocol, service, open };
  });

  const scanResults = await Promise.all(scanPromises);

  for (const result of scanResults) {
    results.push(result);
    if (result.open) {
      logger.success(`Port ${result.port}: ${result.service}`);
    } else {
      logger.debug(`Port ${result.port}: closed`);
    }
  }

  return results;
}

export function getOpenPorts(results: PortScanResult[]): PortScanResult[] {
  return results.filter((r) => r.open);
}

export function hasIPP(results: PortScanResult[]): boolean {
  return results.some((r) => r.port === 631 && r.open);
}

export function hasRawSocket(results: PortScanResult[]): boolean {
  return results.some((r) => r.port === 9100 && r.open);
}

export function hasBJNP(results: PortScanResult[]): boolean {
  return results.some((r) => r.port === 8611 && r.open);
}
