// Mattermost API helper for interactive messages and bot actions.

const MM_URL = process.env.MATTERMOST_URL || 'http://mattermost.workspace.svc.cluster.local:8065';
const MM_TOKEN = process.env.MATTERMOST_BOT_TOKEN || '';
const WEBHOOK_URL = process.env.MATTERMOST_WEBHOOK_URL || '';
const SITE_URL = process.env.SITE_URL || 'http://localhost:4321';

async function mmApi(method: string, endpoint: string, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  return fetch(`${MM_URL}/api/v4${endpoint}`, {
    method,
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${MM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }).finally(() => clearTimeout(timer));
}

// Upload a file to Mattermost via the Files API. Returns the file_id
// to include in a subsequent post's `file_ids` array, or null on failure.
// Do NOT route through mmApi — multipart/form-data needs the runtime to
// set the Content-Type header (with boundary) automatically.
export async function uploadFile(params: {
  channelId: string;
  file: File;
  filename?: string;
}): Promise<string | null> {
  if (!MM_TOKEN) {
    console.log('[mattermost] No bot token configured. Would upload file:', params.filename ?? params.file.name);
    return null;
  }

  const formData = new FormData();
  formData.append('files', params.file, params.filename ?? params.file.name);
  formData.append('channel_id', params.channelId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${MM_URL}/api/v4/files`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${MM_TOKEN}`,
      },
      body: formData,
    });
    if (!res.ok) {
      console.error('[mattermost] uploadFile failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json() as { file_infos?: Array<{ id: string }> };
    return data.file_infos?.[0]?.id ?? null;
  } catch (err) {
    console.error('[mattermost] uploadFile threw:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Post via incoming webhook (simple, no token needed)
export async function postWebhook(payload: {
  channel?: string;
  text: string;
  username?: string;
  icon_emoji?: string;
  props?: Record<string, unknown>;
}): Promise<boolean> {
  if (!WEBHOOK_URL) {
    console.log('[mattermost] No webhook URL configured. Payload:', JSON.stringify(payload, null, 2));
    return true;
  }

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// Post interactive message with action buttons (requires bot token)
export async function postInteractiveMessage(params: {
  channelId: string;
  text: string;
  actions: Array<{
    id: string;
    name: string;
    style?: 'default' | 'primary' | 'danger' | 'success';
  }>;
  context?: Record<string, unknown>;
  fileIds?: string[];
}): Promise<string | null> {
  if (!MM_TOKEN) {
    console.log('[mattermost] No bot token configured. Would post interactive message:', JSON.stringify(params, null, 2));
    return null;
  }

  const res = await mmApi('POST', '/posts', {
    channel_id: params.channelId,
    message: params.text,
    ...(params.fileIds && params.fileIds.length > 0 ? { file_ids: params.fileIds } : {}),
    props: {
      attachments: [
        {
          actions: params.actions.map((action) => ({
            id: action.id,
            name: action.name,
            type: 'button',
            style: action.style || 'default',
            integration: {
              url: `${SITE_URL}/api/mattermost/actions`,
              context: {
                action: action.id,
                ...params.context,
              },
            },
          })),
        },
      ],
    },
  });

  if (res.ok) {
    const post = await res.json();
    return post.id;
  }

  console.error('[mattermost] Failed to post interactive message:', res.status);
  return null;
}

// Update an existing post (e.g. after action button clicked)
export async function updatePost(postId: string, message: string): Promise<boolean> {
  if (!MM_TOKEN) return false;
  const res = await mmApi('PUT', `/posts/${postId}`, {
    id: postId,
    message,
    props: { attachments: [] }, // Remove action buttons
  });
  return res.ok;
}

// Reply in a thread
export async function replyToPost(postId: string, channelId: string, message: string): Promise<boolean> {
  if (!MM_TOKEN) return false;
  const res = await mmApi('POST', '/posts', {
    channel_id: channelId,
    root_id: postId,
    message,
  });
  return res.ok;
}

// Get channel ID by name
export async function getChannelByName(teamId: string, channelName: string): Promise<string | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('GET', `/teams/${teamId}/channels/name/${channelName}`);
  if (res.ok) {
    const channel = await res.json();
    return channel.id;
  }
  return null;
}

// Get first team ID
export async function getFirstTeamId(): Promise<string | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('GET', '/teams?per_page=1');
  if (res.ok) {
    const teams = await res.json();
    return teams[0]?.id || null;
  }
  return null;
}

// Create or get a per-customer channel (e.g. "kunde-max-mustermann")
export async function getOrCreateCustomerChannel(teamId: string, customerName: string): Promise<{ id: string; name: string; created: boolean } | null> {
  if (!MM_TOKEN) return null;

  const slug = customerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const channelName = `kunde-${slug}`;
  const displayName = `Kunde: ${customerName}`;

  // Check if exists
  const existing = await mmApi('GET', `/teams/${teamId}/channels/name/${channelName}`);
  if (existing.ok) {
    const ch = await existing.json();
    return { id: ch.id, name: channelName, created: false };
  }

  // Create it
  const res = await mmApi('POST', '/channels', {
    team_id: teamId,
    name: channelName,
    display_name: displayName,
    purpose: `Kundenkanal für ${customerName} — Termine, Meetings, Dokumente`,
    type: 'P', // Private channel
  });

  if (res.ok) {
    const ch = await res.json();
    return { id: ch.id, name: channelName, created: true };
  }

  console.error('[mattermost] Failed to create customer channel:', res.status);
  return null;
}

// Notify admins about pipeline errors.
// Posts to the "anfragen" channel (or webhook) so admins see it immediately.
export async function notifyPipelineError(params: {
  step: string;
  error: string;
  customerName?: string;
  meetingId?: string;
}): Promise<void> {
  const msg = [
    `### :rotating_light: Meeting-Pipeline Fehler`,
    '',
    `**Schritt:** ${params.step}`,
    params.customerName ? `**Kunde:** ${params.customerName}` : '',
    params.meetingId ? `**Meeting-ID:** \`${params.meetingId}\`` : '',
    '',
    '```',
    params.error.substring(0, 500),
    '```',
    '',
    '_Bitte manuell pruefen. Pipeline wurde teilweise ausgefuehrt._',
  ].filter(Boolean).join('\n');

  // Try webhook first (works without bot token)
  const webhookSent = await postWebhook({
    text: msg,
    username: 'Meeting-Pipeline',
    icon_emoji: ':rotating_light:',
  });

  if (!webhookSent && MM_TOKEN) {
    // Fallback: post to first team's town-square
    try {
      const teamsRes = await mmApi('GET', '/teams');
      if (teamsRes.ok) {
        const teams = await teamsRes.json();
        if (teams.length > 0) {
          const chRes = await mmApi('GET', `/teams/${teams[0].id}/channels/name/town-square`);
          if (chRes.ok) {
            const ch = await chRes.json();
            await mmApi('POST', '/posts', { channel_id: ch.id, message: msg });
          }
        }
      }
    } catch { /* best-effort */ }
  }
}

// Post a message to a channel (simple, no interactive buttons)
export async function postToChannel(channelId: string, message: string): Promise<boolean> {
  if (!MM_TOKEN) return false;
  const res = await mmApi('POST', '/posts', {
    channel_id: channelId,
    message,
  });
  return res.ok;
}

// ── Management API helpers ──

export interface MmUser {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
  roles: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  last_activity_at?: number;
  is_bot: boolean;
  bot_description?: string;
}

export interface MmTeam {
  id: string;
  display_name: string;
  name: string;
  description: string;
  type: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  member_count?: number;
}

export interface MmChannel {
  id: string;
  team_id: string;
  type: string;
  display_name: string;
  name: string;
  header: string;
  purpose: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  total_msg_count: number;
  last_post_at: number;
  creator_id: string;
}

export interface MmSystemInfo {
  version: string;
  database_type: string;
  database_version: string;
  license_id?: string;
  active_user_count?: number;
}

export async function getUsers(page = 0, perPage = 100): Promise<MmUser[]> {
  if (!MM_TOKEN) return [];
  const res = await mmApi('GET', `/users?page=${page}&per_page=${perPage}`);
  return res.ok ? res.json() : [];
}

export async function getUserStats(userId: string): Promise<{ last_activity_at: number } | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('GET', `/users/${userId}/status`);
  return res.ok ? res.json() : null;
}

export async function getTeams(): Promise<MmTeam[]> {
  if (!MM_TOKEN) return [];
  const res = await mmApi('GET', '/teams?per_page=100');
  return res.ok ? res.json() : [];
}

export async function getTeamStats(teamId: string): Promise<{ total_member_count: number; active_member_count: number } | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('GET', `/teams/${teamId}/stats`);
  return res.ok ? res.json() : null;
}

