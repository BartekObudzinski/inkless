export interface ScanResult {
  port: number;
  service: string;
  open: boolean;
}

export interface PrinterInfo {
  name: string;
  status: string;
  uri: string;
}

export interface CommandResult {
  success: boolean;
  message: string;
}

export interface DiscoveredPrinter {
  name: string;
  uri: string;
  ip: string;
}
