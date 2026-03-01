/* eslint-disable @typescript-eslint/no-explicit-any */
import ipp from 'ipp';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';

export interface PrinterAttributes {
  name?: string;
  state?: string;
  stateReasons?: string[];
  supportedFormats?: string[];
  makeAndModel?: string;
  uri?: string;
}

export interface PrintJobResult {
  success: boolean;
  jobId?: number;
  jobUri?: string;
  message?: string;
  error?: string;
}

export interface JobStatus {
  jobId: number;
  state: string;
  stateReasons?: string[];
  jobName?: string;
}

const IPP_PATHS = ['/ipp/print', '/ipp/printer', '/ipp', '/'];

export class IPPClient {
  private printerUri: string;
  private printer: any;

  constructor(host: string, port: number = 631, path: string = '/ipp/print') {
    this.printerUri = `ipp://${host}:${port}${path}`;
    this.printer = new (ipp as any).Printer(this.printerUri);
  }

  static async findWorkingPath(host: string, port: number = 631): Promise<string | null> {
    logger.info(`Probing IPP paths on ${host}:${port}...`);

    for (const path of IPP_PATHS) {
      try {
        const client = new IPPClient(host, port, path);
        const attrs = await client.getAttributes();
        if (attrs) {
          logger.success(`Working IPP path found: ${path}`);
          return path;
        }
      } catch {
        logger.debug(`Path ${path} failed`);
      }
    }

    logger.warn('No working IPP path found');
    return null;
  }

  async getAttributes(): Promise<PrinterAttributes | null> {
    return new Promise((resolve) => {
      const msg = {
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en',
          'printer-uri': this.printerUri,
          'requested-attributes': [
            'printer-name',
            'printer-state',
            'printer-state-reasons',
            'document-format-supported',
            'printer-make-and-model',
            'printer-uri-supported',
          ],
        },
      };

      this.printer.execute('Get-Printer-Attributes', msg, (err: Error | null, res: any) => {
        if (err) {
          logger.debug(`IPP error: ${err.message}`);
          resolve(null);
          return;
        }

        if (!res || res.statusCode !== 'successful-ok') {
          logger.debug(`IPP status: ${res?.statusCode || 'no response'}`);
          resolve(null);
          return;
        }

        const attrs = res['printer-attributes-tag'];
        if (!attrs) {
          resolve(null);
          return;
        }

        const result: PrinterAttributes = {
          name: attrs['printer-name'],
          state: attrs['printer-state'],
          stateReasons: this.normalizeArray(attrs['printer-state-reasons']),
          supportedFormats: this.normalizeArray(attrs['document-format-supported']),
          makeAndModel: attrs['printer-make-and-model'],
          uri: attrs['printer-uri-supported'],
        };

        resolve(result);
      });
    });
  }

  async printFile(
    filePath: string,
    options: {
      jobName?: string;
      userName?: string;
      copies?: number;
      documentFormat?: string;
    } = {}
  ): Promise<PrintJobResult> {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const data = fs.readFileSync(filePath);
    return this.printData(data, {
      ...options,
      jobName: options.jobName || filePath.split('/').pop(),
    });
  }

  async printData(
    data: Buffer,
    options: {
      jobName?: string;
      userName?: string;
      copies?: number;
      documentFormat?: string;
    } = {}
  ): Promise<PrintJobResult> {
    return new Promise((resolve) => {
      const msg = {
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en',
          'printer-uri': this.printerUri,
          'requesting-user-name': options.userName || 'canon-print',
          'job-name': options.jobName || 'Print Job',
          'document-format': options.documentFormat || 'application/octet-stream',
        },
        'job-attributes-tag': {
          copies: options.copies || 1,
        },
        data: data,
      };

      this.printer.execute('Print-Job', msg, (err: Error | null, res: any) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        if (!res) {
          resolve({ success: false, error: 'No response from printer' });
          return;
        }

        const statusCode = res.statusCode;
        if (statusCode === 'successful-ok' || statusCode === 'successful-ok-ignored-or-substituted-attributes') {
          const jobAttrs = res['job-attributes-tag'];
          resolve({
            success: true,
            jobId: jobAttrs?.['job-id'],
            jobUri: jobAttrs?.['job-uri'],
            message: `Job submitted successfully`,
          });
        } else {
          resolve({
            success: false,
            error: `Printer returned: ${statusCode}`,
          });
        }
      });
    });
  }

  async getJobStatus(jobId: number): Promise<JobStatus | null> {
    return new Promise((resolve) => {
      const jobUri = `${this.printerUri.replace('/ipp/print', '')}/jobs/${jobId}`;

      const msg = {
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en',
          'job-uri': jobUri,
          'requested-attributes': ['job-id', 'job-state', 'job-state-reasons', 'job-name'],
        },
      };

      this.printer.execute('Get-Job-Attributes', msg, (err: Error | null, res: any) => {
        if (err) {
          resolve(null);
          return;
        }

        if (!res || res.statusCode !== 'successful-ok') {
          resolve(null);
          return;
        }

        const attrs = res['job-attributes-tag'];
        if (!attrs) {
          resolve(null);
          return;
        }

        resolve({
          jobId: attrs['job-id'],
          state: attrs['job-state'],
          stateReasons: this.normalizeArray(attrs['job-state-reasons']),
          jobName: attrs['job-name'],
        });
      });
    });
  }

  private normalizeArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (value !== undefined && value !== null) {
      return [String(value)];
    }
    return [];
  }

  getUri(): string {
    return this.printerUri;
  }
}

export async function testIPPConnection(
  host: string,
  port: number = 631
): Promise<{ success: boolean; attributes?: PrinterAttributes; path?: string; error?: string }> {
  logger.info(`Testing IPP connection to ${host}:${port}...`);

  const workingPath = await IPPClient.findWorkingPath(host, port);
  if (!workingPath) {
    return { success: false, error: 'No working IPP endpoint found' };
  }

  const client = new IPPClient(host, port, workingPath);
  const attrs = await client.getAttributes();

  if (attrs) {
    logger.success(`Connected to: ${attrs.makeAndModel || attrs.name || 'Unknown printer'}`);
    logger.info(`Supported formats: ${attrs.supportedFormats?.join(', ') || 'unknown'}`);
    return { success: true, attributes: attrs, path: workingPath };
  }

  return { success: false, error: 'Failed to get printer attributes' };
}
