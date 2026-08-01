// sources/epics.ts — Epic-Liste und Fremdaenderungs-Erkennung (K5, T002464)
//
// Diese Datei traegt die Daten-Beschaffung fuer den Epic-Canvas. Sie ist bewusst
// von routes/epics.ts getrennt: die Route braucht `hono`, das in keiner
// package.json des Repos deklariert ist (der Daemon wird ad hoc per `npx tsx`
// gestartet). Ein Test, der die Route importiert, waere in CI nicht lauffaehig —
// die reinen Funktionen hier sind es. Muster uebernommen von sources/kubectl.ts.
//
// Die erste Fassung dieser Logik stand in routes/epics.ts und rief
//     exec('bash scripts/vda/ticket.sh list --type project,feat --json …', 10000)
// auf. Das war auf vier Wegen gleichzeitig falsch:
//   1. exec() nimmt seit T002505 `bin` + argv-ARRAY, keine Shell-Zeile mehr.
//      Der ganze String landete als Programmname, die 10000 als argv.
//   2. `--json` gibt es in scripts/vda/ticket/list.sh nicht — list.sh gibt
//      ohnehin json_agg aus. Das Flag bricht mit Exit 2 ab.
//   3. `--brand` ist dort Pflicht und fehlte.
//   4. `--type` baut `AND type = :'type'`, eine Gleichheit. 'project,feat'
//      matcht nichts und liefert stumm eine leere Liste.
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

/** Epics sind in tickets.tickets als type='project' gefuehrt (nicht 'epic'). */
export const EPIC_TYPE = 'project';

const TICKET_SCRIPT = 'scripts/ticket.sh';

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
 * Baut die argv fuer `bash scripts/ticket.sh list`. Jeder Wert ist ein EIGENES
 * argv-Element — nie Teil eines zusammengesetzten Strings.
 *
 * args[0] ist der Skriptpfad relativ zum Repo-Root; exec() setzt cwd dorthin.
 */
export function buildEpicsArgs(q: EpicsQuery): string[] {
  assertPlainToken(q.brand, 'brand');
  assertPlainToken(q.type, 'type');
  if (q.status !== undefined) assertPlainToken(q.status, 'status');

  const limit = q.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error(`invalid limit: ${JSON.stringify(q.limit)}`);
  }

  return [
    TICKET_SCRIPT,
    'list',
    '--brand', q.brand,
    '--type', q.type,
    ...(q.status ? ['--status', q.status] : []),
    '--limit', String(limit),
  ];
}

/**
 * Parst die list.sh-Ausgabe. Wirft bei allem, was kein JSON-Array ist.
 *
 * D13 (tests/spec/sdlc-cockpit/no-silent-fallback.bats): ein Datenbankausfall
 * darf nicht aussehen wie "es gibt keine Epics". Die Vorgaengerfassung hatte
 * `catch { return [] }` und machte genau diese beiden Faelle ununterscheidbar.
 * Eine echte leere Trefferliste bleibt dagegen ein gueltiges Ergebnis.
 */
export function parseEpics(stdout: string): EpicSummary[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error(`ticket.sh list: Antwort ist kein JSON (${stdout.slice(0, 120)})`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`ticket.sh list: Antwort ist kein Array (${stdout.slice(0, 120)})`);
  }
  return raw.map((t: any) => ({
    id: t.external_id || t.id || '',
    title: t.title || '',
    status: t.status || 'unknown',
    priority: t.priority || 'mittel',
    childCount: 0,
  }));
}

/** Holt die Epic-Liste. Wirft bei Fehlschlag — der Handler macht daraus ein `error`-Feld. */
export async function getEpics(brand: string): Promise<EpicSummary[]> {
  const args = buildEpicsArgs({ brand, type: EPIC_TYPE });
  const result = await exec('bash', args, 15000);
  if (!result.ok) {
    throw new Error(`ticket.sh list: ${result.error || result.stderr || 'command failed'}`);
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
  return ['log', '--oneline', `--since=${ts}`, '--', 'openspec/changes/'];
}

/** Zaehlt git-log-Zeilen. Leere Ausgabe ist 0, nicht 1 (wie `echo "" | wc -l`). */
export function countChangedCommits(stdout: string): number {
  return stdout.split('\n').filter((line) => line.trim().length > 0).length;
}

/**
 * OF1: hat jemand anders `openspec/changes/` seit dem letzten Canvas-Export
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
