import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { getHomepage, saveHomepage, loginUrl } from '../../lib/homepageApi';
import { BlockRenderer } from '@/blocks/BlockRenderer';
import { homepageSeed } from '@/blocks/seed';
import type { HomepageBlocksDocumentType } from '@/blocks/schema';
import { fieldsForBlock, getAtPath, setAtPath, BLOCK_LABELS, type FieldDef } from './blockFields';
import { changedBlockIds } from './homepageDiff';
import { SaveConfirmDialog, type ChangedBlockPreview } from './SaveConfirmDialog';

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; version?: number }
  | { kind: 'conflict'; currentVersion?: number }
  | { kind: 'invalid'; errors?: Array<{ path: string; message: string }> }
  | { kind: 'error' };

const inputCls =
  'w-full rounded border border-line-2 bg-ink-900/40 px-3 py-2 text-[14px] text-fg outline-none focus:border-brass';
const labelCls = 'block mb-3';
const labelTextCls = 'block mb-1 text-[12px] font-medium text-fg-soft';

function FieldInput({ def, value, onChange }: { def: FieldDef; value: any; onChange: (v: any) => void }) {
  if (def.kind === 'text') {
    return (
      <label className={labelCls}>
        <span className={labelTextCls}>{def.label}</span>
        <input className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (def.kind === 'textarea') {
    return (
      <label className={labelCls}>
        <span className={labelTextCls}>{def.label}</span>
        <textarea className={inputCls} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (def.kind === 'number') {
    return (
      <label className={labelCls}>
        <span className={labelTextCls}>{def.label}</span>
        <input
          className={inputCls}
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </label>
    );
  }
  if (def.kind === 'stringList') {
    const arr: string[] = Array.isArray(value) ? value : [];
    return (
      <fieldset className="mb-3 border border-line/50 rounded p-3">
        <legend className="text-[12px] font-medium text-fg-soft px-1">{def.label}</legend>
        {arr.map((s, i) => (
          <input
            key={i}
            aria-label={`${def.label} ${i + 1}`}
            className={`${inputCls} mb-2`}
            value={s}
            onChange={(e) => {
              const next = [...arr];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
        ))}
      </fieldset>
    );
  }
  // objectList
  const arr: any[] = Array.isArray(value) ? value : [];
  return (
    <fieldset className="mb-3 border border-line/50 rounded p-3">
      <legend className="text-[12px] font-medium text-fg-soft px-1">{def.label}</legend>
      {arr.map((item, i) => (
        <div key={i} className="mb-3 pb-3 border-b border-line/30 last:border-0">
          <div className="text-[11px] text-mute mb-2">#{i + 1}</div>
          {(def.itemFields ?? []).map((f) => (
            <FieldInput
              key={f.key}
              def={f}
              value={getAtPath(item, f.key)}
              onChange={(v) => {
                const next = [...arr];
                next[i] = setAtPath(item, f.key, v);
                onChange(next);
              }}
            />
          ))}
        </div>
      ))}
    </fieldset>
  );
}

export function HomepageEditorPage() {
  const { authenticated, isAdmin, loading } = useAuth();
  const [doc, setDoc] = useState<HomepageBlocksDocumentType | null>(null);
  // Baseline = the last persisted document; drives the change detection that
  // gates the save button and the before/after confirmation preview.
  const [originalDoc, setOriginalDoc] = useState<HomepageBlocksDocumentType | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  // Live preview is collapsed by default; admins opt in via the header toggle.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  // Load the current document once the admin gate is satisfied.
  useEffect(() => {
    if (loading || !authenticated || !isAdmin) return;
    let active = true;
    getHomepage<HomepageBlocksDocumentType>().then(({ document, version }) => {
      if (!active) return;
      const loadedDoc = document ?? homepageSeed;
      setDoc(loadedDoc);
      setOriginalDoc(loadedDoc);
      setBaseVersion(version);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [loading, authenticated, isAdmin]);

  // Unauthenticated direct access → bounce to the website login (returnTo here).
  useEffect(() => {
    if (!loading && !authenticated && typeof window !== 'undefined') {
      window.location.href = loginUrl(window.location.href);
    }
  }, [loading, authenticated]);

  // Escape key closes fullscreen preview — must be here (before early returns) to
  // satisfy Rules of Hooks (hooks cannot appear after conditional returns).
  useEffect(() => {
    if (!previewFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewFullscreen]);

  if (loading) return <PageShell>Lädt…</PageShell>;
  if (authenticated && !isAdmin) { window.location.href = '/'; return null; }
  if (!authenticated) return <PageShell>Weiterleitung zum Login…</PageShell>;
  if (!loaded || !doc) return <PageShell>Lädt Inhalt…</PageShell>;

  const updateBlockProps = (index: number, props: any) => {
    setDoc((d) => (d ? { ...d, blocks: d.blocks.map((b, i) => (i === index ? { ...b, props } : b)) } : d));
    setStatus({ kind: 'idle' });
  };

  const saving = status.kind === 'saving';
  const changedIds = changedBlockIds(originalDoc, doc);
  const hasChanges = changedIds.length > 0;

  // Before/after pairs for the confirmation dialog — only the changed blocks,
  // each wrapped as a single-block document so BlockRenderer renders just it.
  const changedBlocks: ChangedBlockPreview[] =
    originalDoc && doc
      ? changedIds.map((id) => {
          const before = originalDoc.blocks.find((b) => b.id === id)!;
          const after = doc.blocks.find((b) => b.id === id)!;
          return {
            label: BLOCK_LABELS[after.type] ?? after.type,
            before: { schemaVersion: doc.schemaVersion, blocks: [before] },
            after: { schemaVersion: doc.schemaVersion, blocks: [after] },
          };
        })
      : [];

  // Persist only after the admin confirms the previewed changes.
  const handleConfirm = async () => {
    if (!doc) return;
    setStatus({ kind: 'saving' });
    const r = await saveHomepage(baseVersion, doc);
    if (r.ok) {
      setBaseVersion(r.version ?? baseVersion);
      setOriginalDoc(doc); // baseline advances → no pending changes
      setStatus({ kind: 'saved', version: r.version });
    } else if (r.status === 409) {
      setStatus({ kind: 'conflict', currentVersion: r.currentVersion });
    } else if (r.status === 422) {
      setStatus({ kind: 'invalid', errors: r.errors });
    } else {
      setStatus({ kind: 'error' });
    }
    setConfirmOpen(false);
  };

  return (
    <>
      {previewFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-[var(--ink-950,#0a0a0f)] overflow-auto"
          role="dialog"
          aria-label="Vollbild-Vorschau"
        >
          <button
            type="button"
            onClick={() => setPreviewFullscreen(false)}
            className="fixed top-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-ink-900/80 border border-line/60 px-3 py-1.5 text-[13px] text-fg-soft hover:text-fg backdrop-blur-sm"
            aria-label="Vollbild schließen"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Schließen
          </button>
          <BlockRenderer document={doc} />
        </div>
      )}

      <section className="pt-[80px] pb-[120px] max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <h1 className="font-serif font-light text-fg m-0" style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}>
            Edit Homepage
          </h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPreviewFullscreen(true)}
              className="flex items-center gap-1.5 rounded-full border border-line-2 px-4 py-2.5 text-[14px] font-medium text-fg"
              aria-label="Vollbild-Vorschau öffnen"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Vollbild
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              aria-expanded={previewOpen}
              className="rounded-full border border-line-2 px-4 py-2.5 text-[14px] font-medium text-fg"
            >
              {previewOpen ? 'Vorschau ausblenden' : 'Vorschau einblenden'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-ink-900 font-medium disabled:opacity-60"
              style={{ background: 'var(--brass)' }}
            >
              Speichern
            </button>
          </div>
        </div>

        <StatusBanner status={status} />

        <div>
          {doc.blocks.map((block, index) => {
            const fields = fieldsForBlock(block.type);
            return (
              <div
                key={block.id}
                className={previewOpen ? 'grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mb-6' : 'mb-6'}
              >
                <section className="rounded-lg border border-line/60 p-4">
                  <h2 className="text-[15px] font-semibold text-fg mb-3">
                    {BLOCK_LABELS[block.type] ?? block.type}
                  </h2>
                  {fields.length === 0 && <p className="text-[13px] text-mute">Kein editierbares Feld.</p>}
                  {fields.map((f) => (
                    <FieldInput
                      key={f.key}
                      def={f}
                      value={getAtPath(block.props as any, f.key)}
                      onChange={(v) => updateBlockProps(index, setAtPath(block.props as any, f.key, v))}
                    />
                  ))}
                </section>

                {previewOpen && (
                  <div className="self-start rounded-lg border border-line/60 overflow-hidden">
                    <BlockRenderer document={{ schemaVersion: doc.schemaVersion, blocks: [block] }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {confirmOpen && (
          <SaveConfirmDialog
            changedBlocks={changedBlocks}
            saving={saving}
            onConfirm={handleConfirm}
            onCancel={() => setConfirmOpen(false)}
          />
        )}
      </section>
    </>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="pt-[120px] pb-[160px] max-w-[820px] mx-auto px-10 text-fg-soft">{children}</section>
  );
}

function StatusBanner({ status }: { status: SaveStatus }) {
  if (status.kind === 'saved') {
    return <Banner tone="ok">Gespeichert (Version {status.version}).</Banner>;
  }
  if (status.kind === 'conflict') {
    return (
      <Banner tone="warn">
        Die Homepage wurde anderswo geändert (aktuelle Version {status.currentVersion}). Bitte neu laden.
      </Banner>
    );
  }
  if (status.kind === 'invalid') {
    return (
      <Banner tone="warn">
        Ungültige Eingaben:
        <ul className="list-disc ml-5 mt-1">
          {(status.errors ?? []).map((e, i) => (
            <li key={i}>
              {e.path}: {e.message}
            </li>
          ))}
        </ul>
      </Banner>
    );
  }
  if (status.kind === 'error') {
    return <Banner tone="warn">Speichern fehlgeschlagen. Bitte erneut versuchen.</Banner>;
  }
  return null;
}

function Banner({ tone, children }: { tone: 'ok' | 'warn'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'border-green-500/40 text-green-300 bg-green-500/10'
      : 'border-amber-500/40 text-amber-300 bg-amber-500/10';
  return <div className={`mb-5 rounded border px-4 py-3 text-[14px] ${cls}`}>{children}</div>;
}
