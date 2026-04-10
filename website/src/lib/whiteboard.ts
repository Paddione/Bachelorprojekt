// Nextcloud Whiteboard artifact export helper.
// Finds and exports whiteboard files associated with a Talk room.
// Whiteboards use Excalidraw-compatible JSON format stored in Nextcloud Files.

const NC_URL = process.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';
const NC_USER = process.env.NEXTCLOUD_CALDAV_USER || 'admin';
const NC_PASS = process.env.NEXTCLOUD_CALDAV_PASSWORD || 'devnextcloudadmin';

function getAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${NC_USER}:${NC_PASS}`).toString('base64');
}

export interface WhiteboardArtifact {
  name: string;
  path: string;
  data: string; // JSON string (Excalidraw format)
  size: number;
}

// List files in a Nextcloud directory via WebDAV PROPFIND
async function listWebDavFiles(path: string): Promise<Array<{ name: string; path: string; size: number }>> {
  const davUrl = `${NC_URL}/remote.php/dav/files/${NC_USER}${path}`;

  const res = await fetch(davUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/xml',
      Depth: '1',
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
      <d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
        <d:prop>
          <d:displayname/>
          <d:getcontentlength/>
          <d:getcontenttype/>
        </d:prop>
      </d:propfind>`,
  });

  if (!res.ok) return [];

  const xml = await res.text();
  const files: Array<{ name: string; path: string; size: number }> = [];

  // Simple XML parsing for WebDAV responses
  const responses = xml.split('<d:response>').slice(1);
  for (const response of responses) {
    const hrefMatch = response.match(/<d:href>([^<]+)<\/d:href>/);
    const nameMatch = response.match(/<d:displayname>([^<]*)<\/d:displayname>/);
    const sizeMatch = response.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/);

    if (hrefMatch && nameMatch && sizeMatch) {
      const name = nameMatch[1];
      const href = decodeURIComponent(hrefMatch[1]);
      files.push({
        name,
        path: href,
        size: parseInt(sizeMatch[1], 10),
      });
    }
  }

  return files;
}

// Download a file from Nextcloud via WebDAV
async function downloadWebDavFile(path: string): Promise<string | null> {
  const davUrl = `${NC_URL}/remote.php/dav/files/${NC_USER}${path}`;

  const res = await fetch(davUrl, {
    method: 'GET',
    headers: { Authorization: getAuthHeader() },
  });

  if (!res.ok) return null;
  return res.text();
}

// Find whiteboard files associated with a Talk room.
// Whiteboards are stored as .whiteboard files in the user's Nextcloud directory.
export async function getWhiteboardArtifacts(roomName?: string): Promise<WhiteboardArtifact[]> {
  try {
    // Search in common whiteboard locations
    const searchPaths = ['/'];
    if (roomName) {
      searchPaths.unshift(`/Talk/${roomName}/`);
    }

    const artifacts: WhiteboardArtifact[] = [];

    for (const basePath of searchPaths) {
      const files = await listWebDavFiles(basePath);
      const whiteboardFiles = files.filter(
        (f) => f.name.endsWith('.whiteboard') || f.name.endsWith('.excalidraw')
      );

      for (const file of whiteboardFiles) {
        const data = await downloadWebDavFile(file.path);
        if (data) {
          artifacts.push({
            name: file.name,
            path: file.path,
            data,
            size: file.size,
          });
        }
      }

      // If we found whiteboards in the room-specific path, don't search root
      if (artifacts.length > 0) break;
    }

    return artifacts;
  } catch (err) {
    console.error('[whiteboard] Error fetching artifacts:', err);
    return [];
  }
}

// Extract text content from whiteboard data (Excalidraw JSON).
// Useful for indexing and embedding.
export function extractWhiteboardText(data: string): string {
  try {
    const parsed = JSON.parse(data);
    const elements = parsed.elements || [];
    const textElements = elements
      .filter((el: { type: string; text?: string }) => el.type === 'text' && el.text)
      .map((el: { text: string }) => el.text.trim());
    return textElements.join('\n');
  } catch {
    return '';
  }
}
