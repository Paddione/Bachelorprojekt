import { ApiClient } from './api-client';
import { serverHealth } from './server-health';
const E2E_MSW_ENABLED = (import.meta as any)?.env?.VITE_E2E_MSW === 'true';

type Parser<T> = (raw: string | null) => T | undefined;
type Serializer<T> = (val: T) => string;

// Migration/normalization rules for legacy values
const LEGACY_MIGRATIONS: Record<string, (raw: string | null) => unknown> = {
  // vv.shuffle used to be stored as '0'/'1'; normalize to boolean
  'vv.shuffle': (raw) => {
    if (raw === '0') return false;
    if (raw === '1') return true;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  },
};

export class AppSettingsService {
  // Generic typed getter with optional parser
  static async get<T = unknown>(key: string, parser?: Parser<T>): Promise<T | undefined> {
    if (!E2E_MSW_ENABLED && !(await serverHealth.isHealthy())) return undefined;
    try {
      const res = await ApiClient.get<{ key: string; value: string | null }>(
        `/api/settings/${encodeURIComponent(key)}`,
      );
      // Apply legacy migration if any
      const migrated =
        key in LEGACY_MIGRATIONS
          ? LEGACY_MIGRATIONS[key](res?.value ?? null)
          : (res?.value ?? null);

      const raw =
        typeof migrated === 'string'
          ? migrated
          : migrated === null
            ? null
            : JSON.stringify(migrated);

      if (parser) {
        const parsed = parser(raw);
        // If migration changed the representation, persist normalized value when possible
        if (parsed !== undefined && raw !== null && key in LEGACY_MIGRATIONS) {
          try {
            await AppSettingsService.set<T>(key, parsed);
          } catch {}
        }
        return parsed;
      }

      // Default parsing behavior
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Handle common primitives stored as strings
        if (raw === 'true') return true as unknown as T;
        if (raw === 'false') return false as unknown as T;
        if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw) as unknown as T;
        return raw as unknown as T;
      }
    } catch {
      serverHealth.markUnhealthy();
      return undefined;
    }
  }

  static async getJson<T = any>(key: string): Promise<T | undefined> {
    if (!E2E_MSW_ENABLED && !(await serverHealth.isHealthy())) return undefined;
    try {
      const res = await ApiClient.get<{ key: string; value: string | null }>(
        `/api/settings/${encodeURIComponent(key)}`,
      );
      const raw = res?.value ?? null;
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        /* not json */
      }
      return raw as unknown as T;
    } catch {
      serverHealth.markUnhealthy();
      return undefined;
    }
  }

  // Generic typed setter with optional serializer
  static async set<T = unknown>(key: string, value: T, serializer?: Serializer<T>): Promise<void> {
    if (!E2E_MSW_ENABLED && !(await serverHealth.isHealthy())) return;
    try {
      const payloadValue = serializer
        ? serializer(value)
        : typeof value === 'string'
          ? value
          : (value as any);
      await ApiClient.post(`/api/settings/${encodeURIComponent(key)}`, { value: payloadValue });
    } catch {
      serverHealth.markUnhealthy();
    }
  }

  static async setJson(key: string, value: any): Promise<void> {
    if (!E2E_MSW_ENABLED && !(await serverHealth.isHealthy())) return;
    try {
      await ApiClient.post(`/api/settings/${encodeURIComponent(key)}`, { value });
    } catch {
      serverHealth.markUnhealthy();
    }
  }

  static async remove(key: string): Promise<void> {
    if (!E2E_MSW_ENABLED && !(await serverHealth.isHealthy())) return;
    try {
      await ApiClient.delete(`/api/settings/${encodeURIComponent(key)}`);
    } catch {
      serverHealth.markUnhealthy();
    }
  }
}
