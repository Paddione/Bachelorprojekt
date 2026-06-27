import { useEffect, useRef } from 'react';
import { BlockRenderer } from '@/blocks/BlockRenderer';
import type { HomepageBlocksDocumentType } from '@/blocks/schema';

// One changed block, rendered before (baseline) and after (working copy).
export interface ChangedBlockPreview {
  label: string;
  before: HomepageBlocksDocumentType;
  after: HomepageBlocksDocumentType;
}

interface Props {
  changedBlocks: ChangedBlockPreview[];
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmation step shown when the admin clicks "Speichern": it renders ONLY
// the changed blocks as before/after, and only "Bestätigen" actually persists.
export function SaveConfirmDialog({ changedBlocks, saving, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/70 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Änderungen bestätigen"
        className="my-10 w-full max-w-[920px] rounded-xl border border-line-2 bg-ink-900 p-6 shadow-lg"
      >
        <h2 className="mb-1 font-serif text-[22px] font-light text-fg">Änderungen bestätigen</h2>
        <p className="mb-5 text-[14px] text-fg-soft">
          Nur die geänderten Blöcke werden gezeigt. „Bestätigen“ speichert die Homepage.
        </p>

        <div className="space-y-6">
          {changedBlocks.map((cb, i) => (
            <section key={i} className="rounded-lg border border-line/60 p-4">
              <h3 className="mb-3 text-[15px] font-semibold text-fg">{cb.label}</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-[12px] uppercase tracking-wide text-mute">Vorher</div>
                  <div className="overflow-hidden rounded border border-line/60">
                    <BlockRenderer document={cb.before} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[12px] uppercase tracking-wide text-mute">Nachher</div>
                  <div className="overflow-hidden rounded border border-line/60">
                    <BlockRenderer document={cb.after} />
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line-2 px-5 py-2.5 text-[14px] font-medium text-fg"
          >
            Abbrechen
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="rounded-full px-5 py-2.5 text-[14px] font-medium text-ink-900 disabled:opacity-60"
            style={{ background: 'var(--brass)' }}
          >
            {saving ? 'Speichert…' : 'Bestätigen'}
          </button>
        </div>
      </div>
    </div>
  );
}
