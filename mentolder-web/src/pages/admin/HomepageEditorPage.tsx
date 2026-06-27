import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { getHomepage, saveHomepage, loginUrl } from '../../lib/homepageApi';
import { BlockRenderer } from '@/blocks/BlockRenderer';
import { homepageSeed } from '@/blocks/seed';
import type { HomepageBlocksDocumentType } from '@/blocks/schema';
import { fieldsForBlock, getAtPath, setAtPath, BLOCK_LABELS, type FieldDef } from './blockFields';

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
  const [baseVersion, setBaseVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  // Load the current document once the admin gate is satisfied.
  useEffect(() => {
    if (loading || !authenticated || !isAdmin) return;
    let active = true;
    getHomepage<HomepageBlocksDocumentType>().then(({ document, version }) => {
      if (!active) return;
      setDoc(document ?? homepageSeed);
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

  if (loading) return <PageShell>Lädt…</PageShell>;
  if (authenticated && !isAdmin) return <Navigate to="/" replace />;
  if (!authenticated) return <PageShell>Weiterleitung zum Login…</PageShell>;
  if (!loaded || !doc) return <PageShell>Lädt Inhalt…</PageShell>;

  const updateBlockProps = (index: number, props: any) => {
    setDoc((d) => (d ? { ...d, blocks: d.blocks.map((b, i) => (i === index ? { ...b, props } : b)) } : d));
    setStatus({ kind: 'idle' });
  };

  const handleSave = async () => {
    if (!doc) return;
    setStatus({ kind: 'saving' });
    const r = await saveHomepage(baseVersion, doc);
    if (r.ok) {
      setBaseVersion(r.version ?? baseVersion);
      setStatus({ kind: 'saved', version: r.version });
    } else if (r.status === 409) {
      setStatus({ kind: 'conflict', currentVersion: r.currentVersion });
    } else if (r.status === 422) {
      setStatus({ kind: 'invalid', errors: r.errors });
    } else {
      setStatus({ kind: 'error' });
    }
  };

  return (
    <section className="pt-[80px] pb-[120px] max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h1 className="font-serif font-light text-fg m-0" style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}>
          Edit Homepage
        </h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={status.kind === 'saving'}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-ink-900 font-medium disabled:opacity-60"
          style={{ background: 'var(--brass)' }}
        >
          {status.kind === 'saving' ? 'Speichert…' : 'Speichern'}
        </button>
      </div>

      <StatusBanner status={status} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          {doc.blocks.map((block, index) => {
            const fields = fieldsForBlock(block.type);
            return (
              <section key={block.id} className="mb-6 rounded-lg border border-line/60 p-4">
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
            );
          })}
        </div>

        <div className="lg:sticky lg:top-[90px] self-start">
          <div className="text-[12px] uppercase tracking-wide text-mute mb-2">Live-Vorschau</div>
          <div className="rounded-lg border border-line/60 overflow-hidden" aria-label="Live-Vorschau">
            <BlockRenderer document={doc} />
          </div>
        </div>
      </div>
    </section>
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
