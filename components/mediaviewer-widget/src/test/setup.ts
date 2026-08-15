import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

class ResizeObserverPolyfill {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const existingRO = (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  existingRO || ResizeObserverPolyfill as unknown as typeof ResizeObserver;

const urlObj = (globalThis as unknown as { URL: typeof URL }).URL as typeof URL & {
  createObjectURL?: typeof URL.createObjectURL;
  revokeObjectURL?: typeof URL.revokeObjectURL;
};
urlObj.createObjectURL = urlObj.createObjectURL || vi.fn(() => 'blob:mock');
urlObj.revokeObjectURL = urlObj.revokeObjectURL || vi.fn();

afterEach(() => {
  cleanup();
});
