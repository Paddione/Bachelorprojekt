# openspec-embedding Delta — Embed-Local-Retry

## ADDED Requirements

### Requirement: Embed-Local-Wrapper retried transiente Backend-Fehler

`scripts/openspec-embed-local.sh` SHALL retry the `openspec-embed.mjs` invocation up to
`OPENSPEC_EMBED_RETRIES` (default 2) additional times, with `OPENSPEC_EMBED_RETRY_DELAY`
(default 5s) between attempts, whenever the output lacks an `indexed slug='` success
marker. When all retries are exhausted, the wrapper SHALL exit non-zero with its
fail-visible message; a transient backend timeout SHALL NOT end the run after the first
attempt. The backend probe before the embed step SHALL remain fail-fast (no retry).

#### Scenario: Transienter Timeout wird überbrückt

- **GIVEN** der erste `openspec-embed.mjs`-Lauf endet best-effort ohne `indexed slug=` (Backend-Timeout), und ein Folgeversuch würde Erfolg liefern
- **WHEN** `openspec-embed-local.sh <slug>` mit `OPENSPEC_EMBED_RETRIES=3` läuft
- **THEN** der Wrapper wiederholt den Lauf; beim erfolgreichen Folgeversuch Exit 0 mit `indexed slug=`

#### Scenario: Retries erschöpft — fail-visible

- **GIVEN** alle `openspec-embed.mjs`-Läufe enden best-effort ohne `indexed slug=`
- **WHEN** `openspec-embed-local.sh <slug>` läuft
- **THEN** der Wrapper exitet non-zero mit der Meldung `Embedding wurde NICHT indiziert`; mindestens initial + Retries Aufrufe fanden statt

#### Scenario: Erfolg im ersten Versuch unverändert

- **GIVEN** der erste Lauf liefert `indexed slug=`
- **WHEN** `openspec-embed-local.sh <slug>` läuft
- **THEN** Exit 0 ohne zusätzlichen Retry; der `--count-skipped`-Folgelauf bleibt bestehen
