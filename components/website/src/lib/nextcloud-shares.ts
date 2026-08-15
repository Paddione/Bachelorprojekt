import { posix } from 'node:path';
import { getClientFolderPath, listFiles, type NcFile } from './nextcloud-files';

const NC_URL = process.env.NEXTCLOUD_URL || '';
const NC_ADMIN_USER = process.env.NEXTCLOUD_ADMIN_USER || 'admin';
const NC_ADMIN_PASS = process.env.NEXTCLOUD_ADMIN_PASS || '';
const NC_EXTERNAL_URL = process.env.NEXTCLOUD_EXTERNAL_URL || NC_URL;

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${NC_ADMIN_USER}:${NC_ADMIN_PASS}`).toString('base64');
}

export interface ShareResult {
  url: string;
  token: string;
  shareType: number;
}

export interface ShareOptions {
  path: string;
  shareType: number;
  permissions?: number;
  password?: string;
  expireDate?: string;
  note?: string;
}

/**
 * Validates a path and returns the normalized version.
 * Admin may access any path. Customers are restricted to their own client folder.
 */
export function assertPathAllowed(
  rawPath: string,
  { isAdmin, username }: { isAdmin: boolean; username: string },
): string {
  if (!rawPath?.trim()) throw new Error('Pfad darf nicht leer sein.');

  // Prevent traversal attacks
  if (rawPath.includes('../') || rawPath.includes('..\\') || rawPath === '..') {
    throw new Error('Pfad enthält ungültige Zeichen.');
  }

  const normalized = posix.normalize(rawPath.replace(/\\/g, '/')).replace(/^\//, '');

  if (!normalized || normalized === '.') throw new Error('Pfad darf nicht leer sein.');

  if (isAdmin) return normalized;

  const clientPrefix = getClientFolderPath(username);
  if (!normalized.startsWith(clientPrefix)) {
    throw new Error(`Zugriff verweigert: Pfad muss im eigenen Client-Ordner liegen (${clientPrefix}).`);
  }

  return normalized;
}

/**
 * Creates a share link via the Nextcloud OCS Share API.
 */
export async function createShareLink(opts: ShareOptions): Promise<ShareResult> {
  const safePath = posix.normalize('/' + opts.path.replace(/\\/g, '/')).replace(/^\//, '');

  const params = new URLSearchParams();
  params.set('path', safePath);
  params.set('shareType', String(opts.shareType));
  params.set('permissions', String(opts.permissions ?? 1));
  if (opts.password) params.set('password', opts.password);
  if (opts.expireDate) params.set('expireDate', opts.expireDate);

  const res = await fetch(`${NC_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'OCS-APIRequest': 'true',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nextcloud share creation failed: ${res.status} ${text.slice(0, 300)}`);
  }

  const data = await res.json() as { ocs?: { data?: { url?: string; token?: string; share_type?: number } } };
  const shareData = data?.ocs?.data;
  if (!shareData?.url) {
    throw new Error('Nextcloud share response missing URL.');
  }

  let url = shareData.url;
  if (NC_EXTERNAL_URL && url) {
    try {
      const parsed = new URL(url);
      url = new URL(parsed.pathname + parsed.search, NC_EXTERNAL_URL).href;
    } catch { /* keep original URL */ }
  }

  return {
    url,
    token: shareData.token ?? '',
    shareType: shareData.share_type ?? 0,
  };
}

/**
 * Find files by name in a given scope folder (flat search, no recursion).
 */
export async function findFilesByName(scopePath: string, query: string): Promise<NcFile[]> {
  const files = await listFiles(scopePath);
  if (!query.trim()) return files;
  const lower = query.toLowerCase().trim();
  return files.filter(f => f.name.toLowerCase().includes(lower));
}
