let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function ensureWorker(): Worker | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!('Worker' in window)) return null;
    // OffscreenCanvas is needed to render/encode in worker
    if (!('OffscreenCanvas' in window)) return null;
    if (!workerInstance) {
      workerInstance = new Worker(new URL('./workers/thumbnail-worker.ts', import.meta.url), {
        type: 'module',
      });
      workerInstance.onmessage = (event: MessageEvent) => {
        const { id, ok, result, error } = event.data || {};
        if (!id) return;
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        if (ok) entry.resolve(result);
        else entry.reject(new Error(error || 'Worker error'));
      };
      workerInstance.onerror = (e: ErrorEvent) => {
        // fail all pending without relying on Map iteration protocol
        pending.forEach((entry) => entry.reject(e.error || new Error(e.message)));
        pending.clear();
        // reset instance to allow retry next call
        workerInstance = null;
      };
    }
    return workerInstance;
  } catch (_e) {
    return null;
  }
}

function postToWorker<TPayload, TResult>(type: string, payload: TPayload): Promise<TResult> {
  const worker = ensureWorker();
  if (!worker) return Promise.reject(new Error('Worker not available'));
  const id = nextRequestId++;
  return new Promise<TResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      (worker as any).postMessage({ id, type, payload }, transferablesFromPayload(payload));
    } catch (e) {
      pending.delete(id);
      reject(e);
    }
  });
}

function transferablesFromPayload(payload: any): Transferable[] {
  const list: Transferable[] = [];
  if (payload && payload.imageBitmap && typeof payload.imageBitmap.close === 'function') {
    // ImageBitmap is transferable
    list.push(payload.imageBitmap as unknown as Transferable);
  }
  return list;
}

export async function encodeImageBitmapInWorker(
  imageBitmap: ImageBitmap,
  width: number,
  height: number,
  quality = 0.8,
): Promise<string> {
  const res = await postToWorker<any, { dataUrl: string }>('encodeImage', {
    imageBitmap,
    width,
    height,
    quality,
  });
  return res.dataUrl;
}

export function supportsThumbnailWorker(): boolean {
  return !!ensureWorker();
}

// Testing utility and health check
export async function pingWorker<T = any>(payload: T): Promise<T> {
  return postToWorker<T, T>('ping', payload);
}

// Test-only reset to clear cached worker
export function __resetThumbnailWorkerForTests(): void {
  try {
    workerInstance?.terminate?.();
  } catch {}
  workerInstance = null;
  pending.clear();
  nextRequestId = 1;
}
