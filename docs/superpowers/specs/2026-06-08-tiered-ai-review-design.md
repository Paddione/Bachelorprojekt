# Spec: Tiered AI Code Review Orchestration

**Datum:** 2026-06-08
**Branch:** `feature/tiered-ai-review`
**Inspired by:** Cloudflare blog post "Orchestrating AI Code Review at scale" (2026-04-20)

## Zusammenfassung

Das bestehende 3-Lens-Adversarial-Review in `pipeline.js` (Verify-Phase) wird zu einem vollständigen, risikogestuften AI-Code-Review-System ausgebaut. Zwei Einstiegspunkte — Factory-Pipeline und ein neuer CI-Job auf jedem PR — teilen sich eine gemeinsame Prompt-Bibliothek und Hilfsskripte. Das System skaliert den Review-Aufwand (1–5 Agenten + Coordinator) automatisch anhand der Diff-Größe und -Art, filtert Noise vor dem Review heraus, und dedupliziert Findings über einen Coordinator-Agenten. Menschliche PRs erhalten ab sofort automatisch ein strukturiertes AI-Review mit GitHub-PR-Integration.

## Scope & Non-Goals

**In-scope:**
- **A** — Diff Noise Filter (`filter-diff.sh`): lock files, minified assets, generated markers
- **B** — Risk Tier Classifier (`classify-risk.sh`): trivial / lite / full
- **C** — 5 spezialisierte Lens-Prompts mit "What NOT to flag"-Abschnitten (3 überarbeitet, 2 neu)
- **D** — Coordinator-Agent: Cross-Lens-Deduplication + Severity-Kalibrierung + Verdict
- **E** — Factory-Pipeline-Update (`pipeline.js` Verify-Phase): Tiers + Coordinator + Heartbeat
- **F** — CI-Job (`ai-review.yml` + `ci-review.mjs`): Auto-Review auf jeden PR, DeepSeek, GitHub-PR-Integration

**Non-Goals:**
- Re-Reviews (Awareness vorheriger Findings bei Push auf offenen PR) — eigene Folge-Spec
- Token-/Kosten-Tracking pro Review-Lauf — eigene Folge-Spec
- Circuit Breaker / Failback-Chains zwischen Modell-Providern — eigene Folge-Spec
- Docs-Reviewer oder Release-Checker (7-Lenses-Parität) — bewusst nicht in Scope

## Architektur

### Zwei Einstiegspunkte, ein geteilter Core

```
PR geöffnet/aktualisiert                Factory Implement-Phase abgeschlossen
         │                                              │
         ▼                                              ▼
.github/workflows/ai-review.yml          pipeline.js Verify-Phase
scripts/factory/ci-review.mjs            (Workflow-Harness: agent()/parallel())
         │                                              │
         └──────────────┬───────────────────────────────┘
                        ▼
              scripts/factory/  ← SHARED CORE
              ├── filter-diff.sh
              ├── classify-risk.sh
              ├── review-bug-hunter.prompt.md        (überarbeitet)
              ├── review-security-auditor.prompt.md  (überarbeitet)
              ├── review-pattern-enforcer.prompt.md  (überarbeitet)
              ├── review-perf-reviewer.prompt.md     (neu)
              ├── review-agents-md-staleness.prompt.md (neu)
              └── review-coordinator.prompt.md       (neu)
```

### Datenfluss

1. **Diff-Filterung** (`filter-diff.sh`): Noise-Dateien herausfiltern
2. **Tier-Klassifizierung** (`classify-risk.sh`): trivial / lite / full
3. **Lens-Agenten** (parallel, tier-abhängige Auswahl): Findings als JSON
4. **Coordinator-Agent** (nur Full-Tier): Dedup → Kalibrierung → Verdict
5. **Ausgabe**: Factory blockiert oder deployed; CI postet GitHub-PR-Review

## Komponenten

### A — `scripts/factory/filter-diff.sh`

Akzeptiert einen Branch-Ref oder `-` (stdin für git diff). Gibt gefilterten Diff auf stdout aus.

