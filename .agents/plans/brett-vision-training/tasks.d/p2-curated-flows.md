# Partial p2 — curated-flows (T901676, impl, depends_on p1)

Neue Flow-SSOT `tests/e2e/agent/curated-brett.json` mit 5 Brett-Flows
(Flows siehe `design.md`-Tabelle). Datei neu; `.json` steht nicht in
`s1.limits` (`docs/code-quality/gates.yaml`), daher kein S1-Budget
nötig. Validierung nutzt `oracle.mjs` lesend (kein Edit an
Runner/Orakel, keine neuen Check-Typen).

## Task 1: Fünf Brett-Flows schreiben

Steps:
1. `tests/e2e/agent/curated-brett.json` nach Schema von
   `tests/e2e/agent/curated.json` anlegen (`flows[]` mit `id`,
   `start_url` relativ, `goal`, `goal_checks`, `source_spec`,
   `auth`-Flag wo nötig).
2. Anonyme Flows zuerst: `brett-smoke-home`, `brett-guest-share-link`.
3. Auth-Flows: `brett-session-lifecycle`, `brett-figure-place-move`,
   `brett-undo-redo` mit `"auth": true`; `apiEquals`-Checks gegen
   REST-Snapshot-Pfade aus dem p1-Audit (exakte Pfade dort notiert).
4. Jede `source_spec` muss auf eine existierende, grüne Spec zeigen.

Verify:
- `node -e "import('./tests/e2e/agent/oracle.mjs').then(async m => { const fs = await import('node:fs'); const d = JSON.parse(fs.readFileSync('tests/e2e/agent/curated-brett.json', 'utf8')); m.validateFlows(d.flows ?? d); console.log('flows-ok:' + (d.flows ?? d).length); })"`

## Task 2: Harness-Kompatibilität sichern

Steps:
1. Orakel-Suite unverändert grün laufen lassen
   (`node --test tests/e2e/agent/oracle.test.mjs`) — kein Edit.
2. Runner-Hilfe rauchen: `--flows` auf die neue Datei zeigen lassen
   (Hilfe-Aufruf, kein Browser): Runner muss die Datei akzeptieren.

Verify:
- `node --test tests/e2e/agent/oracle.test.mjs`
- `node tests/e2e/agent/runner.mjs --help`
