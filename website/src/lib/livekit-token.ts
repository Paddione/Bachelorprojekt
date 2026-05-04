import { AccessToken } from 'livekit-server-sdk';

const ROOM_NAME = 'main-stream';

export async function createViewerToken(
  userId: string,
  userName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: userName,
    ttl: '1h',
  });
  token.addGrant({ roomJoin: true, room: ROOM_NAME, canPublish: false, canSubscribe: true });
  return token.toJwt();
}

export async function createPublisherToken(
  userId: string,
  userName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: userName,
    ttl: '4h',
  });
  token.addGrant({
    roomJoin: true,
    room: ROOM_NAME,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: true,
  });
  return token.toJwt();
}
