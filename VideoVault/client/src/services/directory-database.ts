export interface DirectoryRootsState {
  lastRootKey: string | null;
  roots: Record<
    string,
    {
      name: string;
      directories: string[]; // stored as normalized paths like "sub/dir/"
    }
  >;
}

import { ApiClient } from './api-client';
import { serverHealth } from './server-health';
import { AppSettingsService } from './app-settings';

export class DirectoryDatabase {
  // In-memory state only. DB is the source of truth.
  private static state: DirectoryRootsState = { lastRootKey: null, roots: {} };

  // Hydrate from server into in-memory state
  static async hydrateFromServer(): Promise<void> {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      const resp = await ApiClient.get<{
        roots: Array<{ rootKey: string; name: string; directories: string[] }>;
      }>(`/api/roots`);
      const last = await ApiClient.get<{ lastRootKey: string | null }>(`/api/roots/last`);
      const roots: DirectoryRootsState['roots'] = {};
      for (const r of resp.roots || []) {
        roots[r.rootKey] = {
          name: r.name,
          directories: (r.directories || []).map(this.normalizeDir),
        };
      }
      this.state = { lastRootKey: last.lastRootKey ?? null, roots };
    } catch {
      serverHealth.markUnhealthy();
    }
  }

  static async setRootDirectories(
    rootKey: string,
    directories: string[],
    rootName?: string,
  ): Promise<void> {
    const name = rootName || this.state.roots[rootKey]?.name || rootKey;
    const dirs = Array.from(new Set(directories.map(this.normalizeDir)));
    this.state.roots[rootKey] = { name, directories: dirs };
    this.state.lastRootKey = rootKey;
    await this.syncSetRoot(rootKey, dirs, name);
  }

  static addDirectory(rootKey: string, path: string): void {
    const root = this.state.roots[rootKey] || { name: rootKey, directories: [] };
    const norm = this.normalizeDir(path);
    if (!root.directories.includes(norm)) {
      root.directories.push(norm);
    }
    this.state.roots[rootKey] = root;
    this.state.lastRootKey = rootKey;
    void this.syncAddDirectory(rootKey, norm);
  }

  static removeDirectory(rootKey: string, path: string): void {
    const root = this.state.roots[rootKey];
    if (!root) return;
    const norm = this.normalizeDir(path);
    root.directories = root.directories.filter((d) => !d.startsWith(norm));
    this.state.roots[rootKey] = root;
    void this.syncRemoveDirectory(rootKey, norm);
  }

  static getDirectories(rootKey: string): string[] {
    return this.state.roots[rootKey]?.directories || [];
  }

  static listRoots(): Array<{ rootKey: string; name: string }> {
    return Object.entries(this.state.roots).map(([rootKey, v]) => ({ rootKey, name: v.name }));
  }

  static getState(): DirectoryRootsState {
    const roots: DirectoryRootsState['roots'] = {};
    Object.entries(this.state.roots || {}).forEach(([rootKey, value]) => {
      roots[rootKey] = { name: value.name, directories: [...(value.directories || [])] };
    });
    return { lastRootKey: this.state.lastRootKey, roots };
  }

  static getLastRootKey(): string | null {
    return this.state.lastRootKey;
  }

  static setLastRootKey(rootKey: string): void {
    this.state.lastRootKey = rootKey;
    void this.syncSetLastRootKey(rootKey);
  }

  static removeRoot(rootKey: string): void {
    delete this.state.roots[rootKey];
    if (this.state.lastRootKey === rootKey)
      this.state.lastRootKey = Object.keys(this.state.roots)[0] || null;
    void this.syncDeleteRoot(rootKey);
  }

  static normalizeDir(path: string): string {
    const norm = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return norm ? `${norm}/` : '';
  }

  static async replaceState(next: DirectoryRootsState): Promise<void> {
    const normalizedRoots: DirectoryRootsState['roots'] = {};
    Object.entries(next?.roots || {}).forEach(([rootKey, value]) => {
      const dirs = Array.from(new Set((value?.directories || []).map(this.normalizeDir)));
      normalizedRoots[rootKey] = { name: value?.name || rootKey, directories: dirs };
    });

    const previousRoots = new Set(Object.keys(this.state.roots || {}));
    const incomingRoots = new Set(Object.keys(normalizedRoots));

    this.state = { lastRootKey: next?.lastRootKey ?? null, roots: normalizedRoots };

    // Delete roots that are no longer present
    for (const rootKey of previousRoots) {
      if (!incomingRoots.has(rootKey)) {
        await this.syncDeleteRoot(rootKey);
      }
    }

    // Upsert roots from import
    for (const [rootKey, value] of Object.entries(normalizedRoots)) {
      await this.syncSetRoot(rootKey, value.directories, value.name);
    }

    // Update lastRootKey in persistent settings
    if (this.state.lastRootKey) {
      await this.syncSetLastRootKey(this.state.lastRootKey);
    } else {
      await this.syncClearLastRootKey();
    }
  }

  // Remote sync helpers (best-effort)
  private static async syncSetRoot(rootKey: string, directories: string[], name: string) {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      await ApiClient.post(`/api/roots`, { rootKey, directories, name });
    } catch (e) {
      console.error('Failed to sync root:', e);
      serverHealth.markUnhealthy();
    }
  }
  private static async syncAddDirectory(rootKey: string, path: string) {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      await ApiClient.post(`/api/roots/add`, { rootKey, path });
    } catch {
      serverHealth.markUnhealthy();
    }
  }
  private static async syncRemoveDirectory(rootKey: string, path: string) {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      await ApiClient.post(`/api/roots/remove`, { rootKey, path });
    } catch {
      serverHealth.markUnhealthy();
    }
  }
  private static async syncDeleteRoot(rootKey: string) {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      await ApiClient.delete(`/api/roots/${encodeURIComponent(rootKey)}`);
    } catch {
      serverHealth.markUnhealthy();
    }
  }
  private static async syncSetLastRootKey(rootKey: string) {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      await ApiClient.post(`/api/roots/last`, { rootKey });
    } catch {
      serverHealth.markUnhealthy();
    }
  }

  private static async syncClearLastRootKey() {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      await AppSettingsService.remove('last_root_key');
    } catch {
      serverHealth.markUnhealthy();
    }
  }
}
