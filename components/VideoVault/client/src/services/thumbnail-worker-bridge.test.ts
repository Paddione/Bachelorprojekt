import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pingWorker, encodeImageBitmapInWorker, supportsThumbnailWorker, __resetThumbnailWorkerForTests } from './thumbnail-worker-bridge';

class MockWorkerSuccess {
	onmessage: ((ev: MessageEvent) => any) | null = null;
	onerror: ((ev: ErrorEvent) => any) | null = null;
	constructor(_url: URL, _opts?: { type?: string }) {}
	postMessage(message: any, _transfer?: any[]) {
		setTimeout(() => {
			const { id, type, payload } = message;
			if (type === 'ping') {
				this.onmessage?.({ data: { id, ok: true, result: payload } } as any);
			} else if (type === 'encodeImage') {
				this.onmessage?.({ data: { id, ok: true, result: { dataUrl: 'data:image/jpeg;base64,AAA' } } } as any);
			} else {
				this.onmessage?.({ data: { id, ok: false, error: 'unknown type' } } as any);
			}
		}, 0);
	}
	terminate() {}
}

class MockWorkerError {
	onmessage: ((ev: MessageEvent) => any) | null = null;
	onerror: ((ev: ErrorEvent) => any) | null = null;
	constructor(_url: URL, _opts?: { type?: string }) {}
	postMessage(message: any, _transfer?: any[]) {
		setTimeout(() => {
			const { id } = message;
			this.onmessage?.({ data: { id, ok: false, error: 'boom' } } as any);
		}, 0);
	}
	terminate() {}
}

const originalWorker = globalThis.Worker;
const originalOffscreen = (globalThis as any).OffscreenCanvas;

beforeEach(() => {
	(globalThis as any).Worker = MockWorkerSuccess as any;
	(globalThis as any).OffscreenCanvas = class {} as any;
	__resetThumbnailWorkerForTests();
});

afterEach(() => {
	(globalThis as any).Worker = originalWorker as any;
	(globalThis as any).OffscreenCanvas = originalOffscreen;
	__resetThumbnailWorkerForTests();
});

describe('thumbnail-worker-bridge', () => {
	it('supportsThumbnailWorker() returns true when Worker and OffscreenCanvas exist', () => {
		expect(supportsThumbnailWorker()).toBe(true);
	});

	it('pingWorker echoes payload (roundtrip)', async () => {
		const payload = { foo: 'bar', n: 42 };
		const res = await pingWorker(payload);
		expect(res).toEqual(payload);
	});

	it('encodeImageBitmapInWorker returns dataUrl on success', async () => {
		const fakeBitmap: any = { close: () => {} };
		const url = await encodeImageBitmapInWorker(fakeBitmap, 320, 180, 0.8);
		expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
	});

	it('encodeImageBitmapInWorker rejects on worker error', async () => {
		(globalThis as any).Worker = MockWorkerError as any;
		__resetThumbnailWorkerForTests();
		const fakeBitmap: any = { close: () => {} };
		await expect(encodeImageBitmapInWorker(fakeBitmap, 320, 180, 0.8)).rejects.toThrow('boom');
	});
});
