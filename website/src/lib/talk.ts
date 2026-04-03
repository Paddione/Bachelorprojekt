// Nextcloud Talk API helper.
// Creates rooms, adds participants, generates meeting links.
// Uses the OCS API v4 (Nextcloud Talk / Spreed).

const NC_URL = import.meta.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';
const NC_USER = import.meta.env.NEXTCLOUD_CALDAV_USER || 'admin';
const NC_PASS = import.meta.env.NEXTCLOUD_CALDAV_PASSWORD || 'devnextcloudadmin';
const NC_EXTERNAL_URL = import.meta.env.NEXTCLOUD_EXTERNAL_URL || 'https://files.${PROD_DOMAIN}';

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

// Close/delete a Talk room after meeting ends
export async function deleteTalkRoom(roomToken: string): Promise<boolean> {
  try {
    const res = await ocsApi('DELETE', `/room/${roomToken}`);
    return res.ok;
  } catch {
    return false;
  }
}
