/**
 * Hello World print example
 * Usage: npx ts-node examples/hello-world-print.ts <printer-ip>
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { scanPorts, hasIPP, hasRawSocket, hasBJNP } from '../src/discovery/port-scanner.js';
import { IPPClient, testIPPConnection } from '../src/protocols/ipp-client.js';
import { RawSocketClient } from '../src/protocols/raw-socket-client.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  const printerIP = process.argv[2];

  if (!printerIP) {
    console.log('Usage: npx ts-node examples/hello-world-print.ts <printer-ip>');
    console.log('Example: npx ts-node examples/hello-world-print.ts 192.168.1.100');
    process.exit(1);
  }

  logger.info(`Testing Canon printer at ${printerIP}`);

  // Step 1: Scan for available protocols
  logger.info('Step 1: Scanning for available protocols...');
  const scanResults = await scanPorts(printerIP);

  const ippAvailable = hasIPP(scanResults);
  const rawAvailable = hasRawSocket(scanResults);
  const bjnpAvailable = hasBJNP(scanResults);

  logger.info(`IPP (631): ${ippAvailable ? 'Available' : 'Not available'}`);
  logger.info(`Raw (9100): ${rawAvailable ? 'Available' : 'Not available'}`);
  logger.info(`BJNP (8611): ${bjnpAvailable ? 'Available' : 'Not available'}`);

  if (!ippAvailable && !rawAvailable && !bjnpAvailable) {
    logger.error('No supported protocols found. Check printer connection.');
    process.exit(1);
  }

  // Step 2: Create a simple test file
  logger.info('Step 2: Creating test file...');
  const testContent = `
Hello World!

This is a test print from Canon Print CLI.
Printer IP: ${printerIP}
Timestamp: ${new Date().toISOString()}

If you can read this, the driverless printing is working!
`;

  const testFile = path.join(os.tmpdir(), 'canon-print-test.txt');
  fs.writeFileSync(testFile, testContent);
  logger.success(`Test file created: ${testFile}`);

  // Step 3: Try printing
  if (ippAvailable) {
    logger.info('Step 3: Attempting IPP print...');

    const ippTest = await testIPPConnection(printerIP);
    if (!ippTest.success) {
      logger.error(`IPP connection failed: ${ippTest.error}`);
    } else {
      logger.success(`Connected to: ${ippTest.attributes?.makeAndModel}`);

      const client = new IPPClient(printerIP, 631, ippTest.path!);
      const printResult = await client.printFile(testFile, {
        jobName: 'Hello World Test',
        documentFormat: 'text/plain',
      });

      if (printResult.success) {
        logger.success(`Print job submitted! Job ID: ${printResult.jobId}`);
      } else {
        logger.error(`Print failed: ${printResult.error}`);
      }
    }
  } else if (rawAvailable) {
    logger.info('Step 3: Attempting Raw Socket print...');

    const client = new RawSocketClient(printerIP);
    const printResult = await client.printFile(testFile);

    if (printResult.success) {
      logger.success(`Data sent: ${printResult.bytesSent} bytes`);
    } else {
      logger.error(`Send failed: ${printResult.error}`);
    }
  } else {
    logger.warn('Only BJNP available. Run: canon-print setup-bjnp ' + printerIP);
  }

  // Cleanup
  fs.unlinkSync(testFile);
  logger.info('Test complete.');
}

main().catch((err) => {
  logger.error(`Error: ${err}`);
  process.exit(1);
});
