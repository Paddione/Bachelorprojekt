---
title: "purge-fn-website-sync — Implementation Plan"
ticket_id: T900381
domains: [website, db, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# purge-fn-website-sync — Implementation Plan

_Ticket: T900381 · Design: `openspec/changes/purge-fn-website-sync/design.md` (D1–D4)._

**Ziel:** Der Website-Start installiert `tickets.fn_purge_test_data()` im Stand der neuesten
`scripts/one-shot/purge-fn-v*.sql` (v8) statt einer eingebetteten v6-Kopie.

## File Structure

| Datei | Aktion |
|---|---|
| `components/website/src/lib/tickets/purge-fn.ts` | neu — `PURGE_FN_BODY` (v8-Rumpf) und `applyPurgeFunction(pool)` |
| `components/website/src/lib/tickets/migrations.ts` | geändert — v6-Block entfernt (split/extract), Aufruf von `applyPurgeFunction` |
| `tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats` | neu — Guard-Test |
| `tests/spec/ci-cd.bats` | T001453-Test prüft die Re-Markierung jetzt in `purge-fn.ts` statt `migrations.ts` |
| `components/website/src/data/test-inventory.json` | regeneriert |

S1-Budgets:

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/lib/tickets/migrations.ts` | 587 | 313 |

`migrations.ts` wird durch die Extraktion um rund 380 Zeilen kleiner; `purge-fn.ts` entsteht mit rund 540 Zeilen
(`.ts`-Limit 900).

<!-- vitest: kein neuer Test nötig, weil der Guard als BATS-Test das TS-Modul per node importiert und den exportierten Rumpf prüft; Logik ändert sich nicht, nur der SQL-Stand -->

## Task 1 — Guard-Test (RED)

- [ ] **1.1** `tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats` mit vier Tests: Positiv-Anker
  (neueste Migration hat einen `RUNTIME-CHECK`-Marker), Marker im exportierten `PURGE_FN_BODY`, Rumpf
  zeichengleich (Leerraum normalisiert) mit dem Rumpf der neuesten Migration, einzige Definition in
  `components/website/src/lib` ist `tickets/purge-fn.ts`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats
# expected: FAIL (purge-fn.ts existiert nicht, migrations.ts definiert v6)
```

## Task 2 — Modul extrahieren (GREEN)

- [ ] **2.1** `purge-fn.ts` erzeugen: `export const PURGE_FN_BODY = \`…\`` mit dem Rumpf zwischen `AS $$`
  und `$$;` aus `scripts/one-shot/purge-fn-v8.sql`, per Skript übernommen, nicht abgetippt. Der Rumpf enthält
  5 Backticks (SQL-Kommentare), deshalb kein `String.raw`: `\`, `` ` `` und `${` werden beim Erzeugen maskiert,
  der Laufzeitwert ist damit zeichengleich mit der SQL-Datei (vom Guard-Test geprüft).
  `export async function applyPurgeFunction(pool)` führt `CREATE OR REPLACE FUNCTION … AS $$${PURGE_FN_BODY}$$`,
  `COMMENT ON FUNCTION` (Text aus v8) und `GRANT EXECUTE … TO website` aus.
- [ ] **2.2** In `migrations.ts` den v6-Block (`CREATE OR REPLACE FUNCTION`, `COMMENT`, `GRANT`) durch
  `await applyPurgeFunction(pool);` ersetzen und importieren.
- [ ] **2.3** Grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats tests/unit/purge-fn-gaps.bats
```

## Task 3 — Final Verification

- [ ] **3.1** Typprüfung der Website-Datei (`pnpm exec tsc --noEmit -p components/website` oder der
  Repo-Äquivalent-Task) ohne neue Fehler.
- [ ] **3.2** Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **3.3** Nach Merge und Website-Deploy: `bash scripts/runtime-drift-check.sh` meldet keinen Drift mehr.
