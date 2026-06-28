export type SaveState = 'pristine' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';
type Errors = { field: string; message: string }[];
export interface Conflict<T = unknown> { currentVersion: number; currentValue: T }

interface Opts<T = unknown> {
  contentKey: string;
  initialValue: T;
  initialVersion: number;
  validate: (value: T) => Errors;
  saveFn: (contentKey: string, baseVersion: number, value: T) => Promise<{ version: number }>;
  debounceMs?: number;
  onPreviewRefresh?: () => void;
}

interface Snapshot<T = unknown> { value: T; version: number; state: SaveState; errors: Errors; conflict?: Conflict<T> }

export function createBehaviorStore<T = unknown>(opts: Opts<T>) {
  const debounceMs = opts.debounceMs ?? 2000;
  let snap: Snapshot<T> = { value: opts.initialValue, version: opts.initialVersion, state: 'pristine', errors: [] };
  const subs = new Set<(s: Snapshot<T>) => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => subs.forEach((f) => f(snap));
  const set = (p: Partial<Snapshot<T>>) => { snap = { ...snap, ...p }; emit(); };

  async function flush() {
    const errors = opts.validate(snap.value);
    if (errors.length) { set({ state: 'error', errors }); return; }
    if (snap.state === 'conflict') return;
    set({ state: 'saving', errors: [] });
    try {
      const { version } = await opts.saveFn(opts.contentKey, snap.version, snap.value);
      set({ state: 'saved', version });
      opts.onPreviewRefresh?.();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: Conflict<T> };
      if (err?.status === 409) set({ state: 'conflict', conflict: err.body });
      else set({ state: 'error', errors: [{ field: '', message: 'Speichern fehlgeschlagen' }] });
    }
  }

  function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(flush, debounceMs); }

  return {
    get: () => snap,
    subscribe(f: (s: Snapshot<T>) => void) { subs.add(f); f(snap); return () => subs.delete(f); },
    setValue(value: T) { if (snap.state === 'conflict') return; set({ value, state: 'dirty' }); schedule(); },
    saveNow() { if (timer) clearTimeout(timer); return flush(); },
    resolveConflictTakeTheirs() { const c = snap.conflict!; set({ value: c.currentValue, version: c.currentVersion, state: 'dirty', conflict: undefined }); },
    resolveConflictTakeMine() { const c = snap.conflict!; set({ version: c.currentVersion, state: 'dirty', conflict: undefined }); return flush(); },
  };
}
