// Mattermost API helper for interactive messages and bot actions.

const MM_URL = process.env.MATTERMOST_URL || 'http://mattermost.workspace.svc.cluster.local:8065';
const MM_TOKEN = process.env.MATTERMOST_BOT_TOKEN || '';
const WEBHOOK_URL = process.env.MATTERMOST_WEBHOOK_URL || '';
const SITE_URL = process.env.SITE_URL || 'https://web.${PROD_DOMAIN}';

function mmApi(method: string, endpoint: string, body?: unknown) {
  return fetch(`${MM_URL}/api/v4${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${MM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
}): Promise<string | null> {
  if (!MM_TOKEN) {
    console.log('[mattermost] No bot token configured. Would post interactive message:', JSON.stringify(params, null, 2));
    return null;
  }

  const res = await mmApi('POST', '/posts', {
    channel_id: params.channelId,
    message: params.text,
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
    purpose: `Kundenkanal fur ${customerName} — Termine, Meetings, Dokumente`,
    type: 'P', // Private channel
  });

  if (res.ok) {
    const ch = await res.json();
    return { id: ch.id, name: channelName, created: true };
  }

  console.error('[mattermost] Failed to create customer channel:', res.status);
  return null;
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
