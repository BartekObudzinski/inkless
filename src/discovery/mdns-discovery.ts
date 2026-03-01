import { Bonjour, Service } from 'bonjour-service';
import { logger } from '../utils/logger.js';

export interface DiscoveredPrinter {
  name: string;
  host: string;
  port: number;
  type: string;
  txt: Record<string, string>;
}

const SERVICE_TYPES = [
  '_ipp._tcp',
  '_ipps._tcp',
  '_pdl-datastream._tcp',
  '_printer._tcp',
];

export async function discoverPrinters(
  timeout: number = 5000
): Promise<DiscoveredPrinter[]> {
  const bonjour = new Bonjour();
  const printers: DiscoveredPrinter[] = [];
  const seen = new Set<string>();

  logger.info('Discovering printers via mDNS/Bonjour...');

  return new Promise((resolve) => {
    const browsers: ReturnType<typeof bonjour.find>[] = [];

    for (const type of SERVICE_TYPES) {
      const browser = bonjour.find({ type }, (service: Service) => {
        const key = `${service.host}:${service.port}`;
        if (seen.has(key)) return;
        seen.add(key);

        const txtRecord: Record<string, string> = {};
        if (service.txt) {
          for (const [k, v] of Object.entries(service.txt)) {
            txtRecord[k] = String(v);
          }
        }

        const printer: DiscoveredPrinter = {
          name: service.name,
          host: service.host || service.addresses?.[0] || '',
          port: service.port,
          type: type,
          txt: txtRecord,
        };

        // Filter for Canon devices
        const isCanon =
          printer.name.toLowerCase().includes('canon') ||
          txtRecord['mfg']?.toLowerCase().includes('canon') ||
          txtRecord['usb_MFG']?.toLowerCase().includes('canon');

        if (isCanon) {
          logger.success(`Found Canon printer: ${printer.name} at ${printer.host}:${printer.port}`);
        } else {
          logger.info(`Found printer: ${printer.name} at ${printer.host}:${printer.port}`);
        }

        printers.push(printer);
      });

      browsers.push(browser);
    }

    setTimeout(() => {
      for (const browser of browsers) {
        browser.stop();
      }
      bonjour.destroy();

      if (printers.length === 0) {
        logger.warn('No printers found via mDNS');
      } else {
        logger.success(`Found ${printers.length} printer(s)`);
      }

      resolve(printers);
    }, timeout);
  });
}

export function filterCanonPrinters(
  printers: DiscoveredPrinter[]
): DiscoveredPrinter[] {
  return printers.filter((p) => {
    const name = p.name.toLowerCase();
    const mfg = (p.txt['mfg'] || p.txt['usb_MFG'] || '').toLowerCase();
    return name.includes('canon') || mfg.includes('canon');
  });
}
