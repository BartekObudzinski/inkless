import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';

export interface ConversionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface ConversionOptions {
  resolution?: number;
  quality?: number;
  outputDir?: string;
}

type OutputFormat = 'png' | 'jpeg' | 'pdf' | 'ps' | 'pwg' | 'urf';

const GS_DEVICES: Record<OutputFormat, string> = {
  png: 'png16m',
  jpeg: 'jpeg',
  pdf: 'pdfwrite',
  ps: 'ps2write',
  pwg: 'pwgraster',
  urf: 'appleraster',
};

export class GhostscriptConverter {
  private gsPath: string | null = null;

  constructor() {
    this.detectGhostscript();
  }

  private detectGhostscript(): void {
    const paths = ['gs', '/usr/local/bin/gs', '/opt/homebrew/bin/gs'];

    for (const gsPath of paths) {
      try {
        execSync(`${gsPath} --version`, { stdio: 'pipe' });
        this.gsPath = gsPath;
        return;
      } catch {
        continue;
      }
    }

    logger.warn('Ghostscript not found. Install with: brew install ghostscript');
  }

  isAvailable(): boolean {
    return this.gsPath !== null;
  }

  getVersion(): string | null {
    if (!this.gsPath) return null;

    try {
      return execSync(`${this.gsPath} --version`, { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  }

  async convertToFormat(
    inputPath: string,
    format: OutputFormat,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    if (!this.gsPath) {
      return { success: false, error: 'Ghostscript not available' };
    }

    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `Input file not found: ${inputPath}` };
    }

    const resolution = options.resolution || 300;
    const quality = options.quality || 90;
    const outputDir = options.outputDir || os.tmpdir();

    const inputName = path.basename(inputPath, path.extname(inputPath));
    const extMap: Record<string, string> = { jpeg: 'jpg', pwg: 'pwg', urf: 'urf' };
    const outputExt = extMap[format] || format;
    const outputPath = path.join(outputDir, `${inputName}.${outputExt}`);

    const device = GS_DEVICES[format];
    if (!device) {
      return { success: false, error: `Unsupported format: ${format}` };
    }

    let args = [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-dQUIET',
      `-sDEVICE=${device}`,
      `-r${resolution}`,
    ];

    // Format-specific options
    if (format === 'jpeg') {
      args.push(`-dJPEGQ=${quality}`);
    }

    if (format === 'png' || format === 'jpeg') {
      // Single output file for images (first page only)
      args.push('-dFirstPage=1', '-dLastPage=1');
    }

    if (format === 'pwg' || format === 'urf') {
      // PWG Raster specific options
      args.push('-dColorConversionStrategy=RGB');
    }

    args.push(`-sOutputFile=${outputPath}`, `"${inputPath}"`);

    const command = `${this.gsPath} ${args.join(' ')}`;
    logger.debug(`Running: ${command}`);

    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Ghostscript error: ${stderr || error.message}`);
          resolve({ success: false, error: stderr || error.message });
          return;
        }

        if (fs.existsSync(outputPath)) {
          logger.success(`Converted to ${format}: ${outputPath}`);
          resolve({ success: true, outputPath });
        } else {
          resolve({ success: false, error: 'Output file not created' });
        }
      });
    });
  }

  async convertToPNG(
    inputPath: string,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    return this.convertToFormat(inputPath, 'png', options);
  }

  async convertToJPEG(
    inputPath: string,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    return this.convertToFormat(inputPath, 'jpeg', options);
  }

  async convertToPDF(
    inputPath: string,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    return this.convertToFormat(inputPath, 'pdf', options);
  }

  async convertToPS(
    inputPath: string,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    return this.convertToFormat(inputPath, 'ps', options);
  }

  async convertForPrinter(
    inputPath: string,
    supportedFormats: string[],
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    // Determine best target format based on printer capabilities
    let targetFormat: OutputFormat | null = null;

    if (supportedFormats.includes('application/pdf')) {
      targetFormat = 'pdf';
    } else if (supportedFormats.includes('image/pwg-raster')) {
      targetFormat = 'pwg';
    } else if (supportedFormats.includes('image/urf')) {
      targetFormat = 'urf';
    } else if (supportedFormats.includes('image/jpeg')) {
      targetFormat = 'jpeg';
    } else if (supportedFormats.includes('image/png')) {
      targetFormat = 'png';
    } else if (supportedFormats.includes('application/postscript')) {
      targetFormat = 'ps';
    }

    if (!targetFormat) {
      return { success: false, error: 'No supported format for conversion' };
    }

    logger.info(`Converting to ${targetFormat}...`);
    return this.convertToFormat(inputPath, targetFormat, options);
  }

  async convertToPWG(
    inputPath: string,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    return this.convertToFormat(inputPath, 'pwg', options);
  }
}

export function checkGhostscript(): { available: boolean; version?: string } {
  const gs = new GhostscriptConverter();
  if (gs.isAvailable()) {
    return { available: true, version: gs.getVersion() || undefined };
  }
  return { available: false };
}
