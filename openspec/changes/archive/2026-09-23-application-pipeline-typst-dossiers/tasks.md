---
title: "application-pipeline-typst-dossiers — Implementation Plan (Phase 3: Personalisierung & Design)"
ticket_id: T900230
domains: [scripts, config]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T900228
depends_on_plans: [application-pipeline]
---

# application-pipeline-typst-dossiers — Implementation Plan

_Ticket: T900230_

**Voraussetzung:** Phase 1 (T900228, `openspec/changes/application-pipeline/`) muss gemergt sein —
dieser Plan baut auf `applications.jobs`/`applications.dossiers` sowie
`scripts/lib/application-pipeline-db.sh` auf.

Scope: Requirements "Curated Project-Evidence Catalog for Dossier Personalization" und "Visual
Design Accent Themes for Typst Dossiers" aus
`openspec/changes/application-pipeline-typst-dossiers/specs/application-pipeline.md`. Automatisiertes
Matching/Scoring (Requirement "Automated Profile Matching", Phase 2) und Cockpit-UI (Phase 4) sind
explizit **nicht** Teil dieses Plans.

**Externe Abhängigkeit `typst`:** `grep -rn typst .github/workflows/` liefert 0 Treffer — das
Binary ist in CI **nicht** installiert. Jeder Test, der `typst compile` tatsächlich aufruft, MUSS
daher mit `command -v typst >/dev/null 2>&1 || skip "typst binary not installed"` beginnen (T002820).
Evidenz-Auswahl und Theme-Validierung sind deshalb bewusst als reine Bash-Logik ohne
Typst-Abhängigkeit geschnitten, damit sie in CI ungeguarded laufen.

## File Structure

```
scripts/vda/apply/evidence-catalog.yaml                                         (neu, Konfig)
scripts/lib/application-pipeline-evidence.sh                                    (neu)
scripts/lib/application-pipeline-themes.sh                                      (neu)
scripts/vda/apply/render.sh                                                     (neu)
templates/application-pipeline/resume.typ                                       (neu)
templates/application-pipeline/cover-letter.typ                                 (neu)
templates/application-pipeline/themes/default.typ                               (neu)
templates/application-pipeline/themes/accent-slate.typ                          (neu)
tests/spec/application-pipeline/evidence-catalog.bats                           (neu)
tests/spec/application-pipeline/theme-validation.bats                           (neu)
tests/spec/application-pipeline/render-cli.bats                                 (neu)
```

Budget: alle Dateien neu, nicht gebaselined. `.sh`-Limit 800 Zeilen (`s1.limits`) — jede der drei
neuen Lib-/CLI-Dateien bleibt mit dem unten skizzierten Umfang deutlich darunter (~60-100 Zeilen
geschätzt). `.typ` (Typst) und `.yaml` sind in `s1.limits` nicht gelistet (kein Gate).

## Task 1: Evidenz-Katalog & Auswahl-Logik (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/application-pipeline/evidence-catalog.bats
# expected: FAIL (scripts/lib/application-pipeline-evidence.sh existiert noch nicht)
```

Szenarien (kein `typst` nötig, reine Bash/yq-Logik):
- Ein Job mit Requirements-Text "Kubernetes, CI/CD, Linux" liefert bei
  `app_pipeline_select_evidence "$requirements_text"` die Katalog-Einträge `fleet-k3s` und
  `bats-quality-gates` (ranked oben), passend zu Spec-Szenario "Evidence catalog selects relevant
  entries for a Platform/DevOps posting".
- Ein Requirements-Text ohne Katalog-Keyword-Treffer liefert den dokumentierten Default-Satz statt
  einer leeren Liste (Spec-Szenario "Missing keyword match falls back to a default evidence set").

**GREEN — Fix-Step:**

Erstelle `scripts/vda/apply/evidence-catalog.yaml` mit Einträgen der Form
`{id, keywords: [...], summary, default: true|false}` für die Plattform-Bausteine aus dem
Proposal (Fleet/k3s, Dev-Mesh, FreeToken MoE, Software Factory, BATS-Gates). Erstelle
`scripts/lib/application-pipeline-evidence.sh` mit `app_pipeline_select_evidence <text>`: matcht
Keywords case-insensitive gegen den Requirements-Text (`yq` + `grep -io`), gibt bei 0 Treffern die
`default: true`-markierten Einträge zurück, sonst die Treffer (max. 5, nach Anzahl matchender
Keywords sortiert).

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 2: Theme-Registry & Validierung (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/application-pipeline/theme-validation.bats
# expected: FAIL (scripts/lib/application-pipeline-themes.sh existiert noch nicht)
```

