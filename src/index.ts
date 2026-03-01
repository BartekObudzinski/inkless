#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';

import { scanPorts, getOpenPorts, hasIPP, hasRawSocket } from './discovery/port-scanner.js';
import { discoverPrinters } from './discovery/mdns-discovery.js';
import { IPPClient, testIPPConnection } from './protocols/ipp-client.js';
import { RawSocketClient, testRawSocket } from './protocols/raw-socket-client.js';
import { getFileInfo, detectMimeType, needsConversion } from './conversion/mime-detector.js';
import { GhostscriptConverter, checkGhostscript } from './conversion/ghostscript.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('inkless')
  .description('Driverless printing CLI for network printers')
  .version('1.0.0');

// Discover command
program
  .command('discover')
  .description('Discover all printers on the network')
  .option('-t, --timeout <ms>', 'Discovery timeout in milliseconds', '5000')
  .action(async (options) => {
    const spinner = ora('Discovering printers...').start();

    try {
      const timeout = parseInt(options.timeout);
      const printers = await discoverPrinters(timeout);

      spinner.stop();

      if (printers.length === 0) {
        console.log(chalk.yellow('No printers found via mDNS'));
        return;
      }

      console.log('\n' + chalk.cyan('Discovered Printers:'));
      console.log('─'.repeat(60));

      for (const printer of printers) {
        console.log(`${chalk.green('◉')} ${chalk.bold(printer.name)}`);
        console.log(`  Host: ${printer.host}:${printer.port}`);
        console.log(`  Type: ${printer.type}`);

        if (Object.keys(printer.txt).length > 0) {
          const relevantKeys = ['mfg', 'mdl', 'pdl', 'adminurl'];
          for (const key of relevantKeys) {
            if (printer.txt[key]) {
              console.log(`  ${key}: ${printer.txt[key]}`);
            }
          }
        }
        console.log();
      }

      console.log(chalk.green(`Found ${printers.length} printer(s)`));
    } catch (err) {
      spinner.fail('Discovery failed');
      logger.error(String(err));
    }
  });

// Scan command
program
  .command('scan')
  .description('Scan a specific IP for available printer protocols')
  .argument('<ip>', 'IP address to scan')
  .option('-t, --timeout <ms>', 'Connection timeout in milliseconds', '2000')
  .action(async (ip, options) => {
    const spinner = ora(`Scanning ${ip}...`).start();

    try {
      const timeout = parseInt(options.timeout);
      const results = await scanPorts(ip, timeout);
      spinner.stop();

      const openPorts = getOpenPorts(results);

      console.log('\n' + chalk.cyan(`Port Scan Results for ${ip}:`));
      console.log('─'.repeat(50));

      for (const result of results) {
        const status = result.open
          ? chalk.green('OPEN')
          : chalk.gray('closed');
        console.log(`  Port ${result.port}: ${status} - ${result.service}`);
      }

      console.log();

      if (openPorts.length === 0) {
        console.log(chalk.yellow('No printer ports found. Check:'));
        console.log('  - Printer is powered on');
        console.log('  - Printer is connected to WiFi');
        console.log('  - IP address is correct');
        return;
      }

      // Recommend protocol
      console.log(chalk.cyan('Recommended Protocol:'));
      if (hasIPP(results)) {
        console.log(chalk.green('  → IPP (Port 631) - Best option'));
        console.log(`    Run: inkless test-ipp ${ip}`);
      } else if (hasRawSocket(results)) {
        console.log(chalk.yellow('  → Raw Socket (Port 9100)'));
        console.log(`    Run: inkless print <file> -h ${ip} -p raw`);
      }
    } catch (err) {
      spinner.fail('Scan failed');
      logger.error(String(err));
    }
  });

