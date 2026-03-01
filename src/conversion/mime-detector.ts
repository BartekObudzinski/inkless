import * as fs from 'fs';
import * as path from 'path';

export interface FileInfo {
  path: string;
  extension: string;
  mimeType: string;
  size: number;
  isPrintable: boolean;
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.ps': 'application/postscript',
  '.eps': 'application/postscript',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.txt': 'text/plain',
  '.text': 'text/plain',
  '.pcl': 'application/vnd.hp-pcl',
  '.prn': 'application/octet-stream',
  '.pwg': 'image/pwg-raster',
  '.urf': 'image/urf',
};

const PRINTABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/postscript',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/pwg-raster',
  'image/urf',
  'text/plain',
  'application/vnd.hp-pcl',
  'application/octet-stream',
]);

export function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export function getFileInfo(filePath: string): FileInfo | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = detectMimeType(filePath);

  return {
    path: filePath,
    extension: ext,
    mimeType,
    size: stats.size,
    isPrintable: PRINTABLE_MIME_TYPES.has(mimeType),
  };
}

export function isFormatSupported(
  mimeType: string,
  supportedFormats: string[]
): boolean {
  // Check exact match
  if (supportedFormats.includes(mimeType)) {
    return true;
  }

  // Check wildcard matches (e.g., "image/*")
  const [type] = mimeType.split('/');
  const wildcard = `${type}/*`;
  if (supportedFormats.includes(wildcard)) {
    return true;
  }

  // Note: application/octet-stream is NOT treated as universal fallback
  // It just means the printer accepts raw binary in a specific format (usually raster)
  return false;
}

export function needsConversion(
  mimeType: string,
  supportedFormats: string[]
): boolean {
  return !isFormatSupported(mimeType, supportedFormats);
}

export function suggestTargetFormat(supportedFormats: string[]): string | null {
  // Prefer PDF if supported
  if (supportedFormats.includes('application/pdf')) {
    return 'application/pdf';
  }

  // Then JPEG
  if (supportedFormats.includes('image/jpeg')) {
    return 'image/jpeg';
  }

  // Then PNG
  if (supportedFormats.includes('image/png')) {
    return 'image/png';
  }

  // Then PostScript
  if (supportedFormats.includes('application/postscript')) {
    return 'application/postscript';
  }

  return null;
}
