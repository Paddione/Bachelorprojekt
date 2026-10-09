# p3 — Proxy-Frontend (Partial zu T901630)

Depends_on: p1 (`scripts/devflow/cli.py` liefert `python3 -m devflow` als Spawn-Ziel).
Zielbild: `proposal.md` Abschnitt WAS Punkt 2–3, Kontrakte in `design.md`.

## Budgets (S1, wirksame Schwellen)

- `scripts/llm-proxy/devflow-tools.mjs` neu, `.mjs`-Limit 800 (Quelle `docs/code-quality/gates.yaml`, Lesebefehl in `plan-quality-gates.md`).
- `scripts/llm-proxy/server.mjs` Ist 324, nicht gebaselined, wirksame Schwelle 800, Budget 476. Der Forward wächst die Datei um 2 bis 3 Zeilen und bleibt damit weit unter der Schwelle, kein Split nötig.
- `taskfiles/Taskfile.llm.yml` bestehend, 217 Zeilen, `.yml` ist nicht S1-gated.
- S2: `devflow-tools.mjs` importiert nichts aus `server.mjs` (reines Modul nach dem Vorbild `scripts/llm-proxy/bge-routes.mjs`), daher keine neuen Importzyklen.

## Task 1: devflow-tools.mjs — Routenmodul mit Backend-Spawning

Steps:
1. `scripts/llm-proxy/devflow-tools.mjs` neu anlegen, Modul-Schnitt nach `bge-routes.mjs`:
   - `export function verbForPath(path)` bildet `/tools/devflow/turbolint`, `/tools/devflow/insta_ci`, `/tools/devflow/sandbox` auf das jeweilige Verb ab, sonst `null` (Vorbild `roleForPath`, `bge-routes.mjs` Zeile 36).
   - `export async function runDevflow({ verb, worktree, scope, timeoutMs })` spawnt `python3 -m devflow` per `child_process.spawn`, übergibt `{worktree, scope}` als JSON auf stdin und liefert `{ status, body }` zurück (Vorbild `routeRequest`, `bge-routes.mjs` Zeile 199).
   - `export async function handleDevflow(req, res, path, { readBody, sendJson })` liest den Body, ruft `runDevflow` und antwortet; die Helfer werden injiziert, damit das Modul den Server nicht importiert.
2. Exit-Code-Mapping aus `design.md` Kontrakte: 0 → 200 mit Backend-JSON, 1 → 500 `devflow_fail`, 2 → 503 `devflow_env`, Spawn-Fehler oder Timeout → 503 `devflow_unreachable`.
3. Fehler immer als Envelope `{error:{code,message}}` (Vorbild `bge-routes.mjs` Zeilen 215–225); unbekanntes Verb → 404 `devflow_unknown_verb`.

Verify:
- `node --check scripts/llm-proxy/devflow-tools.mjs`
- `node -e "import('./scripts/llm-proxy/devflow-tools.mjs').then(m => console.log(m.verbForPath('/tools/devflow/turbolint')))"` gibt `turbolint` aus
- `wc -l scripts/llm-proxy/devflow-tools.mjs` bleibt deutlich unter 800

## Task 2: 2-Zeilen-Forward in server.mjs neben den bge-Routen

Steps:
1. In `scripts/llm-proxy/server.mjs` `handleDevflow` aus `./devflow-tools.mjs` importieren; der Import steht neben den bge-Imports.
2. Direkt nach dem T003205-bge-Block (`server.mjs` Zeilen 277–297) einfügen:
   `if (path.startsWith('/tools/devflow/') && method === 'POST') return handleDevflow(req, res, path, { readBody, sendJson });`
   Die Logik bleibt im Modul, hier steht nur die Weiterleitung (Muster T003205).

Verify:
- `task llm:proxy:start` meldet einen laufenden Proxy (Idempotenz-Block `Taskfile.llm.yml` Zeilen 102–126), danach liefert `curl -X POST http://127.0.0.1:18235/tools/devflow/turbolint -d '{"worktree":".","scope":"changed"}'` Backend-JSON oder einen Fehler-Envelope
- Ein unbekanntes Verb liefert 404 `devflow_unknown_verb`
- `wc -l scripts/llm-proxy/server.mjs` liegt weiter unter 800

## Task 3: Taskfile llm:devflow-Tasks mit sichtbarem Offline-Fallback

Steps:
1. In `taskfiles/Taskfile.llm.yml` drei Tasks `devflow:turbolint`, `devflow:insta_ci`, `devflow:sandbox` anlegen. Jeder sendet per curl an `http://127.0.0.1:${LLM_PROXY_PORT:-18235}/tools/devflow/` plus Verb, mit JSON-Body aus `WORKTREE` (Default `.`) und `SCOPE` (Default `changed`).
2. Erreichbarkeitsprobe vorab gegen `/livez`, nicht `/health` (Muster `proxy:status`, `Taskfile.llm.yml` Zeilen 139–157, Begründung T002336 dort): antwortet `/livez` nicht, gibt der Task eine sichtbare Warnung aus und fällt auf direktes `python3 -m devflow` mit demselben Verb zurück — nie still (Fail-closed, ADR-004).
3. S4-Abdeckung: die Tasks referenzieren Proxy-Route und Backend, kein neues Skript bleibt Orphan.

Verify:
- Proxy an: `task llm:devflow:turbolint` nutzt die Route und zeigt keine Fallback-Warnung
- Proxy aus (`task llm:proxy:stop`): derselbe Aufruf zeigt die Warnung und das Direkt-Python-Ergebnis
- `task test:changed`, `task freshness:regenerate`, `task freshness:check`
