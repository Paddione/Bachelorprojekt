---
partial: p1
ticket_id: T901647
role: impl
depends_on: []
---

# P1: Runner-Auth + validateFlows

Scope: nur Edits an zwei bestehenden Dateien, keine neuen Dateien,
keine Login-Logik, keine Credentials.

- `tests/e2e/agent/runner.mjs` Ist 255, nicht-baselined, .mjs-Limit 800, Budget 545
- `tests/e2e/agent/oracle.mjs` Ist 72, nicht-baselined, .mjs-Limit 800, Budget 728

Referenzen: `tests/e2e/agent/runner.mjs` (CLI-Helper `arg(k, d)`,
`loadFlows(path)`, `runFlow(flow, rep)`, JSONL per
`appendFileSync(OUT, …)`), `tests/e2e/agent/oracle.mjs`
(`evaluateFlow(flow, state)`, `summarize(result)`),
`tests/e2e/specs/global-setup.ts:80`
(`page.context().storageState({ path: '.auth/user.json' })`).

## Task 1: validateFlows-Export in oracle.mjs

Steps:
1. In `tests/e2e/agent/oracle.mjs` `export function validateFlows(flows)`
   ergänzen (pure Funktion, keine neuen Imports).
2. Regeln: `flows` ist ein nicht-leeres Array; je Flow ist `id` ein
   nicht-leerer String und `start_url` relativ (führendes `/`);
   `goal_checks ?? checks` ist ein nicht-leeres Array; jeder Check-Typ
   steht in der Allowlist `urlContains, urlMatches, textContains,
   textMatches, apiEquals`; jeder Check hat ein `value`-Feld; ein
   vorhandenes `auth`-Feld ist boolean.
3. Jeder Verstoß wirft `Error` mit der Flow-ID in der Nachricht
   (Format `Flow <id>: <Grund>`); gültige Eingabe gibt `flows`
   unverändert zurück.
4. S2: `oracle.mjs` importiert `runner.mjs` nicht (Import-Richtung
   ausschließlich Runner → Oracle).

Verify:
- `node --check tests/e2e/agent/oracle.mjs`
- `node --input-type=module -e "import('./tests/e2e/agent/oracle.mjs').then(m => { m.validateFlows([{id:'x',start_url:'/a',goal_checks:[{type:'urlContains',value:'/a'}]}]); try { m.validateFlows([{id:'y',start_url:'/a',goal_checks:[{type:'nope',value:1}]}]); process.exit(3); } catch (e) { if (!String(e.message).includes('y')) process.exit(4); } })"`

## Task 2: --auth-Flag und State-Prüfung im Runner

Steps:
1. In `tests/e2e/agent/runner.mjs` die Konstante
   `AUTH = arg('auth', process.env.AGENT_AUTH_STATE || '')` neben den
   bestehenden `arg(…)`-Konstanten ergänzen; den `--help`-Text um die
   Zeile `--auth <pfad>` und die Env-Zeile um `AGENT_AUTH_STATE`
   erweitern.
2. Direkt nach den bestehenden `fail(…)`-Prüfungen: falls `AUTH`
   gesetzt ist, die Datei einlesen (Pfad-Existenz + JSON-Validität);
   bei fehlender Datei oder ungültigem JSON per `fail(…)` abbrechen,
   vor dem ersten Browser-Start.
3. Den Import am Dateikopf um `validateFlows` aus `./oracle.mjs`
   erweitern und `validateFlows(flows)` in `loadFlows` vor der
   Rückgabe aufrufen (fail-fast); die bestehenden Inline-Checks
   bleiben unverändert.
4. In `runFlow` den Kontext per
   `browser.newContext({ viewport: VIEWPORT, ...(AUTH ? { storageState: AUTH } : {}) })`
   erzeugen; jedes Record-Objekt erhält `authUsed: Boolean(AUTH)`.

Verify:
- `node --check tests/e2e/agent/runner.mjs`
- `node tests/e2e/agent/runner.mjs --help` zeigt die `--auth`-Zeile
- `node tests/e2e/agent/runner.mjs --flows tests/e2e/agent/curated.json --auth /tmp/e2e-agent-auth-fehlend.json` endet mit Exit 1 und Fehlermeldung, vor jedem Browser-Start

## Task 3: Auth-Guard ohne State (fail-closed)

Steps:
1. Zu Beginn von `runFlow`: falls `flow.auth === true` und kein `AUTH`
   gesetzt ist, ohne Browser das Record
   `{ flow: flow.id, rep, pass: false, turns: 0, protocol_errors: 0,
   wall_ms: 0, tokens: 0, error: 'auth-required', oracle: null,
   authUsed: false }` zurückgeben (0 Turns).
2. Kein stiller Anonymous-Fallback, keine Login- oder
   Credential-Logik: State kommt ausschließlich aus der `--auth`-Datei.

Verify:
- `node --check tests/e2e/agent/runner.mjs`
- Smoke mit einem Flow mit `"auth": true` ohne `--auth`: die
  JSONL-Zeile enthält `"pass":false`, `"error":"auth-required"` und
  `"turns":0`

## Task 4: Verifikation

Steps:
1. `node --check tests/e2e/agent/runner.mjs && node --check tests/e2e/agent/oracle.mjs`
2. `task quality:check` (S1-Ratchet: beide Dateien bleiben unter
   .mjs-Limit 800; Budgets siehe Kopf)
