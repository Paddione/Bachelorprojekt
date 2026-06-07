import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Express, Request, Response } from 'express';
import multer from 'multer';

export const MAX_SKIN_BYTES = 20 * 1024 * 1024; // 20 MB

// Storage root: brett/public/assets/skins/<uuid>/
const SKINS_ROOT = path.join(__dirname, '..', '..', 'public', 'assets', 'skins');

export function checkSkinAuth(
  headerValue: string | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  const secret = env.BRETT_OIDC_SECRET;
  return !!secret && headerValue === secret;
}

export function validateGlbSize(byteLength: number): boolean {
  return byteLength <= MAX_SKIN_BYTES;
}

// Parse the GLB JSON chunk and check for a node named 'mixamorigHips'.
// Returns false on any parse failure (fail-closed).
export function glbHasMixamoBones(buf: Buffer): boolean {
  try {
    if (buf.length < 20) return false;
    if (buf.toString('ascii', 0, 4) !== 'glTF') return false;
    const jsonChunkLen = buf.readUInt32LE(12);
    const jsonChunkType = buf.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) return false; // not 'JSON'
    const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
    const gltf = JSON.parse(jsonStr);
    const nodes: Array<{ name?: string }> = Array.isArray(gltf.nodes) ? gltf.nodes : [];
    return nodes.some((n) => n.name === 'mixamorigHips');
  } catch {
    return false;
  }
}

export interface SkinMeta {
  id: string;
  name: string;
  source: string;
  animations: string[];
  created_at: string;
}

// Persist the GLB + meta.json; returns the generated skin id.
export function storeSkin(buf: Buffer, name: string): SkinMeta {
  const id = randomUUID();
  const dir = path.join(SKINS_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'skin.glb'), buf);
  const meta: SkinMeta = {
    id,
    name,
    source: 'hunyuan3d-2',
    animations: [],
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

// Wire POST /api/skins/upload onto the Express app.
export function attachSkinsUpload(app: Express): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SKIN_BYTES + 1 }, // +1 so we can return 413 ourselves
  });

  // Multer's stream-level size guard fires before our handler for very large
  // uploads. Wrap single() so its LIMIT_FILE_SIZE error maps to a 413 instead
  // of bubbling to the generic 500 handler.
  const singleGlb = upload.single('glb');
  const uploadGlb = (req: Request, res: Response, next: (err?: unknown) => void) => {
    singleGlb(req, res, (err: unknown) => {
      if (err && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'glb exceeds 20 MB' });
      }
      if (err) return next(err);
      next();
    });
  };

  app.post(
    '/api/skins/upload',
    uploadGlb,
    (req: Request & { file?: Express.Multer.File }, res: Response) => {
      if (!checkSkinAuth(req.header('x-e2e-secret') ?? undefined, process.env)) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const file = req.file;
      const name = String((req.body && req.body.name) || '').trim() || 'skin';
      if (!file) {
        return res.status(400).json({ error: 'glb file required' });
      }
      if (!validateGlbSize(file.size)) {
        return res.status(413).json({ error: 'glb exceeds 20 MB' });
      }
      if (!glbHasMixamoBones(file.buffer)) {
        return res.status(422).json({ error: 'missing mixamorigHips bone' });
      }
      const meta = storeSkin(file.buffer, name);
      return res.status(200).json({ id: meta.id, animations: meta.animations });
    },
  );
}
