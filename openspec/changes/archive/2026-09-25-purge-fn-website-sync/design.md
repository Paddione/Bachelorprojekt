---
ticket_id: T900381
plan_ref: openspec/changes/purge-fn-website-sync/tasks.md
status: active
date: 2026-09-25
---

# Design: purge-fn-website-sync

_Ticket: T900381 · Parent-Spec: `e2e-test-infrastructure`_

## Symptom (Fakt)

`task test:changed` endet lokal vor dem ersten Test mit

```
DRIFT: DB-Funktion tickets.fn_purge_test_data traegt Marker 'to_regclass' nicht (Migration: scripts/one-shot/purge-fn-v8.sql)
```

## Ursache (belegt)

- `components/website/src/lib/tickets-schema.ts` ruft beim Start `applyLegacyMigrations(pool)` auf.
- `components/website/src/lib/tickets/migrations.ts` enthält darin `CREATE OR REPLACE FUNCTION
  tickets.fn_purge_test_data()` im **v6**-Stand (Kommentar `v6 (2026-07-08, T001638)`, 0× `to_regclass`).
- v7/v8 wurden nur als `scripts/one-shot/*.sql` eingespielt. Jeder Website-Neustart setzt die Funktion auf v6
  zurück.
- Beleg für den Überschreiber: der Live-Quelltext beginnt mit der Einrückung des TS-Template-Literals
  (`\n    DECLARE`), `purge-fn-v8.sql` spaltenbündig mit `DECLARE`.

```bash
# Stand origin/main db9de1752 — read-only
bash scripts/runtime-drift-check.sh
grep -c to_regclass components/website/src/lib/tickets/migrations.ts   # -> 0
kubectl --context fleet -n workspace exec "$(kubectl --context fleet -n workspace get pod -l app=shared-db -o name | head -1)" \
  -c postgres -- psql -U postgres -d website -qtAc \
  "select position('to_regclass' in prosrc)>0, substr(prosrc,1,12) from pg_proc where proname='fn_purge_test_data'"
# -> f | "\n    DECLARE"
```

Folge über die Drift-Meldung hinaus: auf fleet laufen die v7/v8-Schutzmaßnahmen (Existenz-Guards, zusätzliche
Sweeps) seit dem letzten Website-Neustart nicht.

## Entscheidungen

- **D1 — Eigenes Modul.** `components/website/src/lib/tickets/purge-fn.ts` exportiert
  `applyPurgeFunction(pool)`, die `CREATE OR REPLACE FUNCTION` mit dem Rumpf aus `purge-fn-v8.sql`, den
  `COMMENT ON FUNCTION` (v8) und das `GRANT EXECUTE … TO website` ausführt. v8 in `migrations.ts` einzubetten hätte
  die Datei von 587 auf rund 730 Zeilen gebracht (> 80 % des `.ts`-Limits 900) — deshalb Extraktion statt Wachstum.
  `migrations.ts` wird dadurch kleiner.
- **D2 — Rumpf wörtlich aus v8.** Der SQL-Rumpf wird aus `purge-fn-v8.sql` übernommen (zwischen `AS $$` und
  `$$;`). In einem JS-Template-Literal müssen `\` und `` ` `` und `${` maskiert werden; die Regex-Literale der
  Funktion (`\.`) werden als `\\.` geschrieben, damit PostgreSQL denselben Text erhält.
- **D3 — Guard-Test.** Ein Vitest-Test liest die neueste `scripts/one-shot/purge-fn-v*.sql`, entnimmt deren
  `RUNTIME-CHECK`-Marker und prüft, dass der Rumpf in `purge-fn.ts` ihn enthält und `migrations.ts` keine eigene
  `CREATE OR REPLACE FUNCTION tickets.fn_purge_test_data` mehr führt. Zusätzlich prüft er, dass der in
  `purge-fn.ts` eingebettete Rumpf nach Auflösen der Template-Maskierung zeichengleich mit dem v8-Rumpf ist
  (normalisierte Leerzeichen) — das deckt Übertragungsfehler bei D2 ab.
- **D4 — Keine manuelle DB-Änderung.** Der Website-Deploy nach dem Merge (Flux) installiert v8.
  `runtime-drift-check.sh` ist danach grün; das wird nach dem Deploy nachgemessen.
