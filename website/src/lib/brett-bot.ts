// HMAC verification for incoming Talk bot webhooks, and signed replies.
// Per Nextcloud Talk Bots API:
//   Incoming webhook (Nextcloud → bot):
//     - X-Nextcloud-Talk-Random: nonce
//     - X-Nextcloud-Talk-Signature: hex SHA256(random + body) using shared secret
//   Outgoing reply (bot → /ocs/v2.php/apps/spreed/api/v1/bot/<token>/message):
//     - X-Nextcloud-Talk-Bot-Random: nonce
//     - X-Nextcloud-Talk-Bot-Signature: hex SHA256(random + body) using same secret

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const NC_URL = process.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';

function hmacHex(secret: string, random: string, body: string): string {
  return createHmac('sha256', secret).update(random).update(body).digest('hex');
}

export function verifyTalkSignature(
  secret: string,
  random: string,
  body: string,
  signatureHex: string
): boolean {
  if (!secret || !random || !signatureHex) return false;
  const expected = hmacHex(secret, random, body);
  if (expected.length !== signatureHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export async function postBotReply(
  roomToken: string,
  message: string,
  secret: string
): Promise<boolean> {
  const body = JSON.stringify({ message, referenceId: `brett-${Date.now()}` });
  const random = randomBytes(32).toString('hex');
  const signature = hmacHex(secret, random, body);

  try {
    const res = await fetch(
      `${NC_URL}/ocs/v2.php/apps/spreed/api/v1/bot/${encodeURIComponent(roomToken)}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OCS-APIRequest': 'true',
          Accept: 'application/json',
          'X-Nextcloud-Talk-Bot-Random': random,
          'X-Nextcloud-Talk-Bot-Signature': signature,
        },
        body,
      }
    );
    if (!res.ok) {
      console.error('[brett-bot] reply failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[brett-bot] reply error:', err);
    return false;
  }
}
