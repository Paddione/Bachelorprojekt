import { FilterPreset } from '../types/video';
import { serverHealth } from './server-health';
import { ApiClient } from './api-client';

// In-memory cache only. DB is the source of truth.
let CACHE: FilterPreset[] = [];

export class FilterPresetsService {
  private static normalizePreset(preset: any): FilterPreset {
    const nowIso = new Date().toISOString();
    return {
      name: preset?.name || '',
      categories: Array.isArray(preset?.categories) ? preset.categories : [],
      searchQuery: preset?.searchQuery || '',
      dateRange: preset?.dateRange || { startDate: '', endDate: '' },
      fileSizeRange: preset?.fileSizeRange || { min: 0, max: 0 },
      durationRange: preset?.durationRange || { min: 0, max: 0 },
      createdAt: preset?.createdAt || nowIso,
      updatedAt: preset?.updatedAt || nowIso,
    };
  }

  static savePreset(
    name: string,
    categories: string[],
    searchQuery: string,
    advancedFilters: {
      dateRange: { startDate: string; endDate: string };
      fileSizeRange: { min: number; max: number };
      durationRange: { min: number; max: number };
    },
  ): void {
    const presets = this.loadAllPresets();

    const existingIndex = presets.findIndex((p) => p.name === name);

    const nowIso = new Date().toISOString();
    const preset: FilterPreset = {
      name,
      categories,
      searchQuery,
      dateRange: advancedFilters.dateRange,
      fileSizeRange: advancedFilters.fileSizeRange,
      durationRange: advancedFilters.durationRange,
      // Preserve original createdAt when overwriting; set updatedAt to now
      createdAt: existingIndex >= 0 ? presets[existingIndex].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
    } else {
      presets.push(preset);
    }

    // Update in-memory cache and persist remotely
    CACHE = presets;
    // Best-effort remote upsert
    void (async () => {
      if (!(await serverHealth.isHealthy())) return;
      try {
        await ApiClient.post(`/api/presets`, preset);
      } catch {
        serverHealth.markUnhealthy();
      }
    })();
  }

  static loadPreset(name: string): FilterPreset | null {
    const presets = this.loadAllPresets();
    return presets.find((p) => p.name === name) || null;
  }

  static loadAllPresets(): FilterPreset[] {
    // Return current in-memory cache
    const cached = CACHE;
    // Attempt to refresh from server in background
    void (async () => {
      if (!(await serverHealth.isHealthy())) return;
      try {
        const all = await ApiClient.get<FilterPreset[]>(`/api/presets`);
        CACHE = all.map((preset: any) => this.normalizePreset(preset)).filter((p) => !!p.name);
      } catch {
        serverHealth.markUnhealthy();
      }
    })();
    return cached;
  }

  static deletePreset(name: string): boolean {
    const presets = this.loadAllPresets();
    const filtered = presets.filter((p) => p.name !== name);

    if (filtered.length === presets.length) {
      return false; // No preset was deleted
    }

    CACHE = filtered;
    // Attempt remote delete
    void (async () => {
      if (!(await serverHealth.isHealthy())) return;
      try {
        await ApiClient.delete(`/api/presets/${encodeURIComponent(name)}`);
      } catch {
        serverHealth.markUnhealthy();
      }
    })();
    return true;
  }

  static exportPresets(): string {
    const presets = this.loadAllPresets();
    return JSON.stringify(presets, null, 2);
  }

  static importPresets(jsonData: string): number {
    try {
      const incoming = JSON.parse(jsonData);
      if (!Array.isArray(incoming)) {
        throw new Error('Invalid presets format');
      }

      const existing = this.loadAllPresets();
      const byName = new Map(existing.map((p) => [p.name, p] as const));

      let added = 0;
      for (const preset of incoming) {
        const name = preset?.name;
        if (!name || typeof name !== 'string') continue;
        if (byName.has(name)) {
          // Keep existing; do not overwrite
          continue;
        }
        // Normalize and add
        const normalized: FilterPreset = this.normalizePreset(preset);
        if (!normalized.name) continue;
        byName.set(name, normalized);
        added++;
      }

      const merged = Array.from(byName.values());
      CACHE = merged;
      // Push all imported presets to server in background
      void (async () => {
        if (!(await serverHealth.isHealthy())) return;
        try {
          for (const p of merged) {
            await ApiClient.post(`/api/presets`, p);
          }
        } catch {
          serverHealth.markUnhealthy();
        }
      })();
      return added;
    } catch (error) {
      console.error('Failed to import filter presets:', error);
      throw new Error('Invalid presets data format');
    }
  }

  static clearAllPresets(): void {
    CACHE = [];
  }

  static async hydrateFromServer(): Promise<FilterPreset[]> {
    if (!(await serverHealth.isHealthy())) return CACHE;
    try {
      const all = await ApiClient.get<FilterPreset[]>(`/api/presets`);
      CACHE = all.map((preset: any) => this.normalizePreset(preset)).filter((p) => !!p.name);
    } catch {
      serverHealth.markUnhealthy();
    }
    return CACHE;
  }

  static async replaceAll(presets: FilterPreset[]): Promise<void> {
    const normalized = presets
      .map((preset) => this.normalizePreset(preset))
      .filter((preset) => !!preset.name);

    const existing = await this.hydrateFromServer();
    const existingNames = new Set((existing || []).map((p) => p.name));
    const incomingNames = new Set(normalized.map((p) => p.name));

    CACHE = normalized;

    if (!(await serverHealth.isHealthy())) return;

    try {
      for (const name of existingNames) {
        if (!incomingNames.has(name)) {
          await ApiClient.delete(`/api/presets/${encodeURIComponent(name)}`);
        }
      }
      for (const preset of normalized) {
        await ApiClient.post(`/api/presets`, preset);
      }
    } catch {
      serverHealth.markUnhealthy();
    }
  }
}
