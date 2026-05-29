export type SaveState = 'pristine' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';
type Errors = { field: string; message: string }[];
export interface Conflict { currentVersion: number; currentValue: any }

interface Opts {
  contentKey: string;
  initialValue: any;
  initialVersion: number;
  validate: (value: any) => Errors;
  saveFn: (contentKey: string, baseVersion: number, value: any) => Promise<{ version: number }>;
  debounceMs?: number;
  onPreviewRefresh?: () => void;
}

interface Snapshot { value: any; version: number; state: SaveState; errors: Errors; conflict?: Conflict }

export function createBehaviorStore(opts: Opts) {
  const debounceMs = opts.debounceMs ?? 2000;
  let snap: Snapshot = { value: opts.initialValue, version: opts.initialVersion, state: 'pristine', errors: [] };
  const subs = new Set<(s: Snapshot) => void>();
  let timer: any = null;

  const emit = () => subs.forEach((f) => f(snap));
  const set = (p: Partial<Snapshot>) => { snap = { ...snap, ...p }; emit(); };

  async function flush() {
    const errors = opts.validate(snap.value);
    if (errors.length) { set({ state: 'error', errors }); return; }
    if (snap.state === 'conflict') return;
    set({ state: 'saving', errors: [] });
    try {
      const { version } = await opts.saveFn(opts.contentKey, snap.version, snap.value);
      set({ state: 'saved', version });
      opts.onPreviewRefresh?.();
    } catch (e: any) {
      if (e?.status === 409) set({ state: 'conflict', conflict: e.body });
      else set({ state: 'error', errors: [{ field: '', message: 'Speichern fehlgeschlagen' }] });
    }
  }

  function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(flush, debounceMs); }

  return {
    get: () => snap,
    subscribe(f: (s: Snapshot) => void) { subs.add(f); f(snap); return () => subs.delete(f); },
    setValue(value: any) { if (snap.state === 'conflict') return; set({ value, state: 'dirty' }); schedule(); },
    saveNow() { if (timer) clearTimeout(timer); return flush(); },
    resolveConflictTakeTheirs() { const c = snap.conflict!; set({ value: c.currentValue, version: c.currentVersion, state: 'dirty', conflict: undefined }); },
    resolveConflictTakeMine() { const c = snap.conflict!; set({ version: c.currentVersion, state: 'dirty', conflict: undefined }); return flush(); },
  };
}
