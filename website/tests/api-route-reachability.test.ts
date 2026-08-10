// [T003459] Guard gegen tote fetch-Pfade auf SDLC-API-Routen.
//
// Prüfmodus: Ergebnis einer Auflösung — jeder aus dem Quellbaum gefetchte
// /api/…-Pfad wird gegen die tatsächlich vorhandenen Astro-Routendateien
// aufgelöst. Der Test prüft also, ob der Aufruf ein Ziel HAT, nicht wie er
// geschrieben ist.
//
// Hintergrund: ADR-006 Etappe 1 (T002624) verschob die SDLC-Seiten von
// /admin/ nach /sdlc/. Die API-Routen zogen mit, `src/middleware/redirect-map.ts`
// deckt aber ausschließlich Seitenpfade ab — für /api/ gibt es dort weder
// Einträge noch eine Präfix-Regel. Verschärfend filtert der sdlc-Build die
// Routen (src/integrations/build-target.mjs behält nur /sdlc/** plus eine
// Infra-Allowlist), sodass die /api/-Ziele im SDLC-Console-Image gar nicht
// existieren. Jeder nicht nachgezogene Aufruf lief seither still in einen 404.
// Bei getSharedMetrics blieb das unbemerkt und wurde am Ende als "never worked"
// zur Begründung, funktionierende Komponenten zu löschen (T003417).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const PAGES = join(SRC, 'pages');

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Alle Routen, die Astro aus src/pages/ ableitet, als URL-Pfade. */
function routePaths(): Set<string> {
  const routes = new Set<string>();
  for (const file of walk(PAGES)) {
    if (!/\.(ts|js|astro)$/.test(file)) continue;
    let rel = relative(PAGES, file).replace(/\\/g, '/');
    rel = rel.replace(/\.(ts|js|astro)$/, '');
    rel = rel.replace(/\/index$/, '');
    routes.add('/' + rel);
  }
  return routes;
}

/**
 * Statisch analysierbare fetch('/api/…')-Ziele aus dem Quellbaum.
 *
 * `partial: true` heisst, dass der Pfad zur Laufzeit weitergebaut wird — per
 * Template-Platzhalter (`${id}`) oder String-Konkatenation (`'/api/poll/' + id`).
 * Solche Pfade dürfen NUR als Präfix geprüft werden. Wer sie wie vollständige
 * Pfade behandelt, meldet `/api/poll` als tot, obwohl `/api/poll/[id]/answer`
 * existiert — und ein Guard, der Fehlalarme produziert, wird abgeschaltet.
 */
