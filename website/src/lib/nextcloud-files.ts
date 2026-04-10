// WebDAV helpers for Nextcloud file operations

import { posix } from 'node:path';

const NC_URL = process.env.NEXTCLOUD_URL || '';
const NC_ADMIN_USER = process.env.NEXTCLOUD_ADMIN_USER || 'admin';
const NC_ADMIN_PASS = process.env.NEXTCLOUD_ADMIN_PASS || '';
const NC_EXTERNAL_URL = process.env.NEXTCLOUD_EXTERNAL_URL || NC_URL;

function davUrl(path: string): string {
  const safe = posix.normalize('/' + path).slice(1); // removes leading slash after normalize
  if (safe.startsWith('..') || safe.includes('/../')) {
    throw new Error(`Invalid path: ${path}`);
  }
  return `${NC_URL}/remote.php/dav/files/${NC_ADMIN_USER}/${safe}`;
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${NC_ADMIN_USER}:${NC_ADMIN_PASS}`).toString('base64');
}

export interface NcFile {
  name: string;
  path: string;
  lastModified: string;
  contentType: string;
}

/**
 * List files in a Nextcloud folder. Returns empty array on error.
 */
export async function listFiles(folderPath: string): Promise<NcFile[]> {
  const url = davUrl(folderPath);
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: authHeader(),
      Depth: '1',
      'Content-Type': 'application/xml',
    },
    body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getlastmodified/>
    <d:getcontenttype/>
  </d:prop>
</d:propfind>`,
  });
  if (!res.ok) return [];
  const xml = await res.text();
  // Parse XML responses — each <d:response> except the first (folder itself) is a file
  const responses = xml.match(/<d:response>[\s\S]*?<\/d:response>/g) ?? [];
  const files: NcFile[] = [];
  for (const block of responses.slice(1)) {
    const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/);
    const nameMatch = block.match(/<d:displayname>([^<]+)<\/d:displayname>/);
    const modifiedMatch = block.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/);
    const typeMatch = block.match(/<d:getcontenttype>([^<]+)<\/d:getcontenttype>/);
    if (hrefMatch && nameMatch) {
      files.push({
        name: nameMatch[1],
        path: decodeURIComponent(hrefMatch[1]),
        lastModified: modifiedMatch?.[1] ?? '',
        contentType: typeMatch?.[1] ?? 'application/octet-stream',
      });
    }
  }
  return files;
}

/**
 * Move a file within Nextcloud (WebDAV MOVE).
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<boolean> {
  const sourceUrl = davUrl(sourcePath);
  const destUrl = davUrl(destPath);
  const res = await fetch(sourceUrl, {
    method: 'MOVE',
    headers: {
      Authorization: authHeader(),
      Destination: destUrl,
      Overwrite: 'F',
    },
  });
  return res.status === 201 || res.status === 204;
}

/**
 * Download file contents as a Buffer.
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const url = davUrl(filePath);
  const res = await fetch(url, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`Failed to download ${filePath}: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Compute SHA-256 hash of a Nextcloud file.
 */
export async function hashFile(filePath: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const data = await downloadFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Ensure a folder exists in Nextcloud (MKCOL, ignores 405 if already exists).
 */
export async function ensureFolder(folderPath: string): Promise<void> {
  const url = davUrl(folderPath);
  const res = await fetch(url, {
    method: 'MKCOL',
    headers: { Authorization: authHeader() },
  });
  // 201 = created, 405 = already exists — both are fine
  if (res.status !== 201 && res.status !== 405) {
    throw new Error(`Failed to ensure folder ${folderPath}: ${res.status}`);
  }
}

/**
 * Returns the Nextcloud file's direct WebDAV download URL.
 * For Collabora editor integration, use this URL as the file path parameter.
 */
export function getFileUrl(filePath: string): string {
  const safe = posix.normalize('/' + filePath).slice(1);
  return `${NC_EXTERNAL_URL}/remote.php/dav/files/${NC_ADMIN_USER}/${safe}`;
}
