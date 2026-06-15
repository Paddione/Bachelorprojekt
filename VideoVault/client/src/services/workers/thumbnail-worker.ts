// Worker: encode ImageBitmap to JPEG data URL off-main-thread
export {};

// Minimal message protocol
// Incoming: { id: number; type: 'encodeImage' | 'ping'; payload: any }
// Outgoing: { id: number; ok: true; result: any } | { id: number; ok: false; error: string }

self.onmessage = (event: MessageEvent) => {
  const data = event.data as { id: number; type: string; payload: any };
  const { id, type, payload } = data || {};

  const replyOk = (result: any) => {
    (self as any).postMessage({ id, ok: true, result });
  };
  const replyErr = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    (self as any).postMessage({ id, ok: false, error: message });
  };

  void (async () => {
    try {
      switch (type) {
        case 'ping': {
          // Echo back payload for testing roundtrip
          return replyOk(payload);
        }
        case 'encodeImage': {
          // payload: { imageBitmap: ImageBitmap; width: number; height: number; quality?: number }
          const { imageBitmap, width, height, quality } = payload ?? {};
          if (!imageBitmap || typeof width !== 'number' || typeof height !== 'number') {
            throw new Error('Invalid encodeImage payload');
          }

          // Draw onto OffscreenCanvas and encode to JPEG
          const canvas = new OffscreenCanvas(
            Math.max(1, Math.floor(width)),
            Math.max(1, Math.floor(height)),
          );
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Failed to acquire 2D context');
          ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

          const blob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: typeof quality === 'number' ? quality : 0.8,
          });
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = arrayBufferToBase64(arrayBuffer);
          const dataUrl = `data:image/jpeg;base64,${base64}`;
          return replyOk({ dataUrl });
        }
        default:
          throw new Error(`Unknown worker message type: ${String(type)}`);
      }
    } catch (err) {
      replyErr(err);
    }
  })();
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
  }
  // btoa is available in worker global
  return btoa(binary);
}
