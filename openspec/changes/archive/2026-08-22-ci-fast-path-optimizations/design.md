# Design: ci-fast-path-optimizations

## Context
Zur Optimierung der CI-Laufzeit wird im Workflow \`.github/workflows/ci.yml\` ein Step-Level Fast-Path für den Job \`Vitest (website)\` etabliert. Zudem wird für \`actionlint\` im Job \`BATS Unit + Quality Gates\` ein Runner-Cache konfiguriert.

## Architecture & Step Flow
1. **Vitest (website) Filter:**
   - \`git diff --name-only origin/main...HEAD\` prüft auf Pfade unter \`components/website/\` oder \`.github/workflows/ci.yml\`.
   - Bei fehlenden Änderungen werden alle nachfolgenden Schritte mit \`if: steps.filter.outputs.run_website == 'true'\` übersprungen.
   - Der Job schließt mit Exit-Code 0 ab, sodass die Branch Protection Condition \`Vitest (website)\` erfüllt bleibt.
2. **Actionlint Caching:**
   - \`actions/cache@v6\` cacht die Binary \`~/.local/bin/actionlint\` mit Key \`actionlint-1.7.7-linux-amd64\`.

_Ticket: T013468_