// Test IPP command
program
  .command('test-ipp')
  .description('Test IPP connection and get printer capabilities')
  .argument('<ip>', 'Printer IP address')
  .option('-p, --port <port>', 'IPP port', '631')
  .action(async (ip, options) => {
    const spinner = ora('Testing IPP connection...').start();

    try {
      const port = parseInt(options.port);
      const result = await testIPPConnection(ip, port);
      spinner.stop();

      if (!result.success) {
        console.log(chalk.red(`IPP connection failed: ${result.error}`));
        return;
      }

      console.log('\n' + chalk.green('IPP Connection Successful!'));
      console.log('─'.repeat(50));

      const attrs = result.attributes!;
      console.log(`  Printer: ${attrs.makeAndModel || attrs.name || 'Unknown'}`);
      console.log(`  State: ${attrs.state || 'Unknown'}`);
      console.log(`  URI: ${attrs.uri || `ipp://${ip}:${port}${result.path}`}`);

      if (attrs.supportedFormats && attrs.supportedFormats.length > 0) {
        console.log('\n' + chalk.cyan('Supported Formats:'));
        for (const format of attrs.supportedFormats) {
          console.log(`    ${format}`);
        }
      }

      if (attrs.stateReasons && attrs.stateReasons.length > 0) {
        console.log('\n' + chalk.cyan('Status:'));
        for (const reason of attrs.stateReasons) {
          console.log(`    ${reason}`);
        }
      }

      console.log('\n' + chalk.green('Ready to print!'));
      console.log(`  Run: inkless print <file> -h ${ip}`);
    } catch (err) {
      spinner.fail('IPP test failed');
      logger.error(String(err));
    }
  });

// Print command
program
  .command('print')
  .description('Print a file')
  .argument('<file>', 'File to print')
  .requiredOption('-h, --host <ip>', 'Printer IP address')
  .option('-p, --protocol <protocol>', 'Protocol: ipp, raw', 'ipp')
  .option('--port <port>', 'Port number')
  .option('-c, --copies <n>', 'Number of copies', '1')
  .option('-n, --job-name <name>', 'Job name')
  .option('--convert', 'Convert file if needed')
  .action(async (file, options) => {
    // Validate file
    const fileInfo = getFileInfo(file);
    if (!fileInfo) {
      console.log(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }

    console.log(chalk.cyan('File Info:'));
    console.log(`  Path: ${fileInfo.path}`);
    console.log(`  Type: ${fileInfo.mimeType}`);
    console.log(`  Size: ${(fileInfo.size / 1024).toFixed(2)} KB`);
    console.log();

    const spinner = ora('Preparing to print...').start();

    try {
      const protocol = options.protocol.toLowerCase();

      if (protocol === 'ipp') {
        const port = options.port ? parseInt(options.port) : 631;
        spinner.text = 'Connecting via IPP...';

        // Find working path
        const workingPath = await IPPClient.findWorkingPath(options.host, port);
        if (!workingPath) {
          spinner.fail('No working IPP endpoint found');
          return;
        }

        const client = new IPPClient(options.host, port, workingPath);

        // Check if format is supported
        const attrs = await client.getAttributes();
        let fileToPrint = file;

        if (attrs?.supportedFormats && options.convert) {
          if (needsConversion(fileInfo.mimeType, attrs.supportedFormats)) {
            spinner.text = 'Converting file...';
            const gs = new GhostscriptConverter();
            if (!gs.isAvailable()) {
              spinner.fail('Ghostscript required for conversion. Install: brew install ghostscript');
              return;
            }

            const converted = await gs.convertForPrinter(file, attrs.supportedFormats);
            if (!converted.success) {
              spinner.fail(`Conversion failed: ${converted.error}`);
              return;
            }
            fileToPrint = converted.outputPath!;
          }
        }

        spinner.text = 'Sending print job...';
        const result = await client.printFile(fileToPrint, {
          jobName: options.jobName || file,
          copies: parseInt(options.copies),
          documentFormat: detectMimeType(fileToPrint),
        });

        if (result.success) {
          spinner.succeed(`Print job submitted (Job ID: ${result.jobId || 'unknown'})`);
        } else {
          spinner.fail(`Print failed: ${result.error}`);
        }

      } else if (protocol === 'raw') {
        const port = options.port ? parseInt(options.port) : 9100;
        spinner.text = 'Connecting via Raw Socket...';

        const client = new RawSocketClient(options.host, port);
        const connected = await client.testConnection();

        if (!connected) {
          spinner.fail('Raw socket connection failed');
          return;
        }

        spinner.text = 'Sending data...';
        const result = await client.printFile(file);

        if (result.success) {
          spinner.succeed(`Data sent (${result.bytesSent} bytes)`);
        } else {
          spinner.fail(`Send failed: ${result.error}`);
        }

      } else {
        spinner.fail(`Unknown protocol: ${protocol}. Use 'ipp' or 'raw'.`);
      }
    } catch (err) {
      spinner.fail('Print failed');
      logger.error(String(err));
    }
  });

// Status command
program
  .command('status')
  .description('Check system requirements and dependencies')
  .action(() => {
    console.log(chalk.cyan('Inkless CLI Status'));
    console.log('─'.repeat(40));

    // Node.js version
    console.log(`  Node.js: ${process.version}`);

    // Ghostscript
    const gs = checkGhostscript();
    if (gs.available) {
      console.log(chalk.green(`  Ghostscript: ${gs.version}`));
    } else {
      console.log(chalk.yellow('  Ghostscript: Not installed'));
      console.log(chalk.gray('    Install: brew install ghostscript'));
    }

    console.log();
  });

program.parse();