export async function getChannelsForTeam(teamId: string): Promise<MmChannel[]> {
  if (!MM_TOKEN) return [];
  const res = await mmApi('GET', `/teams/${teamId}/channels?per_page=200`);
  return res.ok ? res.json() : [];
}

export async function getChannelStats(channelId: string): Promise<{ member_count: number } | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('GET', `/channels/${channelId}/stats`);
  return res.ok ? res.json() : null;
}

export async function getSystemPing(): Promise<Record<string, string> | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('GET', '/system/ping?get_server_status=true');
  return res.ok ? res.json() : null;
}

export async function getSystemConfig(): Promise<Record<string, unknown> | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('GET', '/config');
  return res.ok ? res.json() : null;
}

export async function getAnalytics(name = 'standard'): Promise<Array<{ name: string; value: number }>> {
  if (!MM_TOKEN) return [];
  const res = await mmApi('GET', `/analytics/old?name=${name}`);
  return res.ok ? res.json() : [];
}

export async function deactivateUser(userId: string): Promise<boolean> {
  if (!MM_TOKEN) return false;
  const res = await mmApi('DELETE', `/users/${userId}`);
  return res.ok;
}

export async function deleteChannel(channelId: string): Promise<boolean> {
  if (!MM_TOKEN) return false;
  const res = await mmApi('DELETE', `/channels/${channelId}`);
  return res.ok;
}

