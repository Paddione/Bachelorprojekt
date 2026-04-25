// HMAC verification for incoming Talk bot webhooks, and signed replies.
// Per Nextcloud Talk Bots API (verified against spreed/lib source):
//   Incoming webhook (Nextcloud → bot):
//     - X-Nextcloud-Talk-Random: nonce (≥32 chars)
//     - X-Nextcloud-Talk-Signature: hex SHA256(random + json_body) using shared secret
//     (Talk hashes its full JSON request body — see Service/BotService.php sendAsyncRequest)
//   Outgoing reply (bot → /ocs/v2.php/apps/spreed/api/v1/bot/<token>/message):
//     - X-Nextcloud-Talk-Bot-Random: nonce (≥32 chars)
//     - X-Nextcloud-Talk-Bot-Signature: hex SHA256(random + message_text) using same secret
//     (Talk hashes ONLY the message text param, not the json body — see
//     Controller/BotController.php getBotFromHeaders called with $message)

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
  const referenceId = `brett-${Date.now()}`;
  const body = JSON.stringify({ message, referenceId });
  // Talk's BotController.php verifies the OUTGOING reply by hashing
  // (random + $message), where $message is the `message` JSON field —
  // NOT the full JSON body. Sign only the message text.
  const random = randomBytes(32).toString('hex');
  const signature = hmacHex(secret, random, message);

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