**Herausgefilterte Dateien:**
- Lock-Dateien: `pnpm-lock.yaml`, `package-lock.json`, `bun.lock`, `yarn.lock`, `go.sum`, `Cargo.lock`, `poetry.lock`, `flake.lock`
- Minified/Bundle: `*.min.js`, `*.min.css`, `*.bundle.js`
- Source Maps: `*.map`
- Generated (erste 5 Zeilen): Marker `@generated`, `auto-generated`, `Code generated`, `DO NOT EDIT`

**Explizit NICHT gefiltert:** SQL-Migrationsdateien (`.sql`) — auch wenn als generated markiert, da Schema-Änderungen immer reviewed werden müssen.

**Exit-Code:** 0 immer. Leere Ausgabe = gesamter Diff war Noise.

### B — `scripts/factory/classify-risk.sh`

Input: Branch-Ref (Argument). Output: JSON auf stdout.

```json
{
  "tier": "trivial|lite|full",
  "linesChanged": 42,
  "fileCount": 3,
  "securityFiles": [],
  "reason": "Begründung"
}
```

**Tier-Schwellwerte:**

| Tier | Bedingung | Agenten (Factory) | Agenten (CI) |
|------|-----------|-------------------|--------------|
| `trivial` | ≤10 Zeilen UND ≤5 Dateien | 1 Generalist (Haiku) | 1 Generalist (Haiku) |
| `lite` | ≤100 Zeilen UND ≤15 Dateien | 3 Lenses: bug+sec+pattern (Haiku) | 3 Lenses (Haiku) |
| `full` | >100 Zeilen ODER >15 Dateien ODER Security-Dateien | 5 Lenses + Coordinator (Sonnet) | 5 Lenses + Coordinator (Sonnet) |

**Security-sensitive Dateien** → erzwingen immer `full`:
Pfad-Präfixe: `auth/`, `k3d/`, `environments/`, `scripts/factory/`
Dateinamen-Muster: `realm*.json`, `*.sql`, `*secret*`, `*credential*`, `*password*`

### C — Lens-Prompts (5 Dateien)

Alle 5 Prompts erhalten einen expliziten `## What NOT to Flag`-Abschnitt. Bestehende Prompts werden überarbeitet; `review-security-auditor.prompt.md` verliert die Anweisung "Flag anything that COULD be a vulnerability, even if unlikely" — sie wird durch die Cloudflare-Disziplin ersetzt (nur konkret exploitierbare Findings).

**Neuer Prompt: `review-perf-reviewer.prompt.md`**
- Fokus: DB-Query-Patterns (N+1, fehlende LIMIT, SELECT *), Astro-Route-Overhead (sync DB in render), fehlende Indexes bei neuen Feldern, synchrone I/O-Blöcker in async-Kontext
- What NOT to Flag: hypothetische Skalierungsprobleme, Micro-Optimierungen ohne messbaren Impact, ORM-Abstraktion-Overhead ohne Beweis

**Neuer Prompt: `review-agents-md-staleness.prompt.md`**
- Bewertet Materialität der MR-Änderungen für `AGENTS.md` und `CLAUDE.md`
- High materiality (stark empfehlen zu updaten): neue k3d-Services, neue Env-Vars in schema.yaml, Taskfile-Struktur-Änderungen, neue MCP-Tools, Test-Framework-Wechsel
- Medium: große Dependency-Bumps, neue API-Routen-Patterns, neue Agents
- Low: Bug-Fixes, CSS, Content-Änderungen, kleine Refactors
- Output-Schema: `{ materialityLevel: "high|medium|low", recommendedUpdate: bool, specificSections: string[] }`

**Neuer Prompt: `review-coordinator.prompt.md`**
- Liest alle Lens-Findings als strukturiertes XML
- Dedupliziert: gleiche Datei+Zeile+Severity von mehreren Lenses → nur einmal, in der passendsten Sektion
- Re-kategorisiert: Performance-Finding im Bug-Hunter → Performance-Sektion
- Reasonableness-Filter: spekulative Findings, Nitpicks, Findings in unverändertem Code → verwerfen
- Verdict-Logik:

