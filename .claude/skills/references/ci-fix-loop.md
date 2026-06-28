# CI-Fix-Schleife — Referenz für dev-flow-execute Schritt 5.5

## Required Checks (Branch-Protection)

Auto-Merge wartet auf diese fünf required checks:

| Check | Workflow |
|-------|----------|
| `Offline Tests (Manifests, Configs, Unit)` | `ci.yml` → `task test:all` |
| `Security Scan` | `ci.yml` → image-pin + hardcoded-secret detection |
| `Brett TypeScript` | `ci.yml` → tsc in `brett/` |
| `Vitest (website)` | `ci.yml` → `pnpm test` in `website/` |
| `Conventional Commits` | `ci.yml` → commitlint PR-Titel |

`E2E PR` ist **kein** required check (T000722) — erscheint informativ, blockiert Merge nicht.

## Monitoring-Werkzeuge

### Überblick: PR-Checks

```bash
gh pr checks --json name,state,link | jq '.[] | select(.state != "SUCCESS")'
```

### Run-Logs (Volltextsuche)

```bash
FAILED_RUN=$(gh run list --json databaseId,conclusion | jq -r '[.[] | select(.conclusion=="failure")] | last | .databaseId')
gh run view "$FAILED_RUN" --log-failed | tail -300
```

### Job-Level Step-Diagnose (strukturiert, schneller)

```bash
# Alle fehlgeschlagenen Jobs + Steps für einen Run
gh api "repos/Paddione/Bachelorprojekt/actions/runs/${FAILED_RUN}/jobs" \
  --jq '.jobs[] | select(.conclusion == "failure") | {id, name, steps: [.steps[] | select(.conclusion == "failure")]}'

# Einzelner Job mit Step-Zeiten
gh api "repos/Paddione/Bachelorprojekt/actions/jobs/${JOB_ID}" \
  --jq '{job: .name, steps: [.steps[] | {n: .number, name: .name, conclusion: .conclusion}]}'
```

Die Job-API liefert Step-Namen und Exit-Zeiten — damit klassifiziert ein Fix-Subagent den Fehler
(z.B. "Step 4: astro check fehlgeschlagen nach 12s") ohne alle Logs zu scannen.

## Häufige Fehlertypen & Fix-Routine

Reihenfolge: Freshness → TypeScript → BATS → Kustomize → Commitlint

### 1. Freshness-Fehler (`stale artifact`)

```bash
task freshness:regenerate
git add docs/ website/src/data/ website/src/lib/
git commit -m "chore: regenerate freshness artifacts"
```

### 2. TypeScript-Fehler (website Vitest / Brett tsc)

```bash
cd website && pnpm type-check   # oder: cd brett && npx tsc --noEmit
# Fehler beheben, dann:
git add website/src/ brett/src/
git commit -m "fix(website): resolve type errors"
```

### 3. BATS-Unit-Fehler

```bash
./tests/runner.sh local <TEST-ID>
# Fehlende Test-Inventory-Einträge:
task test:inventory
git add website/src/data/test-inventory.json
```

### 4. Kustomize-Fehler

```bash
task workspace:validate
# Manifest-Fehler beheben
```

### 5. Commitlint

PR-Titel muss `type(scope): subject` folgen. REST-Edit falls `gh pr edit --title` fehlschlägt:
```bash
gh api -X PATCH "repos/Paddione/Bachelorprojekt/pulls/<N>" -f title="fix(scope): subject [T000XXX]"
```

## Fix-Subagent Prompt-Bauanleitung

Nach `devflow-ci-watch.sh` gibt es strukturierten Output (Job-Step-Diagnose + Logs).
Fix-Subagent-Prompt-Vorlage:

```
Du bist ein CI-Fix-Subagent. Kontext:
- Branch: <branch>
- Fehlgeschlagene Jobs/Steps: <job-step-output>
- Relevante Logs: <tail-200-logs>

Aufgabe: Behebe den Fehler minimal. Commit + Push auf den Branch.
Wichtig: git add <changed-paths> (kein git add -A — git-crypt-Schutz, T001210).
```

Modell: `sonnet`, Effort: `low` für Freshness-Fehler, `medium` für TS/BATS.
