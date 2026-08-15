import path from 'path';
import * as shareTokens from './share-tokens';
import * as auth from './auth';
import * as phases from './phases';
import type { Role } from '../types/state';
import { asyncHandler } from './helpers';

export function attachShareRoutes(app: any, staticDir: string): void {
  // ─── Public share links (T000608) — NO Keycloak gate ──────────────────────────
  app.get('/share/:token', asyncHandler(async (req: any, res: any) => {
    const roomToken = await shareTokens.resolveShareToken(req.params.token);
    if (!roomToken) return res.status(404).type('text/plain').send('Link ungültig oder deaktiviert.');
    res.sendFile(path.join(staticDir, 'share.html'));
  }));

  app.get('/api/share/:token', asyncHandler(async (req: any, res: any) => {
    const roomToken = await shareTokens.resolveShareToken(req.params.token);
    if (!roomToken) return res.status(404).json({ error: 'invalid_token' });
    res.json({ valid: true, roomToken });
  }));

  const leiterOrAdmin = auth.requireLeiterOrAdmin(
    (room: string) => (phases.buildStateFromMutations(room)?.roles ?? {}) as Record<string, Role>,
  );

  app.post('/api/rooms/:roomToken/share', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const { roomToken } = req.params;
    const userId = req.session?.userId;
    const token = await shareTokens.createShareToken(roomToken, userId);
    const baseUrl = process.env.BRETT_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ token, url: `${baseUrl}/share/${token}` });
  }));

  app.get('/api/rooms/:roomToken/shares', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const tokens = await shareTokens.listShareTokens(req.params.roomToken);
    res.json({ tokens });
  }));

  app.delete('/api/rooms/:roomToken/share/:token', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const ok = await shareTokens.disableShareToken(req.params.token, req.params.roomToken);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ disabled: true });
  }));

  app.get('/zuschauer/:token', asyncHandler(async (req: any, res: any) => {
    const roomToken = await shareTokens.resolveZuschauerToken(req.params.token);
    if (!roomToken) return res.status(404).type('text/plain').send('Zuschauer-Link ungültig oder deaktiviert.');
    res.sendFile(path.join(staticDir, 'zuschauer.html'));
  }));

  app.get('/api/zuschauer/:token', asyncHandler(async (req: any, res: any) => {
    const roomToken = await shareTokens.resolveZuschauerToken(req.params.token);
    if (!roomToken) return res.status(404).json({ error: 'invalid_token' });
    res.json({ valid: true, roomToken });
  }));

  app.post('/api/rooms/:roomToken/zuschauer-share', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const { roomToken } = req.params;
    const userId = req.session?.userId;
    const token = await shareTokens.createZuschauerToken(roomToken, userId);
    const baseUrl = process.env.BRETT_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ token, url: `${baseUrl}/zuschauer/${token}` });
  }));

  app.get('/api/rooms/:roomToken/zuschauer-shares', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const tokens = await shareTokens.listZuschauerTokens(req.params.roomToken);
    res.json({ tokens });
  }));

  app.delete('/api/rooms/:roomToken/zuschauer-share/:token', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const ok = await shareTokens.disableZuschauerToken(req.params.token, req.params.roomToken);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ disabled: true });
  }));
}
