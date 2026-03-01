import * as dgram from 'dgram';
import { logger } from '../utils/logger.js';

export interface BJNPDevice {
  ip: string;
  port: number;
  model?: string;
  serial?: string;
}

const BJNP_PORT = 8611;
const BJNP_BROADCAST = '255.255.255.255';

// BJNP discovery packet header
// Protocol: BJNP (Binary JPEG Network Protocol)
const BJNP_DISCOVER_HEADER = Buffer.from([
  0x42, 0x4a, 0x4e, 0x50, // "BJNP" magic
  0x01,                   // Command type: discover
  0x00,                   // Session ID (low)
  0x00, 0x00,             // Sequence number
  0x00, 0x00, 0x00, 0x00, // Payload length (0 for discovery)
]);

export async function discoverBJNP(
  timeout: number = 3000
): Promise<BJNPDevice[]> {
  const devices: BJNPDevice[] = [];
  const seen = new Set<string>();

  logger.info('Discovering Canon printers via BJNP broadcast...');

  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');

    socket.on('error', (err) => {
      logger.error(`BJNP socket error: ${err.message}`);
      socket.close();
      resolve(devices);
    });

    socket.on('message', (msg, rinfo) => {
      if (seen.has(rinfo.address)) return;
      seen.add(rinfo.address);

      // Validate BJNP response (starts with "BJNP")
      if (msg.length >= 4 && msg.toString('ascii', 0, 4) === 'BJNP') {
        const device: BJNPDevice = {
          ip: rinfo.address,
          port: BJNP_PORT,
        };

        // Parse model info from response if available
        if (msg.length > 16) {
          try {
            const payloadStart = 16;
            const payload = msg.slice(payloadStart);
            const modelStr = payload.toString('utf8').replace(/\0/g, '').trim();
            if (modelStr) {
              device.model = modelStr;
            }
          } catch {
            // Ignore parsing errors
          }
        }

        logger.success(`Found BJNP device: ${device.ip}${device.model ? ` (${device.model})` : ''}`);
        devices.push(device);
      }
    });

    socket.bind(() => {
      socket.setBroadcast(true);

      // Send discovery packet
      socket.send(BJNP_DISCOVER_HEADER, BJNP_PORT, BJNP_BROADCAST, (err) => {
        if (err) {
          logger.error(`Failed to send BJNP discovery: ${err.message}`);
        } else {
          logger.debug('BJNP discovery packet sent');
        }
      });
    });

    setTimeout(() => {
      socket.close();
      if (devices.length === 0) {
        logger.warn('No BJNP devices found');
      }
      resolve(devices);
    }, timeout);
  });
}

export async function probeBJNP(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let responded = false;

    socket.on('error', () => {
      socket.close();
      resolve(false);
    });

    socket.on('message', (msg) => {
      if (msg.length >= 4 && msg.toString('ascii', 0, 4) === 'BJNP') {
        responded = true;
        socket.close();
        resolve(true);
      }
    });

    socket.send(BJNP_DISCOVER_HEADER, BJNP_PORT, host, (err) => {
      if (err) {
        socket.close();
        resolve(false);
      }
    });

    setTimeout(() => {
      if (!responded) {
        socket.close();
        resolve(false);
      }
    }, 2000);
  });
}
