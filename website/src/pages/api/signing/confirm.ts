import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import {
  hashFile,
  moveFile,
  ensureFolder,
  getClientFolderPath,
  PENDING_SIGNATURES_DIR,
  SIGNED_DIR,
} from '../../../lib/nextcloud-files';


/**
 * POST /api/signing/confirm
 *
 * Body: { documentName: string, documentPath: string }
 *   documentPath: the Nextcloud-relative path of the pending document,
 *                 e.g. "Clients/alice/pending-signatures/contract.pdf"
 *                 (with or without a leading slash)
 *
 * 1. Requires authenticated Keycloak session.
 * 2. Validates the document path is within the caller's own pending-signatures folder.
 * 3. Computes SHA-256 hash of the file server-side.
 * 4. Moves the file from pending-signatures/ to signed/.
 * 5. Posts confirmation to Mattermost.
 * 6. Returns { success: true, hash: "<sha256>" }.
 */
export const POST: APIRoute = async ({ request }) => {
  // --- Authentication ---
  const cookieHeader = request.headers.get('cookie');
  const session = await getSession(cookieHeader);

  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Parse body ---
  let body: { documentName?: unknown; documentPath?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { documentName, documentPath } = body;
  if (
    !documentName ||
    typeof documentName !== 'string' ||
    !documentPath ||
    typeof documentPath !== 'string'
  ) {
    return new Response(
      JSON.stringify({ error: 'documentName and documentPath are required strings' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // --- Security: validate path is within the caller's own pending-signatures folder ---
  const username = session.preferred_username || session.sub;
  const clientFolder = getClientFolderPath(username); // e.g. "Clients/alice/"
  const allowedPrefix = `${clientFolder}${PENDING_SIGNATURES_DIR}/`;

  // Normalise: URL-decode first, then strip leading slash, collapse double-slashes, reject traversal sequences
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(documentPath);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid document path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const normalizedPath = decodedPath
    .replace(/\\/g, '/')   // normalise backslashes
    .replace(/^\//, '')    // strip leading slash
    .replace(/\/+/g, '/'); // collapse duplicate slashes

  if (
    normalizedPath.includes('../') ||
    normalizedPath.includes('/..') ||
    !normalizedPath.startsWith(allowedPrefix)
  ) {
    return new Response(JSON.stringify({ error: 'Invalid document path' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Also ensure documentName itself has no path separators (just a filename)
  if (documentName.includes('/') || documentName.includes('\\') || documentName.includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid document name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // --- Hash the file server-side ---
    const fileHash = await hashFile(normalizedPath);

    // --- Move file to signed/ ---
    const signedFolder = `${clientFolder}${SIGNED_DIR}/`;
    await ensureFolder(signedFolder);
    const destPath = `${signedFolder}${documentName}`;

    const moved = await moveFile(normalizedPath, destPath);
    if (!moved) {
      return new Response(JSON.stringify({ error: 'Failed to move document' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, hash: fileHash }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[signing/confirm] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
