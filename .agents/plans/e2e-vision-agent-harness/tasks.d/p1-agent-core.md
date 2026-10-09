# P1: Agent-Core (Runner + Orakel) — T901645

Partial von `.agents/plans/e2e-vision-agent-harness/tasks.md` (p1, impl).
Ziel: `tests/e2e/agent/runner.mjs` + `tests/e2e/agent/oracle.mjs`, beide neu.
Budget: `.mjs`-Limit 800 aus `docs/code-quality/gates.yaml`, beide Dateien
nicht-baselined → je volles Budget 800, angepeilt je unter 350 Zeilen.
Deps: Stdlib-Node + `@playwright/test` (Dev-Dependency, keine Neuinstallation).
Vorbild CLI/JSONL/Reps: `scripts/llm/bench-orchestration.mjs`.

## Task 1: Orakel-Modul anlegen

Steps:
1. `tests/e2e/agent/oracle.mjs` neu anlegen, pure Functions ohne
   Browser-Import, damit `node --test` sie ohne Playwright laden kann.
2. `export function evaluateFlow(flow, state)` implementieren: `flow` ist ein
   Eintrag aus der Flow-Liste (`checks`-Array), `state` ist
   `{ url, text, apiState }`; Rückgabe `{ pass, checks: [{ name, pass,
   detail }] }`, `pass` genau dann wahr, wenn alle Checks grün sind.
3. Check-Typen `urlContains`, `urlMatches`, `textContains`, `textMatches`,
   `apiEquals` (Pfadvergleich per `node:util.isDeepStrictEqual` gegen
   `apiState`) unterstützen; unbekannte Check-Typen ergeben
   `{ pass: false, detail }` statt eines Wurfs.
4. `export function summarize(result)` für eine einzeilige stderr-Zeile
   (`flow=<id> pass=<bool> failed=<namen>`) ergänzen.

Verify:
- `node --check tests/e2e/agent/oracle.mjs`
- `node -e "import('./tests/e2e/agent/oracle.mjs').then(m => console.log(JSON.stringify(m.evaluateFlow({ id: 'probe', checks: [{ type: 'urlContains', value: '/login' }] }, { url: 'http://localhost:4321/login', text: '', apiState: {} }))))"`

## Task 2: Agent-Runner anlegen

Steps:
1. `tests/e2e/agent/runner.mjs` neu anlegen; `evaluateFlow` aus
   `./oracle.mjs` und `chromium` aus `@playwright/test` importieren.
2. CLI-Flags `--flows <pfad> --model <url> --reps <n> --out <jsonl>`
   `--obs screenshot|hybrid --max-turns <n>` nach dem `arg()`-Muster aus
   `scripts/llm/bench-orchestration.mjs` parsen; Defaults:
   `AGENT_MODEL_URL` bzw. `http://127.0.0.1:1931`,
   `AGENT_BASE_URL` bzw. `http://localhost:4321` (vgl. `baseURL` in
   `tests/e2e/playwright.config.ts`), `--obs screenshot`, `--max-turns 12`,
   `--reps 3`.
3. Loop pro Flow und Rep: `chromium.launch()`, Viewport 1280x800,
   Observation aus PNG-Screenshot (base64) plus bei `--obs hybrid`
   zusätzlich `page.accessibility.snapshot()`-Text; System-Prompt mit
   versionierter Schablone (`PROMPT_VERSION = 1`) und strikt einzeiligem
   JSON-Aktionskontrakt
   `{"action":"click|fill|goto|assert|done","target":"...","x":0-1000,"y":0-1000,"text":"..."}`.
4. VLM-Call per `fetch` an `<model>/v1/chat/completions` mit
   `max_tokens: 800`, `AbortSignal.timeout(600000)`; Fehlertext der
   Response bei nicht-OK auf 300 Zeichen kürzen (Muster `chat()` aus
   `scripts/llm/bench-orchestration.mjs`).
5. Ungültige Aktions-JSON mit Repair-Prompt erneut anfordern (max. 2
   Repairs pro Turn, danach Turn als Protokollfehler zählen und Flow
   abbrechen); `x/y` vor `page.mouse.click()` von 0–1000 auf die
   Viewportgröße skalieren; `goto` nur gegen `AGENT_BASE_URL`-Origin
   zulassen.
6. Flow-Ende: Orakel über `{ url: page.url(), text, apiState: {} }`
   auswerten; bestanden nur bei Orakel-`pass` UND `done`-Aktion.
   Records `{ flow, rep, pass, turns, protocol_errors, wall_ms, tokens,
   error }` als eine JSON-Zeile pro Lauf an `--out` anhängen und eine
   Summenzeile auf stderr schreiben.

Verify:
- `node --check tests/e2e/agent/runner.mjs`
- `node tests/e2e/agent/runner.mjs --help` zeigt alle sechs Flags mit Defaults
- `task quality:check` bleibt grün für die zwei neuen Dateien

## Task 3: Smoke-Lauf gegen lokale Dev-Instanz

Steps:
1. Minimalen Ein-Flow unter `/tmp/agent-smoke-flows.json` ablegen (ein
   `goto`-Flow auf `/` mit einem `textContains`-Check, kein Commit-Artefakt).
2. Lokale Dev-Instanz auf `AGENT_BASE_URL` starten und einen Lauf mit
   `--reps 1 --max-turns 4` gegen einen erreichbaren Modell-Endpunkt
   ausführen; JSONL-Ausgabe auf Vollständigkeit der Record-Felder prüfen.
3. Fehlerpfad prüfen: Runner gegen unerreichbare Modell-URL starten und
   feststellen, dass Records `error` tragen statt zu crashen.

Verify:
- `node tests/e2e/agent/runner.mjs --flows /tmp/agent-smoke-flows.json --reps 1 --max-turns 4 --out /tmp/agent-smoke.jsonl && wc -l /tmp/agent-smoke.jsonl`
- `node -e "const r = require('node:fs').readFileSync('/tmp/agent-smoke.jsonl', 'utf8').trim().split('\n').map(JSON.parse); if (!r.every(x => 'pass' in x && 'turns' in x && 'wall_ms' in x)) process.exit(1)"`
