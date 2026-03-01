import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

const DOCKER_IMAGE = 'canon-bjnp-cups';
const CONTAINER_NAME = 'canon-bjnp-print';

export interface BJNPPrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export class BJNPDockerClient {
  private printerIP: string;
  private dockerAvailable: boolean = false;

  constructor(printerIP: string) {
    this.printerIP = printerIP;
    this.checkDocker();
  }

  private checkDocker(): void {
    try {
      execSync('docker --version', { stdio: 'pipe' });
      this.dockerAvailable = true;
    } catch {
      this.dockerAvailable = false;
    }
  }

  isDockerAvailable(): boolean {
    return this.dockerAvailable;
  }

  async buildImage(): Promise<boolean> {
    if (!this.dockerAvailable) {
      logger.error('Docker is not available');
      return false;
    }

    const dockerfilePath = path.join(process.cwd(), 'docker', 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      logger.error('Dockerfile not found. Creating it...');
      this.createDockerfile();
    }

    logger.info('Building BJNP Docker image...');

    try {
      execSync(`docker build -t ${DOCKER_IMAGE} ./docker`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      logger.success('Docker image built successfully');
      return true;
    } catch (err) {
      logger.error(`Failed to build Docker image: ${err}`);
      return false;
    }
  }

  private createDockerfile(): void {
    const dockerDir = path.join(process.cwd(), 'docker');
    if (!fs.existsSync(dockerDir)) {
      fs.mkdirSync(dockerDir, { recursive: true });
    }

    const dockerfile = `FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \\
    cups \\
    cups-client \\
    cups-bsd \\
    cups-backend-bjnp \\
    ghostscript \\
    libcups2 \\
    && rm -rf /var/lib/apt/lists/* \\
    && mkdir -p /var/run/cups

# Configure CUPS to allow remote connections
RUN sed -i 's/Listen localhost:631/Listen 0.0.0.0:631/' /etc/cups/cupsd.conf && \\
    sed -i 's/<Location \\/>/<Location \\/>\\n  Allow All/' /etc/cups/cupsd.conf && \\
    sed -i 's/<Location \\/admin>/<Location \\/admin>\\n  Allow All/' /etc/cups/cupsd.conf

EXPOSE 631

CMD ["/usr/sbin/cupsd", "-f"]
`;

    fs.writeFileSync(path.join(dockerDir, 'Dockerfile'), dockerfile);
    logger.success('Dockerfile created');
  }

  async startContainer(): Promise<boolean> {
    if (!this.dockerAvailable) {
      logger.error('Docker is not available');
      return false;
    }

    // Check if container already exists
    try {
      const existing = execSync(`docker ps -aq -f name=${CONTAINER_NAME}`, {
        encoding: 'utf8',
      }).trim();

      if (existing) {
        // Stop and remove existing container
        execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' });
      }
    } catch {
      // Container doesn't exist
    }

    logger.info('Starting BJNP Docker container...');

    try {
      execSync(
        `docker run -d --name ${CONTAINER_NAME} ` +
          `--network host ` +
          `-v /tmp/canon-print:/tmp/canon-print ` +
          `${DOCKER_IMAGE}`,
        { stdio: 'pipe' }
      );

      // Wait for CUPS to start
      await this.sleep(2000);

      logger.success('Container started');
      return true;
    } catch (err) {
      logger.error(`Failed to start container: ${err}`);
      return false;
    }
  }

  async setupPrinter(printerName: string = 'CanonG3410'): Promise<boolean> {
    logger.info(`Setting up printer ${printerName} via BJNP...`);

    const bjnpUri = `bjnp://${this.printerIP}:8611`;

    try {
      // Add printer using lpadmin
      execSync(
        `docker exec ${CONTAINER_NAME} lpadmin -p ${printerName} ` +
          `-v "${bjnpUri}" ` +
          `-m everywhere ` +
          `-E`,
        { stdio: 'pipe' }
      );

      // Set as default
      execSync(`docker exec ${CONTAINER_NAME} lpoptions -d ${printerName}`, {
        stdio: 'pipe',
      });

      logger.success(`Printer ${printerName} configured`);
      return true;
    } catch (err) {
      logger.error(`Failed to setup printer: ${err}`);
      return false;
    }
  }

  async print(
    filePath: string,
    printerName: string = 'CanonG3410'
  ): Promise<BJNPPrintResult> {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    // Copy file to shared volume
    const fileName = path.basename(filePath);
    const sharedPath = `/tmp/canon-print/${fileName}`;
    const containerPath = `/tmp/canon-print/${fileName}`;

    try {
      fs.mkdirSync('/tmp/canon-print', { recursive: true });
      fs.copyFileSync(filePath, sharedPath);
    } catch (err) {
      return { success: false, error: `Failed to copy file: ${err}` };
    }

    logger.info(`Printing ${fileName} via BJNP...`);

    try {
      const output = execSync(
        `docker exec ${CONTAINER_NAME} lp -d ${printerName} "${containerPath}"`,
        { encoding: 'utf8' }
      );

      // Parse job ID from output (e.g., "request id is CanonG3410-1")
      const match = output.match(/request id is (\S+)/);
      const jobId = match ? match[1] : undefined;

      logger.success(`Print job submitted${jobId ? `: ${jobId}` : ''}`);
      return { success: true, jobId };
    } catch (err) {
      return { success: false, error: `Print failed: ${err}` };
    }
  }

  async getQueueStatus(printerName: string = 'CanonG3410'): Promise<string> {
    try {
      return execSync(`docker exec ${CONTAINER_NAME} lpstat -p ${printerName}`, {
        encoding: 'utf8',
      });
    } catch {
      return 'Unable to get queue status';
    }
  }

  async stopContainer(): Promise<void> {
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' });
      logger.info('Container stopped');
    } catch {
      // Ignore
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export async function setupBJNPDocker(printerIP: string): Promise<boolean> {
  const client = new BJNPDockerClient(printerIP);

  if (!client.isDockerAvailable()) {
    logger.error('Docker is required for BJNP printing. Please install Docker Desktop.');
    return false;
  }

  const built = await client.buildImage();
  if (!built) return false;

  const started = await client.startContainer();
  if (!started) return false;

  const setup = await client.setupPrinter();
  if (!setup) return false;

  logger.success('BJNP Docker environment ready');
  return true;
}
