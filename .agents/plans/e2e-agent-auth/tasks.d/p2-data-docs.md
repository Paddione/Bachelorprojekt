# Partial p2 — data-docs (T901647, e2e-agent-auth)

Scope: `tests/e2e/agent/curated.json` + `docs/runbooks/e2e-vision-agents.md`.
Depends: p1 (Runner-Flag `--auth`, JSONL-Feld `authUsed` in
`tests/e2e/agent/runner.mjs`). Beide Zieldateien sind bestehend;
`.json`/`.md` fallen nicht unter S1-Zeilenlimits.

## Task 1: Auth-Marker in curated.json setzen

Steps:

1. In `tests/e2e/agent/curated.json` das Feld `"auth": true` an genau den
   beiden Flows `content-hub-editor` und `admin-inbox-renders` ergänzen.
   Die übrigen 5 Flows bleiben unverändert (Default: anonym).
2. JSON-Gültigkeit per Parse prüfen:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('tests/e2e/agent/curated.json','utf8')); console.log('curated.json parses OK')"
   ```
3. Marker-Menge prüfen — genau 2 Flows mit Marker:
   ```bash
   jq -c '[.flows[] | select(.auth == true) | .id]' tests/e2e/agent/curated.json
   ```

Verify:

- Der `jq`-Befehl aus Step 3 gibt exakt
  `["content-hub-editor","admin-inbox-renders"]` zurück.
- Commit als `test(agent): mark admin flows as auth-required`.

## Task 2: Runbook-Abschnitt Auth ergänzen

Steps:

1. In `docs/runbooks/e2e-vision-agents.md` einen Abschnitt `## Auth`
   ergänzen: State erzeugen via bestehendem Projekt `mentolder-setup`
   (`tests/e2e/playwright.config.ts`), erzeugte `storageState`-Datei dem
   Runner per `--auth <pfad>` (oder `AGENT_AUTH_STATE`) übergeben.
2. Warnung aufnehmen: Dateien unter `.auth/` nie committen. Beleg im
   Abschnitt nennen: Ignore-Regel `e2e/.auth/` in `tests/.gitignore`,
   prüfbar per:
   ```bash
   git check-ignore -v tests/e2e/.auth/user.json
   ```
3. Bench-Trennung dokumentieren: Läufe mit und ohne Auth getrennt halten
   und anhand des JSONL-Felds `authUsed` auswerten; Auth-Flows ohne
   State brechen mit `auth-required` ab statt zu wandern.

Verify:

- `git check-ignore -v tests/e2e/.auth/user.json` meldet die Regel aus
  `tests/.gitignore` (Beleg für die Nicht-Committen-Warnung).
- Alle im neuen Abschnitt genannten Pfade und Flags existieren
  (`tests/e2e/playwright.config.ts`, `--auth`, `AGENT_AUTH_STATE`).
- Commit als `docs(agents): document agent runner auth` (`runbook` ist kein gültiger Scope).