export async function createChannel(teamId: string, name: string, displayName: string, type: 'O' | 'P', purpose?: string): Promise<MmChannel | null> {
  if (!MM_TOKEN) return null;
  const res = await mmApi('POST', '/channels', {
    team_id: teamId,
    name,
    display_name: displayName,
    type,
    purpose: purpose || '',
  });
  return res.ok ? res.json() : null;
}

export async function deleteTeam(teamId: string): Promise<boolean> {
  if (!MM_TOKEN) return false;
  const res = await mmApi('DELETE', `/teams/${teamId}?permanent=true`);
  return res.ok;
}

export async function postToChannelById(channelId: string, message: string): Promise<boolean> {
  if (!MM_TOKEN) return false;
  const res = await mmApi('POST', '/posts', { channel_id: channelId, message });
  return res.ok;
}

export async function getRecentPosts(channelId: string, perPage = 10): Promise<Array<{ id: string; message: string; create_at: number; user_id: string }>> {
  if (!MM_TOKEN) return [];
  const res = await mmApi('GET', `/channels/${channelId}/posts?per_page=${perPage}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.order.map((id: string) => data.posts[id]);
}

// Open a Mattermost interactive dialog in response to an action button click.
// Call this from the /api/mattermost/actions handler with the `trigger_id`
// Mattermost sends on the action payload. The dialog's `url` must point at
// an endpoint you own that handles the submission (e.g. /api/mattermost/dialog-submit).
export async function openDialog(params: {
  triggerId: string;
  url: string;
  dialog: {
    callback_id: string;
    title: string;
    introduction_text?: string;
    elements: Array<{
      display_name: string;
      name: string;
      type: 'text' | 'textarea' | 'select' | 'checkbox';
      optional?: boolean;
      max_length?: number;
      placeholder?: string;
    }>;
    submit_label: string;
    notify_on_cancel?: boolean;
    state?: string;
  };
}): Promise<boolean> {
  if (!MM_TOKEN) {
    console.log('[mattermost] No bot token configured. Would open dialog:', params.dialog.callback_id);
    return false;
  }
  const res = await mmApi('POST', '/actions/dialogs/open', {
    trigger_id: params.triggerId,
    url: params.url,
    dialog: params.dialog,
  });
  if (!res.ok) {
    console.error('[mattermost] openDialog failed:', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}
