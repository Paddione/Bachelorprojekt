# p2 — Scan-Client (TypeScript)

_Ticket: T013306 · Rolle: impl · depends_on: p1_

## Zieldateien

- `components/website/src/lib/sdlc/repo-root.ts` (NEU, ca. 25 Zeilen)
- `components/website/src/lib/sdlc/openspec/proposal.ts` (52 → ca. 42 Zeilen)
- `components/website/src/lib/sdlc/health-scan.ts` (NEU, ca. 95 Zeilen)
- `components/website/src/lib/sdlc/health-scan.test.ts` (NEU)

## Aufgaben

- [ ] `repo-root.ts` anlegen. Inhalt ist die vorhandene Funktion aus
      `components/website/src/lib/sdlc/openspec/proposal.ts:5-17`, unverändert in der Logik:

```ts
export function findRepoRoot(): string {
  if (process.env.OPENSPEC_REPO_ROOT) return process.env.OPENSPEC_REPO_ROOT;
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'openspec'))) return current;
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../../..');
}
```

- [ ] `proposal.ts` auf den Import umstellen und die lokale Kopie löschen. Das ist bewusst kein
      breiter Refactor: es verhindert lediglich, dass zwei Stellen die Repo-Wurzel unterschiedlich
      bestimmen. Bestehendes Verhalten bleibt gleich — insbesondere die
      `OPENSPEC_REPO_ROOT`-Vorrangregel.

- [ ] `health-scan.ts` schreiben. Öffentliche Oberfläche:

```ts
export interface ScanResult {
  id: string;
  measurable: boolean;
  actual?: number;
  cmp?: 'le' | 'ge' | 'eq';
  target?: number;
}
export async function runHealthScan(ids: string[]): Promise<ScanResult[]>;
```

      Umsetzung:
      - `spawn('bash', ['scripts/health-goals-scan.sh', ...ids], { cwd: findRepoRoot() })` —
        Argument-**Array**, niemals ein zusammengesetzter Kommando-String und niemals `shell: true`
        (REQ-HEALTH-GOALS-013).
      - stdout sammeln, stderr verwerfen bzw. bei Fehlern in die Meldung übernehmen.
      - Timeout wie in `pages/sdlc/api/tests/report.ts`: Timer, `proc.kill()`, definierter
        Fehlerwert. Großzügiger ansetzen als die dortigen 60 s — ein Vollscan mehrerer Ziele
        dauert länger. Vorschlag: 180 s, als benannte Konstante.
      - Exit 2 des Wrappers als Eingabefehler durchreichen (die Route macht daraus `400`),
        anderer Exit ungleich 0 als Serverfehler.
      - `JSON.parse` des stdout. Schlägt das fehl, ist das ein Fehler und **kein** leeres
        Ergebnis: eine leere Liste würde im Dashboard aussehen wie „nichts zu messen".

- [ ] Die Antwort-Vollständigkeit prüfen: enthält das geparste Array nicht für jede angeforderte ID
      einen Eintrag, die fehlenden als `{ id, measurable: false }` ergänzen. Damit kann kein
      angefordertes Ziel stillschweigend aus der Anzeige fallen (REQ-HEALTH-GOALS-012, zweites
      Szenario).

- [ ] `health-scan.test.ts` (Vitest) mit `spawn` gemockt — der Test darf keine echte Messung
      starten:
      - stdout mit zwei Einträgen, einer davon `measurable: false` → beide kommen unverändert
        zurück, der zweite hat kein `actual`.
      - stdout, in dem eine angeforderte ID fehlt → sie wird als `measurable: false` ergänzt.
      - kaputtes stdout (kein JSON) → wirft, liefert kein leeres Array.
      - Exit 2 → als Eingabefehler unterscheidbar.
      - Aufruf-Prüfung: `spawn` wurde mit `'bash'` und einem Array aufgerufen, das die IDs als
        eigene Elemente enthält (Nachweis, dass keine Shell-Interpolation stattfindet).

## Abschluss dieses Partials

```bash
cd components/website && pnpm vitest run src/lib/sdlc/health-scan.test.ts
```

Läuft der Aufruf im Worktree in die bekannte Symlink-Situation, im Haupt-Checkout unter
`components/website` wiederholen. Eine Skip-Meldung ist kein grüner Lauf.