function fetchedApiPaths(): Array<{ file: string; path: string; partial: boolean }> {
  const found: Array<{ file: string; path: string; partial: boolean }> = [];
  const re = /fetch\(\s*([`'"])(\/api\/[^`'"?\s$]*)([^)]{0,12})/g;
  for (const file of walk(SRC)) {
    if (!/\.(ts|svelte|astro)$/.test(file)) continue;
    if (/\.(test|spec)\.ts$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      const [, quote, literal, tail] = m;
      const path = literal.replace(/\/$/, '');
      const partial =
        tail.startsWith('${') ||
        literal.endsWith('/') ||
        new RegExp(`^${quote === '`' ? '`' : quote}\\s*\\+`).test(tail);
      found.push({ file: relative(ROOT, file), path, partial });
    }
  }
  return found;
}

/**
 * Trifft der Pfad eine Route — auch über eine dynamische Route wie [id]?
 * Bei `partial` genügt es, dass IRGENDEINE Route mit diesem Präfix beginnt:
 * der Rest des Pfades entsteht erst zur Laufzeit.
 */
function resolves(path: string, routes: Set<string>, partial = false): boolean {
  if (routes.has(path)) return true;
  const parts = path.split('/').filter(Boolean);
  for (const route of routes) {
    const rp = route.split('/').filter(Boolean);
    const rest = rp.findIndex((s) => s.startsWith('[...'));
    if (partial) {
      if (rp.length < parts.length) continue;
    } else if (rest >= 0 ? parts.length < rest : rp.length !== parts.length) {
      continue;
    }
    const ok = parts.every((seg, i) => {
      const r = rp[i];
      if (r === undefined) return false;
      if (r.startsWith('[...')) return true;
      if (r.startsWith('[') && r.endsWith(']')) return true;
      return r === seg;
    }) && (partial || rp.every((seg, i) => {
      if (seg.startsWith('[...')) return true;
      if (seg.startsWith('[') && seg.endsWith(']')) return parts[i] !== undefined;
      return seg === parts[i];
    }));
    if (ok) return true;
  }
  return false;
}

function sdlcCounterpart(path: string): string {
  return path.replace(/^\/api\/(admin\/)?/, '/sdlc/api/');
}

// Die Sanierung läuft in Etappen zu je sechs Dateien (ein Ticket pro Etappe).
// Bis alle durch sind, hält diese Liste die noch nicht sanierten Dateien fest.
// Sie darf ausschliesslich SCHRUMPFEN — jede Etappe streicht ihre sechs
// Einträge. Steht hier eine Datei, die längst sauber ist, schlägt der Test an:
// eine Ausnahmeliste, die niemand aufräumt, verdeckt sonst neue Fehler.
const PENDING_FILES: string[] = [
  // Etappe 5 — Ops-Tabs und Logging [T003481]
  'src/components/admin/ops/DatenbankTab.svelte',
  'src/components/admin/ops/DienstTab.svelte',
  'src/components/admin/ops/DnsZertTab.svelte',
  'src/components/admin/ops/LogsTab.svelte',
  'src/components/assistant/LogsSidekickView.svelte',
  'src/lib/logging/error-report.ts',
  // Etappe 6 — Platform-Tabs und Architektur [T003482]
  'src/components/admin/platform/AssetTicketDrawer.svelte',
  'src/components/admin/platform/BackupStatusCard.svelte',
  'src/components/admin/platform/HardwareTab.svelte',
  'src/components/admin/platform/HealthTab.svelte',
  'src/components/admin/platform/SoftwareTab.svelte',
  'src/components/admin/ArchitekturGraph.svelte',
  // Etappe 7 — Factory-Budget und Systemtest [T003483]
  'src/components/sdlc/factory/FactoryBudgetPage.svelte',
  'src/components/sdlc/factory/FactoryModelSlots.svelte',
  'src/components/SystemtestReplayDrawer.svelte',
  'src/lib/systemtest/recorder.ts',
  'src/pages/sdlc/systemtest/board.astro',
  'src/layouts/AdminLayout.astro',
  // Etappe 8 — Assistant-Views [T003484]
  'src/components/assistant/LlmProxyView.svelte',
  'src/components/assistant/SupportView.svelte',
];

describe('API-Routen sind erreichbar', () => {
  const routes = routePaths();
  const fetched = fetchedApiPaths();

  it('findet überhaupt Routen und fetch-Aufrufe', () => {
    // Positiv-Anker: ohne ihn bestünde der Guard unten vakuos, sobald die
    // Erkennung kaputtgeht — eine leere Liste verletzt jede Allaussage nicht.
    expect(routes.size).toBeGreaterThan(50);
    expect(fetched.length).toBeGreaterThan(20);
  });

  it('löst bekannte Routen korrekt auf — statisch, dynamisch und als Präfix', () => {
    // Positiv-Anker für den Auflöser selbst. Ohne diese Fälle könnte ein
    // kaputter Auflöser, der immer `true` liefert, die Allaussage unten
    // klaglos bestehen lassen.
    expect(resolves('/api/health', routes)).toBe(true);
    expect(resolves('/api/poll/abc/answer', routes)).toBe(true);
    expect(resolves('/api/poll', routes, true)).toBe(true);
    expect(resolves('/api/gibt-es-nicht-xyz', routes)).toBe(false);
  });

  it('jeder gefetchte /api/-Pfad trifft eine existierende Route', () => {
    const dead = fetched.filter((f) => !resolves(f.path, routes, f.partial));
    const report = dead
      .filter((d) => !PENDING_FILES.includes(d.file))
      .map((d) => {
        const sdlc = sdlcCounterpart(d.path);
        return `${d.file}: ${d.path}${resolves(sdlc, routes, d.partial) ? `  → existiert als ${sdlc}` : ''}`;
      });
    expect(report).toEqual([]);
  });

  it('die Übergangsliste enthält nur Dateien, die wirklich noch defekt sind', () => {
    // Verhindert, dass PENDING_FILES zur toten Ausnahmeliste verkommt.
    const stillDead = new Set(
      fetched.filter((f) => !resolves(f.path, routes, f.partial)).map((f) => f.file),
    );
    expect(PENDING_FILES.filter((f) => !stillDead.has(f))).toEqual([]);
  });
});
