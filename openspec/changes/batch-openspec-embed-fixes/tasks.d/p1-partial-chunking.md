# p1 — tasks.d-Partials token-budgetiert embedden (T003268)

## Ziel

Defekt 1: `tasks.d/*`-Partials laufen als ganze Dateien in je einen Chunk —
legale Partials bis 7000 Token sprengen das Backend-Limit (2048/4096).
Defekt 2: stiller `set -e`-Tod der PF-Parse-Schleife bei trägem Port-Forward.

## Steps

1. **RED — Failing-Test-Step.** Erweitere/erzeuge `tests/spec/batch-openspec-embed-fixes.bats`
   mit einem Test, der eine >4096-Token-Partial-Datei embedded und `400 exceed_context_size`
   erwartet. `expected: FAIL` (Defekt 1 noch vorhanden).

2. **GREEN — Chunking.** In `scripts/openspec-embed.mjs` (buildChunks, Partial-Enrichment
   ~Z.282-289): leite Partial-Dateien durch dieselbe `splitByTokenBudget`-Mechanik wie
   proposal/tasks (targetTokens 400, Manifest-Metadaten je Teil-Chunk).

3. **GREEN — set -e-Schutz.** In `scripts/openspec-embed-local.sh` und
   `scripts/openspec-embed-lib.sh` (parse_pf_local_port): `PF_PORT="$(parse_pf_local_port … || true)"`
   bzw. `if ! PF_PORT=$(…)`-Form; gleiche Prüfung für die pf_listener_pid-Schleife im
   OPENSPEC_EMBED_PF_PORT-Zweig.

4. **Verifikation.** `tests/unit/lib/bats-core/bin/bats tests/spec/batch-openspec-embed-fixes.bats`
   — grün. Repro aus T003268 läuft ohne 400 und ohne stillen Exit.

## Acceptance

- Partial > 4096 Token wird gesplittet embedded (kein 400).
- `set -e`-Schleife endet nicht mehr still mit rc=1 und null Output.
- Manifest-Metadaten je Teil-Chunk erhalten.
