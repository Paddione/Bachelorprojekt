// Nextcloud Talk API helper.
// Creates rooms, adds participants, generates meeting links.
// Uses the OCS API v4 (Nextcloud Talk / Spreed).

const NC_URL = process.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';
const NC_USER = process.env.NEXTCLOUD_CALDAV_USER || 'admin';
const NC_PASS = process.env.NEXTCLOUD_CALDAV_PASSWORD || 'devnextcloudadmin';
const NC_EXTERNAL_URL = process.env.NEXTCLOUD_EXTERNAL_URL || '';

function getAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${NC_USER}:${NC_PASS}`).toString('base64');
}

async function ocsApi(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${NC_URL}/ocs/v2.php/apps/spreed/api/v4${path}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export interface TalkRoom {
  token: string;
  name: string;
  url: string;
}

// Create a Talk room for a meeting.
// roomType: 2 = group, 3 = public
export async function createTalkRoom(params: {
  name: string;
  description?: string;
  public?: boolean;
}): Promise<TalkRoom | null> {
  try {
    const res = await ocsApi('POST', '/room', {
      roomType: params.public !== false ? 3 : 2, // Default to public for external guests
      roomName: params.name,
    });

    if (!res.ok) {
      console.error('[talk] Create room failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const token = data?.ocs?.data?.token;

    if (!token) {
      console.error('[talk] No token in response:', JSON.stringify(data));
      return null;
    }

    // Set description if provided
    if (params.description) {
      await ocsApi('PUT', `/room/${token}/description`, {
        description: params.description,
      });
    }

    // Enable lobby so host controls when guests can join
    await ocsApi('PUT', `/room/${token}/webinar/lobby`, {
      state: 1, // 1 = lobby enabled (guests wait until host starts)
    });

    return {
      token,
      name: params.name,
      url: `${NC_EXTERNAL_URL}/call/${token}`,
    };
  } catch (err) {
    console.error('[talk] Create room error:', err);
    return null;
  }
}

// Invite an email participant (external guest) to a Talk room
export async function inviteGuestByEmail(roomToken: string, email: string): Promise<boolean> {
  try {
    const res = await ocsApi('POST', `/room/${roomToken}/participants`, {
      newParticipant: email,
      source: 'emails',
    });

    if (!res.ok) {
      console.error('[talk] Invite guest failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[talk] Invite guest error:', err);
    return false;
  }
}

// Download the most recent recording file for a Talk room.
// Recordings are stored under the admin user's files in Talk/{roomName}/.
export async function getRecordingFile(roomToken: string): Promise<{ data: Buffer; filename: string } | null> {
  try {
    // Get room info to find the room name
    const roomRes = await ocsApi('GET', `/room/${roomToken}`);
    if (!roomRes.ok) return null;
    const roomData = await roomRes.json();
    const roomName = roomData?.ocs?.data?.name || roomToken;

    // List files in the Talk recording directory via WebDAV
    const davUrl = `${NC_URL}/remote.php/dav/files/${NC_USER}/Talk/`;
    const propfindRes = await fetch(davUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/xml',
        Depth: '2',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
        <d:propfind xmlns:d="DAV:">
          <d:prop>
            <d:displayname/>
            <d:getcontentlength/>
            <d:getlastmodified/>
          </d:prop>
        </d:propfind>`,
    });

    if (!propfindRes.ok) {
      console.error('[talk] WebDAV PROPFIND failed:', propfindRes.status);
      return null;
    }

    const xml = await propfindRes.text();

    // Find audio/video files matching room name
    const filePattern = new RegExp(`/Talk/[^/]*${encodeURIComponent(roomName)}[^/]*/[^/]+\\.(webm|ogg|mp4|wav|m4a)`, 'i');
    const hrefMatches = [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/g)]
      .map((m) => decodeURIComponent(m[1]))
      .filter((href) => filePattern.test(href));

    if (hrefMatches.length === 0) {
      console.log('[talk] No recording files found for room:', roomName);
      return null;
    }

    // Download the most recent recording (last in list)
    const recordingPath = hrefMatches[hrefMatches.length - 1];
    const downloadUrl = `${NC_URL}${recordingPath}`;
    const downloadRes = await fetch(downloadUrl, {
      headers: { Authorization: getAuthHeader() },
    });

    if (!downloadRes.ok) {
      console.error('[talk] Recording download failed:', downloadRes.status);
      return null;
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const filename = recordingPath.split('/').pop() || 'recording.webm';
    return { data: Buffer.from(arrayBuffer), filename };
  } catch (err) {
    console.error('[talk] Get recording error:', err);
    return null;
  }
}

// Close/delete a Talk room after meeting ends
export async function deleteTalkRoom(roomToken: string): Promise<boolean> {
  try {
    const res = await ocsApi('DELETE', `/room/${roomToken}`);
    return res.ok;
  } catch {
    return false;
  }
}

// List Talk rooms that currently have an active call.
// Returns rooms visible to the configured admin user where the call flag is set.
export interface ActiveCallRoom {
  token: string;
  name: string;
  displayName: string;
  callStartTime?: number;
}

export async function listActiveCallRooms(): Promise<ActiveCallRoom[]> {
  try {
    const res = await ocsApi('GET', '/room');
    if (!res.ok) {
      console.error('[talk] List rooms failed:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const rooms: unknown = data?.ocs?.data;
    if (!Array.isArray(rooms)) return [];

    return rooms
      .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
      .filter((r) => r.hasCall === true || (typeof r.callFlag === 'number' && r.callFlag > 0))
      .map((r) => ({
        token: String(r.token ?? ''),
        name: String(r.name ?? ''),
        displayName: String(r.displayName ?? r.name ?? ''),
        callStartTime: typeof r.callStartTime === 'number' ? r.callStartTime : undefined,
      }))
      .filter((r) => r.token);
  } catch (err) {
    console.error('[talk] List rooms error:', err);
    return [];
  }
}

// Post a chat message into a Talk conversation as the admin user.
// Used for the auto-post on Talk-roomed meeting creation.
export async function sendChatMessage(roomToken: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${NC_URL}/ocs/v2.php/apps/spreed/api/v1/chat/${roomToken}`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
      body: JSON.stringify({ message, replyTo: 0 }),
    });
    if (!res.ok) {
      console.error('[talk] sendChatMessage failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[talk] sendChatMessage error:', err);
    return false;
  }
}
