# p3 — coaching-json-ingest: Pfad-Reorg + exakte Fehlermeldung (T011901)

## Ziel

Zwei unabhängige Fehler in `tests/unit/coaching-json-ingest.bats`:

1. Seit der Repo-Reorg (T006999, PR #4659, 2026-08-15) liegt der Website-Code
   unter `components/website/`, nicht mehr unter `website/`. Der `cd
   "${PROJECT_DIR}/website"` in Zeile 22 und 30 schlägt fehl (Verzeichnis
   existiert nicht).
2. Die erwartete Meldung `content fehlt` (Zeile 31) stimmt nicht mit dem realen
   String überein: `components/website/src/lib/ingest-json-core.ts:20` wirft
   `Eintrag ${i}: "content" fehlt oder ist leer`. `assert_output --partial
   "content fehlt"` matcht `"content" fehlt` nicht (Anführungszeichen).

## Steps

1. **RED.** Testlauf auf dem aktuellen Stand:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/coaching-json-ingest.bats
# expected: FAIL (cd schlägt fehl und/oder Meldungs-Mismatch)
```

2. **GREEN.** In `tests/unit/coaching-json-ingest.bats`:
   - Zeile 22 und 30: `cd '${PROJECT_DIR}/website'` →
     `cd '${PROJECT_DIR}/components/website'`, relativer Skriptpfad
     `../scripts/coaching/ingest-json.mts` → `../../scripts/coaching/ingest-json.mts`.
   - Zeile 31: `assert_output --partial "content fehlt"` →
     `assert_output --partial '"content" fehlt oder ist leer'`.

   Hinweis: `ingest-json.mts` löst seine Imports relativ zur eigenen Datei auf
   (`../../components/website/src/lib/ingest-json-core.js`), der Aufruf aus
   `components/website/` funktioniert daher unverändert.

3. **Verifikation.**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/coaching-json-ingest.bats
```

## Acceptance

- Beide Tests laufen grün; der "exits 1 on malformed JSON content"-Test assertiert
  den exakten realen Meldungs-String.
- Kein Produktcode geändert.
