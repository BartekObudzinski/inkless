import * as net from 'net';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';

const RAW_SOCKET_PORT = 9100;

export interface RawPrintResult {
  success: boolean;
  bytesSent?: number;
  error?: string;
}

export class RawSocketClient {
  private host: string;
  private port: number;

  constructor(host: string, port: number = RAW_SOCKET_PORT) {
    this.host = host;
    this.port = port;
  }

  async testConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(this.port, this.host);
    });
  }

  async printFile(filePath: string): Promise<RawPrintResult> {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const data = fs.readFileSync(filePath);
    return this.printData(data);
  }

  async printData(data: Buffer): Promise<RawPrintResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let bytesSent = 0;

      socket.setTimeout(30000);

      socket.on('connect', () => {
        logger.info(`Connected to raw socket ${this.host}:${this.port}`);

        socket.write(data, (err) => {
          if (err) {
            socket.destroy();
            resolve({ success: false, error: err.message });
            return;
          }

          bytesSent = data.length;
          logger.debug(`Sent ${bytesSent} bytes`);

          // End the connection after sending
          socket.end(() => {
            logger.success(`Data sent successfully (${bytesSent} bytes)`);
            resolve({ success: true, bytesSent });
          });
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, error: 'Connection timeout' });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({ success: false, error: err.message });
      });

      socket.connect(this.port, this.host);
    });
  }

  async printStream(readStream: fs.ReadStream): Promise<RawPrintResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let bytesSent = 0;

      socket.setTimeout(60000);

      socket.on('connect', () => {
        logger.info(`Connected to raw socket ${this.host}:${this.port}`);

        readStream.on('data', (chunk) => {
          bytesSent += Buffer.isBuffer(chunk) ? chunk.length : Buffer.from(chunk).length;
        });

        readStream.on('error', (err) => {
          socket.destroy();
          resolve({ success: false, error: `Read error: ${err.message}` });
        });

        readStream.pipe(socket);

        socket.on('finish', () => {
          logger.success(`Stream sent successfully (${bytesSent} bytes)`);
          resolve({ success: true, bytesSent });
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        readStream.destroy();
        resolve({ success: false, error: 'Connection timeout' });
      });

      socket.on('error', (err) => {
        socket.destroy();
        readStream.destroy();
        resolve({ success: false, error: err.message });
      });

      socket.connect(this.port, this.host);
    });
  }
}

export async function testRawSocket(
  host: string,
  port: number = RAW_SOCKET_PORT
): Promise<{ success: boolean; error?: string }> {
  logger.info(`Testing raw socket connection to ${host}:${port}...`);

  const client = new RawSocketClient(host, port);
  const connected = await client.testConnection();

  if (connected) {
    logger.success(`Raw socket connection successful`);
    return { success: true };
  }

  return { success: false, error: 'Connection failed' };
}