| Bedingung | Verdict | GitHub-Aktion |
|-----------|---------|---------------|
| Keine Findings oder nur triviale Suggestions | `approved` | ✅ approve |
| Nur suggestions/warnings ohne Produktions-Risiko | `approved_with_comments` | ✅ approve + Kommentar |
| Mehrere warnings die ein Risiko-Muster ergeben | `minor_issues` | 💬 comment (kein approve) |
| Echte critical/high Findings mit konkretem Exploit | `requested_changes` | 🚫 request changes |

### D — Factory-Pipeline-Updates (`pipeline.js` Verify-Phase)

**Änderungen an Phase Verify (aktuell Zeilen 376–418):**

1. **Vor den Lenses:** `filter-diff.sh` auf den Working-Tree-Branch laufen lassen; leeres Ergebnis → Verify überspringen (nur Lock-Dateien geändert)
2. **Tier-Klassifizierung:** `classify-risk.sh` → `tier`
3. **Tier-basierte Agent-Auswahl:**
   - `trivial`: 1 generalist agent, Haiku
   - `lite`: 3 lenses parallel (bug + security + pattern), Haiku
   - `full`: 5 lenses parallel, Sonnet; danach Coordinator-Agent, Sonnet
4. **Coordinator (nur full):** liest alle 5 Lens-Findings, gibt `verdict` zurück
5. **Blocking-Logik:** `verdict === 'requested_changes'` blockiert (statt: jedes high/critical Finding direkt)
6. **Heartbeat:** Nach jedem Lens-Agent-Abschluss `log('Verify: N/5 lenses done, elapsed Xs')` aufrufen; zusätzlich vor dem Coordinator-Start. Das Harness hat kein `setInterval` — Fortschritts-Logs nach jedem abgeschlossenen `agent()`-Call sind die praktische Alternative.
7. **Backward-Kompatibilität:** Alle bestehenden Tests (`FA-SF-*`) bleiben grün; Verify-Phase-Interface nach außen unverändert

### E — CI-Job (`.github/workflows/ai-review.yml` + `scripts/factory/ci-review.mjs`)

**`ai-review.yml`:**
```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

concurrency:
  group: ai-review-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ai-review:
    name: AI Code Review
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      pull-requests: write
      contents: read
```

Steps:
1. Checkout mit `fetch-depth: 0` (für vollständigen Diff)
2. `npm ci` (nur für `@anthropic-ai/sdk` dependency)
3. `filter-diff.sh origin/main...HEAD > /tmp/clean.diff`
4. Leerer Diff → skip (exit 0, kein Review)
5. `classify-risk.sh origin/main...HEAD > /tmp/tier.json`
6. `node scripts/factory/ci-review.mjs` mit Env-Vars:
   - `ANTHROPIC_BASE_URL: ${{ secrets.DEEPSEEK_BASE_URL }}`
   - `ANTHROPIC_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}`
   - `CLEAN_DIFF_PATH: /tmp/clean.diff`
   - `TIER_JSON_PATH: /tmp/tier.json`
   - `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
   - `PR_NUMBER: ${{ github.event.pull_request.number }}`

**`ci-review.mjs`:**
- Node.js ESM, `@anthropic-ai/sdk` mit `baseURL` aus `ANTHROPIC_BASE_URL`
- Liest Tier aus `TIER_JSON_PATH`, wählt Lenses
- Führt Lens-Agenten aus (Promise.all für Parallelität)
- Coordinator bei Full-Tier
- Heartbeat: `setInterval(() => console.log('AI review running...'), 30_000)`
- Postet via `gh pr review` CLI:
  - `--approve` bei `approved`
  - `--approve --body "..."` bei `approved_with_comments`
  - `--comment --body "..."` bei `minor_issues`
  - `--request-changes --body "..."` bei `requested_changes`
- Kommentar-Format: Tier-Badge + Top-Findings-Tabelle + Coordinator-Summary

**GitHub Secrets (manuell in Repo-Settings hinzufügen):**
- `DEEPSEEK_BASE_URL` → `https://api.deepseek.com/anthropic` (oder Wert aus deepseek.sh)
- `DEEPSEEK_API_KEY` → Wert aus `ANTHROPIC_AUTH_TOKEN` in `environments/.secrets/deepseek.sh`

## Tests

### BATS (`tests/local/`)

