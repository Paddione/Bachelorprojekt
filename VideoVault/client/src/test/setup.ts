import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Polyfill ResizeObserver for jsdom
class ResizeObserverPolyfill {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }
  observe() { }
  unobserve() { }
  disconnect() { }
}

// Set ResizeObserver for test environment
const ResizeObserverType = (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver })
  .ResizeObserver;
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  ResizeObserverType || ResizeObserverPolyfill;

// Silence Dialog accessibility warnings in tests (we assert behavior separately)
const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Missing `Description` or `aria-describedby`')
  ) {
    return;
  }
  originalError(...(args as Parameters<typeof console.error>));
};

export { };

// Ensure DOM cleanup between tests to avoid cross-test interference
afterEach(() => {
  cleanup();
});

// Global test environment utilities/mocks
// URL.createObjectURL/revokeObjectURL
const globalURL = (globalThis as unknown as { URL?: typeof URL }).URL;
if (!globalURL) (globalThis as unknown as { URL: typeof URL }).URL = {} as unknown as typeof URL;
const urlObj = (globalThis as unknown as { URL: typeof URL }).URL as typeof URL & {
  createObjectURL?: typeof URL.createObjectURL;
  revokeObjectURL?: typeof URL.revokeObjectURL;
};
urlObj.createObjectURL = urlObj.createObjectURL || vi.fn(() => 'blob:mock');
urlObj.revokeObjectURL = urlObj.revokeObjectURL || vi.fn();

// window.alert noop (used in preset import/export)
const globalAlert = (globalThis as unknown as { alert?: typeof alert }).alert;
if (!globalAlert)
  (globalThis as unknown as { alert: typeof alert }).alert = vi.fn() as unknown as typeof alert;

// Basic FileReader mock
class FileReaderMock {
  onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
  result: string | ArrayBuffer | null = null;
  readAsText(file: Blob) {
    const reader = this as unknown as FileReaderMock;
    const fr = (globalThis as unknown as { FileReader?: typeof FileReader }).FileReader
      ? new (globalThis as unknown as { FileReader: typeof FileReader }).FileReader()
      : null;
    // Simple immediate success path
    reader.result = (file as unknown as { __mockText?: string }).__mockText || '';
    this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
  }
}
const globalFileReader = (globalThis as unknown as { FileReader?: typeof FileReader }).FileReader;
(globalThis as unknown as { FileReader: typeof FileReader }).FileReader = (globalFileReader ||
  FileReaderMock) as unknown as typeof FileReader;

// File System Access API mocks for deterministic testing
import { installFileSystemAccessAPIMocks } from './fs-api-mock';

// Install default mock filesystem
export const mockFileSystem = installFileSystemAccessAPIMocks();

