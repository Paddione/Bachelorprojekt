import { AppSettingsService } from './app-settings';
import { serverHealth } from './server-health';

export interface WatchState {
  position: number;
  duration?: number;
  completed?: boolean;
  updatedAt?: string;
}

export type WatchStatesByRoot = Record<string, Record<string, WatchState>>;

export class WatchStateService {
  private static state: WatchStatesByRoot = {};
  private static hydrated = false;

  static getSnapshot(): WatchStatesByRoot {
    return this.state;
  }

  private static normalize(raw?: WatchStatesByRoot | null): WatchStatesByRoot {
    const cleaned: WatchStatesByRoot = {};
    const source = raw || {};

    Object.entries(source).forEach(([rootKey, entries]) => {
      if (!entries || typeof entries !== 'object') return;
      const videos: Record<string, WatchState> = {};
      Object.entries(entries as Record<string, any>).forEach(([videoId, value]) => {
        const pos = Number(value?.position);
        if (!Number.isFinite(pos) || pos < 0) return;
        const duration = Number(value?.duration);
        const normalized: WatchState = {
          position: pos,
        };
        if (Number.isFinite(duration) && duration >= 0) {
          normalized.duration = duration;
        }
        if (typeof value?.completed === 'boolean') {
          normalized.completed = value.completed;
        }
        normalized.updatedAt =
          typeof value?.updatedAt === 'string' && value.updatedAt
            ? value.updatedAt
            : new Date().toISOString();
        videos[videoId] = normalized;
      });
      if (Object.keys(videos).length > 0) {
        cleaned[rootKey] = videos;
      }
    });

    return cleaned;
  }

  static async hydrate(): Promise<WatchStatesByRoot> {
    if (this.hydrated) return this.state;
    if (!(await serverHealth.isHealthy())) return this.state;
    try {
      const stored = await AppSettingsService.getJson<WatchStatesByRoot>('vv.watchStates');
      this.state = this.normalize(stored);
      this.hydrated = true;
    } catch {
      serverHealth.markUnhealthy();
    }
    return this.state;
  }

  static async ensureHydrated(): Promise<WatchStatesByRoot> {
    if (this.hydrated) return this.state;
    return this.hydrate();
  }

  static async replaceAll(next: WatchStatesByRoot): Promise<void> {
    this.state = this.normalize(next);
    this.hydrated = true;
    await this.persist();
  }

  static async upsert(rootKey: string, videoId: string, state: WatchState): Promise<void> {
    await this.ensureHydrated();
    const normalized = this.normalize({ [rootKey]: { [videoId]: state } });
    if (!normalized[rootKey]) return;
    this.state[rootKey] = {
      ...(this.state[rootKey] || {}),
      ...normalized[rootKey],
    };
    await this.persist();
  }

  private static async persist(): Promise<void> {
    if (!(await serverHealth.isHealthy())) return;
    try {
      await AppSettingsService.setJson('vv.watchStates', this.state);
    } catch {
      serverHealth.markUnhealthy();
    }
  }
}