**`FA-AR-01-filter-diff.bats`** (offline-safe):
- Lock-Datei-Stripping (pnpm-lock.yaml, go.sum)
- Minified-Asset-Stripping (*.min.js, *.map)
- Generated-Marker-Detection (erste 5 Zeilen)
- SQL-Migration-Exception (wird NICHT gefiltert)
- Leerer Input → leerer Output

**`FA-AR-02-classify-risk.bats`** (offline-safe):
- Trivial-Tier: 5 Zeilen, 3 Dateien → `trivial`
- Lite-Tier: 80 Zeilen, 10 Dateien → `lite`
- Full-Tier: 150 Zeilen → `full`
- Security-Eskalation: `k3d/`-Datei mit 2 Zeilen → `full`
- JSON-Output-Struktur validieren

Beide in `task test:factory` eingehängt (bestehende Konvention).

### Integration

Der CI-Job `ai-review.yml` selbst dient als Integrations-Test: er läuft auf jedem PR und verifiziert, dass die gesamte Pipeline (filter → classify → lenses → coordinator → gh comment) funktioniert.

## Fehlerbehandlung & Edge-Cases

- **Leerer gefilterter Diff** → Verify-Phase überspringen (kein Review nötig), Factory deployed normal
- **Lens-Agent stirbt** (API-Fehler) → `.filter(Boolean)` vor Coordinator; bei weniger als 2 lebenden Lenses → Coordinator-Skip, Findings direkt weitergeben
- **Coordinator stirbt** → Fallback auf Raw-Findings-Merge (bestehende Logik bleibt als Fallback)
- **DeepSeek-Timeout im CI** → Job exit 1, kein Block des PRs (Advisory-Funktion bleibt advisory)
- **Security-Dateien im Diff, Tier = full, kein DEEPSEEK_API_KEY** → CI-Job skip mit Warnung (secrets not configured)

## Dateien (neue + geänderte)

| Datei | Typ | Zweck |
|-------|-----|-------|
| `scripts/factory/filter-diff.sh` | neu | Noise-Filter |
| `scripts/factory/classify-risk.sh` | neu | Tier-Klassifizierung |
| `scripts/factory/review-perf-reviewer.prompt.md` | neu | Performance-Lens |
| `scripts/factory/review-agents-md-staleness.prompt.md` | neu | AGENTS.md-Staleness-Lens |
| `scripts/factory/review-coordinator.prompt.md` | neu | Coordinator-Agent |
| `scripts/factory/ci-review.mjs` | neu | CI-Orchestrierung (Node.js ESM) |
| `.github/workflows/ai-review.yml` | neu | CI-Job |
| `scripts/factory/review-bug-hunter.prompt.md` | update | + "What NOT to flag" |
| `scripts/factory/review-security-auditor.prompt.md` | update | + "What NOT to flag", - "even if unlikely" |
| `scripts/factory/review-pattern-enforcer.prompt.md` | update | + "What NOT to flag" |
| `scripts/factory/pipeline.js` | update | Verify-Phase: Tier + Filter + Coordinator + Heartbeat |
| `tests/local/FA-AR-01-filter-diff.bats` | neu | BATS für filter-diff.sh |
| `tests/local/FA-AR-02-classify-risk.bats` | neu | BATS für classify-risk.sh |

## Abhängigkeiten

- `@anthropic-ai/sdk` — bereits in `website/package.json`; muss in Root-`package.json` ergänzt werden (oder `ci-review.mjs` nutzt `website/node_modules`)
- `gh` CLI — bereits in GitHub Actions Standard-Runner verfügbar
- DeepSeek API — `DEEPSEEK_BASE_URL` + `DEEPSEEK_API_KEY` als GitHub-Repo-Secrets (manuell einzutragen)

## Offene Punkte für die Plan-Phase

- Entscheiden ob `ci-review.mjs` eine eigene `package.json` in `scripts/factory/` braucht oder `../../website/node_modules` nutzt
- Exact prompt engineering für den Coordinator (XML-Format der Lens-Findings)
- Heartbeat-Mechanismus in Factory Workflow-Harness (kein `setInterval` — Harness verwendet eigene Timing)