Szenarien:
- `app_pipeline_resolve_theme default` und `app_pipeline_resolve_theme accent-slate` geben je den
  Pfad zur passenden `.typ`-Theme-Datei zurück (Spec-Szenario "Rendering with an explicit theme
  selection").
- `app_pipeline_resolve_theme nicht-existent` beendet mit Exit-Code ≠ 0 und einer Fehlermeldung,
  die die verfügbaren Themes auflistet (Spec-Szenario "Invalid theme name is rejected before
  compilation").

**GREEN — Fix-Step:**

Erstelle `templates/application-pipeline/themes/default.typ` und
`templates/application-pipeline/themes/accent-slate.typ` (zwei unterscheidbare Farb-/Typografie-
Sets — mindestens abweichende Akzentfarbe und Schriftpaarung, siehe Proposal "Design-Akzent-System").
Erstelle `scripts/lib/application-pipeline-themes.sh` mit `app_pipeline_resolve_theme <name>`:
prüft `templates/application-pipeline/themes/<name>.typ` auf Existenz, gibt bei Fehlschlag exit 1
und `find templates/application-pipeline/themes -name '*.typ' -exec basename {} .typ \;` als
Fehlerhinweis aus.

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 3: Render-Pipeline `scripts/vda/apply/render.sh` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/application-pipeline/render-cli.bats
# expected: FAIL (scripts/vda/apply/render.sh existiert noch nicht)
```

Szenarien:
- `render.sh --job-id <id> --theme nicht-existent` bricht vor jedem Kompilierungsversuch mit dem
  Validierungsfehler aus Task 2 ab (kein `typst`-Aufruf nötig — dieser Fall ist ungeguarded testbar).
- **Guarded Happy-Path** (`command -v typst >/dev/null 2>&1 || skip "typst binary not installed"`):
  `render.sh --job-id <id> --theme default` kompiliert `resume.typ` + `cover-letter.typ` mit der
  über Task 1 ermittelten Evidenz, registriert zwei Zeilen in `applications.dossiers`
  (`kind=resume`, `kind=cover_letter`) mit `artifact_path` auf die erzeugten PDFs.

**GREEN — Fix-Step:**

Erstelle `templates/application-pipeline/resume.typ` und
`templates/application-pipeline/cover-letter.typ` mit Platzhalter-Feldern für Firma, Rolle und
Evidenz-Abschnitt (per Typst `#import`/Variablen-Injektion aus dem gewählten Theme). Erstelle
`scripts/vda/apply/render.sh`: liest den Job per psql-Helper, ruft
`app_pipeline_resolve_theme` (Task 2) und `app_pipeline_select_evidence` (Task 1) auf, rendert die
Evidenz-Werte per Template-Injektion in die `.typ`-Dateien, ruft `typst compile` auf und
registriert die Ergebnis-PDFs via `app_pipeline_upsert_dossier` (neue Hilfsfunktion in
`scripts/lib/application-pipeline-db.sh`, analog zu `app_pipeline_upsert_job` aus Phase 1).

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein (inkl. Skip bei fehlendem `typst`).

## Task 4: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil neue Test-Dateien angelegt wurden:

```bash
task test:inventory   # components/website/src/data/test-inventory.json committen
```

<!-- vitest: kein neuer Test nötig, weil dieser Plan ausschließlich Bash-CLI, Typst-Templates,
YAML-Config und BATS-Tests umfasst, keine Dateien unter components/website/src/lib/** oder
.../pages/api/** -->
