# Proposal: ci-fast-path-optimizations

## Why

Im CI-Workflow (`.github/workflows/ci.yml`) ist der Job `Vitest (website)` einer der langsamsten Checks auf dem kritischen Pfad (~90–100s). Obwohl Vitest intern bereits `--changed` nutzt, führt der Job für *jeden* PR (auch Docs, Backend, BATS, K8s, Scripts) unweigerlich das vollständige Node/pnpm-Setup, `pnpm install --frozen-lockfile`, `astro:check` und `knip` aus (~60–80s unnötiger Overhead). Zudem wird das Tool `actionlint` im Job `BATS Unit + Quality Gates` bei jedem Push via `curl` heruntergeladen, anstatt Runner-Caching zu nutzen.

## What

1. **Website CI Step-Level Fast-Path**:
   - Vor dem teuren Setup prüft ein leichtgewichtiger Diff-Step (`git diff origin/main`), ob relevante Dateien unter `components/website/` geändert wurden.
   - Falls keine Website-Dateien geändert wurden, werden `pnpm install`, `astro:check`, `knip` und `vitest` übersprungen (`run_website=false`).
   - Der Job beendet sofort erfolgreich (`::notice::No website changes — fast exit`) und meldet den in GitHub Branch Protection als required definierten Check `Vitest (website)` in wenigen Sekunden als grün.
2. **Actionlint Caching**:
   - `actionlint` wird im Workflow gecacht (`actions/cache`), um Download-Overhead und externe Abhängigkeiten zu minimieren.
3. **Spec & Verification**:
   - Aktualisierung von `openspec/specs/ci-cd.md` und Absicherung durch BATS-Spec-Tests.

_Ticket: T013468_

