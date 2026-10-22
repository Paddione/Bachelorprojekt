// sources/epics.ts — Epic-Liste (K5, T002464)
//
// Diese Datei traegt die Daten-Beschaffung fuer den Epic-Canvas. Sie ist bewusst
// von routes/epics.ts getrennt: die Route braucht `hono`, das in keiner
// package.json des Repos deklariert ist (der Daemon wird ad hoc per `npx tsx`
// gestartet). Ein Test, der die Route importiert, waere in CI nicht lauffaehig —
// die reinen Funktionen hier sind es. Muster uebernommen von sources/kubectl.ts.
//
// Historie: die erste Fassung rief `bash scripts/vda/ticket.sh list …` ueber
// eine Shell auf. T002505 stellte auf `bin` + argv-ARRAY um. #6688 (Ticket-
// Retirement) entfernte ticket.sh endgueltig; seit #6796 kommen die Epics aus
// GitHub Issues mit dem Label `epic` (die Retirees wurden dorthin portiert).
// Quelle ist `gh issue list` — maschinell geparst, immer `gh` direkt.
import { exec } from '../lib/exec';

export interface EpicSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  childCount: number;
}

export interface EpicsQuery {
  brand: string;
  type: string;
  status?: string;
  limit?: number;
}

/** Epics sind GitHub Issues mit dem Label `epic` (Ticket-Retirement #6688). */
export const EPIC_LABEL = 'epic';

/** Limit-Obergrenze fuer `gh issue list --limit` (D13: keine stillen Kuertel). */
const MAX_LIMIT = 500;

/**
 * Baut die argv fuer `gh issue list`. Jeder Wert ist ein EIGENES
 * argv-Element — nie Teil eines zusammengesetzten Strings.
 *
 * Abbildung Query → gh: `type` ist ein Ticket-DB-Relikt und wird nur noch
 * validiert (Defense in Depth, kein Filter); `status: 'closed'` waehlt
 * `--state closed`, alles andere listet offene Issues; `limit` wird
 * 1..MAX_LIMIT geprueft und als `--limit` gereicht.
 */

/**
 * Defense in Depth neben dem argv-Aufbau (T002505). exec() startet keine Shell,
 * die eigentliche Absicherung ist also strukturell — hier wird zusaetzlich
 * abgewiesen, was ohnehin kein gueltiger Brand-/Typ-/Status-Wert waere.
 */
function assertPlainToken(value: string, label: string): void {
  if (typeof value !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(value)) {
    throw new Error(`invalid ${label}: ${JSON.stringify(value)}`);
  }
}

/**
 * Baut die argv fuer `gh issue list`. Jeder Wert ist ein EIGENES
 * argv-Element — nie Teil eines zusammengesetzten Strings.
 *
 * args[0]/args[1] sind `issue list`; exec() setzt cwd auf den Repo-Root,
 * damit `gh` das richtige Repository findet.
 */
export function buildEpicsArgs(q: EpicsQuery): string[] {
  assertPlainToken(q.brand, 'brand');
  assertPlainToken(q.type, 'type');
  if (q.status !== undefined) assertPlainToken(q.status, 'status');

  const limit = q.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`invalid limit: ${JSON.stringify(q.limit)}`);
  }

  return [
    'issue',
    'list',
    '--label', EPIC_LABEL,
    '--state', q.status === 'closed' ? 'closed' : 'open',
    '--limit', String(limit),
    '--json', 'number,title,state,labels,createdAt,updatedAt',
  ];
}

/**
 * Parst die `gh issue list --json`-Ausgabe. Wirft bei allem, was kein JSON-Array ist.
 *
 * D13 (tests/py/spec/native_ported/spec/sdlc-cockpit/test_no_silent_fallback.py): ein Datenbankausfall
 * darf nicht aussehen wie "es gibt keine Epics". Die Vorgaengerfassung hatte
 * `catch { return [] }` und machte genau diese beiden Faelle ununterscheidbar.
 * Eine echte leere Trefferliste bleibt dagegen ein gueltiges Ergebnis.
 */
export function parseEpics(stdout: string): EpicSummary[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error(`gh issue list: Antwort ist kein JSON (${stdout.slice(0, 120)})`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`gh issue list: Antwort ist kein Array (${stdout.slice(0, 120)})`);
  }
  return raw.map((t: any) => ({
    id: t.external_id || (t.number !== undefined ? String(t.number) : '') || t.id || '',
    title: t.title || '',
    status: typeof t.state === 'string' ? t.state.toLowerCase() : (t.status || 'unknown'),
    priority: t.priority || 'mittel',
    childCount: 0,
  }));
}

/** Holt die Epic-Liste. Wirft bei Fehlschlag — der Handler macht daraus ein `error`-Feld. */
export async function getEpics(_brand: string): Promise<EpicSummary[]> {
  const args = buildEpicsArgs({ brand: _brand, type: 'project' });
  const result = await exec('gh', args, 15000);
  if (!result.ok) {
    throw new Error(`gh issue list: ${result.error || result.stderr || 'command failed'}`);
  }
  return parseEpics(result.stdout);
}

/**
 * Akzeptiert die Zeitstempel, die canvas-store.js erzeugt
 * (`new Date().toISOString()`) sowie die Postgres-Form mit Mikrosekunden und
 * Offset. Alles andere — Freitext wie 'yesterday', Shell-Metazeichen, Optionen
 * mit fuehrendem Doppelstrich — wird abgewiesen.
 */
export function isValidIsoTimestamp(ts: string): boolean {
  if (typeof ts !== 'string' || ts.length === 0 || ts.length > 40) return false;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.test(ts)) {
    return false;
  }
  return !Number.isNaN(Date.parse(ts));
}

/**
 * Baut die argv fuer `git log`. Ohne Shell gibt es keine Pipe — das frueher
 * angehaengte `| wc -l` waeren drei zusaetzliche Argumente an git gewesen.
 * Gezaehlt wird deshalb in JS, siehe countChangedCommits().
 */
export function buildChangesSinceArgs(ts: string): string[] {
  if (!isValidIsoTimestamp(ts)) {
    throw new Error(`invalid timestamp: ${JSON.stringify(ts)}`);
  }
  return ['log', '--oneline', `--since=${ts}`, '--', '.agents/plans/'];
}

/** Zaehlt git-log-Zeilen. Leere Ausgabe ist 0, nicht 1 (wie `echo "" | wc -l`). */
export function countChangedCommits(stdout: string): number {
  return stdout.split('\n').filter((line) => line.trim().length > 0).length;
}

/**
 * OF1: hat jemand anders `.agents/plans/` seit dem letzten Canvas-Export
 * angefasst? Wirft bei Fehlschlag — der Handler entscheidet, ob er daraus
 * "sicherheitshalber ja" macht.
 */
export async function hasChangesSince(ts: string): Promise<boolean> {
  const result = await exec('git', buildChangesSinceArgs(ts), 5000);
  if (!result.ok) {
    throw new Error(`git log: ${result.error || result.stderr || 'command failed'}`);
  }
  return countChangedCommits(result.stdout) > 0;
}

