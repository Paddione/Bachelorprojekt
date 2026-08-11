# p4 — openspec.sh archive Batch-Skalierung (T003140)

## Ziel

`scripts/openspec.sh archive <slug>` startet je Delta-Datei einen eigenen
Node-Prozess (~3s/Change) — Schleifen über N Changes brechen in Default-Command-Timeouts.

## Steps

1. **RED.** Test in `tests/spec/batch-openspec-embed-fixes.bats`: Batch-Archivierung von
   ≥3 Changes in einem Node-Prozess. `expected: FAIL` (mehrere Prozessstarts).

2. **GREEN.** In `scripts/openspec.sh` (_merge_delta): Batch-Modus, der mehrere Slugs in
   EINEM Node-Prozess abarbeitet — `openspec-merge.mjs` bekommt eine Liste statt eines Paares.
   Einzel-Archivierung (Normalfall dev-flow-execute) bleibt unverändert.

3. **Alternativ (falls Batch-Modus zu invasiv):** Doku, dass Block-Archivierungen im
   Hintergrund oder in Portionen zu fahren sind (Design-Entscheidung im Plan dokumentieren).

4. **Verifikation.** 59-Changes-Schleife läuft in deutlich unter 3 Minuten
   (Default-Timeout-Grenze), ohne `set -e`-Abbruch bei 41.

## Acceptance

- Batch-Archivierung startet nicht je Delta einen Node-Prozess.
- Einzel-Archivierung unverändert (kein Regression).
- Kein Abbruch in Default-Command-Timeouts bei Rückstand.