// Slim heavy UI primitives in tests (Radix Dialog)
vi.mock('@/components/ui/dialog', async () => {
  // Use simple passthrough components to avoid portals/focus mgmt in jsdom
  const React = await import('react');
  // Strip Radix-specific handler props like `onOpenChange` to avoid React DOM warnings
  const Pass = ({
    children,
    onOpenChange,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', props, children);
  return {
    Dialog: Pass,
    DialogPortal: Pass,
    DialogOverlay: Pass,
    DialogClose: Pass,
    DialogTrigger: Pass,
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogFooter: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
  };
});

// Slim Radix Popover to simple passthroughs (no portal/state)
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react');
  const Pass = ({
    children,
    onOpenChange,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', props, children);
  return {
    Popover: Pass,
    PopoverTrigger: Pass,
    PopoverContent: Pass,
  };
});

// Mock react-i18next so t() returns the key (with interpolation values appended)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object') {
        const vars = Object.entries(opts)
          .filter(([k]) => k !== 'defaultValue')
          .map(([, v]) => v)
          .join(', ');
        return vars ? `${key} ${vars}` : key;
      }
      return key;
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
  withTranslation: () => (Component: any) => {
    Component.defaultProps = {
      ...Component.defaultProps,
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    };
    return Component;
  },
  Trans: ({ children }: any) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Avoid pulling in heavy instant-search stack; delegate to basic FilterEngine
vi.mock('@/services/enhanced-filter-engine', () => {
  function videoHasCategory(video: any, categoryKey: string): boolean {
    const parts = categoryKey.split(':');
    if (parts[0] === 'custom') {
      const type = parts[1];
      const val = parts.slice(2).join(':');
      return (
        Array.isArray(video?.customCategories?.[type]) && video.customCategories[type].includes(val)
      );
    }
    const type = parts[0];
    const val = parts.slice(1).join(':');
    return Array.isArray(video?.categories?.[type]) && video.categories[type].includes(val);
  }

  function getAvailableCategories(videos: any[]) {
    const map = new Map<string, number>();
    for (const v of videos) {
      Object.entries(v.categories || {}).forEach(([type, values]: any) => {
        (values || []).forEach((value: string) => {
          const key = `${type}:${value}`;
          map.set(key, (map.get(key) || 0) + 1);
        });
      });
      Object.entries(v.customCategories || {}).forEach(([type, values]: any) => {
        (values || []).forEach((value: string) => {
          const key = `custom:${type}:${value}`;
          map.set(key, (map.get(key) || 0) + 1);
        });
      });
    }
    return Array.from(map.entries()).map(([key, count]) => {
      const [type, ...valueParts] = key.split(':');
      const isCustom = type === 'custom';
      return {
        type: isCustom ? valueParts[0] : type,
        value: isCustom ? valueParts.slice(1).join(':') : valueParts.join(':'),
        count,
        isCustom,
      };
    });
  }

  function applyFilters(
    videos: any[],
    selected: string[],
    q: string = '',
    advanced?: any,
  ): typeof videos {
    let res: typeof videos = videos;
    if (selected?.length) {
      res = res.filter((v) => selected.every((ck) => videoHasCategory(v, ck)));
    }
    if (q && q.trim()) {
      const qq = q.toLowerCase();
      res = res.filter(
        (v) =>
          (v.displayName || '').toLowerCase().includes(qq) ||
          (v.filename || '').toLowerCase().includes(qq) ||
          Object.values(v.categories || {})
            .flat()
            .some((c: any) => String(c).toLowerCase().includes(qq)) ||
          Object.values(v.customCategories || {})
            .flat()
            .some((c: any) => String(c).toLowerCase().includes(qq)),
      );
    }
    if (advanced) {
      const { dateRange, fileSizeRange, durationRange } = advanced;
      if (dateRange?.startDate && dateRange?.endDate) {
        const start = new Date(dateRange.startDate).getTime();
        const end = new Date(dateRange.endDate).getTime() + 86_399_999; // end of day
        res = res.filter((v) => {
          const t = new Date(v.lastModified).getTime();
          return t >= start && t <= end;
        });
      }
      if ((fileSizeRange?.min || 0) > 0 || (fileSizeRange?.max || 0) > 0) {
        res = res.filter((v) => {
          const s = v.size || 0;
          const min = fileSizeRange.min || 0;
          const max = fileSizeRange.max || 0;
          if (min > 0 && max > 0) return s >= min && s <= max;
          if (min > 0) return s >= min;
          if (max > 0) return s <= max;
          return true;
        });
      }
      if ((durationRange?.min || 0) > 0 || (durationRange?.max || 0) > 0) {
        res = res.filter((v) => {
          const d = v.metadata?.duration || 0;
          const min = durationRange.min || 0;
          const max = durationRange.max || 0;
          if (min > 0 && max > 0) return d >= min && d <= max;
          if (min > 0) return d >= min;
          if (max > 0) return d <= max;
          return true;
        });
      }
    }
    return res;
  }

  function updateFilterCounts(
    allVideos: any[],
    selected: string[],
    q: string = '',
    advanced?: any,
  ) {
    const allCats = getAvailableCategories(allVideos);
    return allCats.map((cat) => {
      const key = cat.isCustom ? `custom:${cat.type}:${cat.value}` : `${cat.type}:${cat.value}`;
      const withCat = selected.includes(key) ? selected : [...selected, key];
      const filtered = applyFilters(allVideos, withCat, q, advanced);
      return { ...cat, count: filtered.length };
    });
  }

  return {
    EnhancedFilterEngine: {
      applyFiltersWithSearch: applyFilters,
      updateFilterCountsWithSearch: updateFilterCounts,
      getSuggestions: (_q: string) => [],
      initializeSearchIndex: (_videos: any[]) => { },
      updateSearchIndex: (_updated: any[], _prev: any[]) => { },
      updateVideoInSearchIndex: (_video: any) => { },
      searchWithDetails: (videos: any[], query: string) => ({
        results: applyFilters(videos, [], query),
        searchResults: [],
        stats: {},
      }),
    },
  };
});
