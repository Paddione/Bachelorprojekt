# Proposal: brain-quality-goals

## Why

Das LLM-Wiki `Paddione/brain` hat seit dem Seed (Sprint 1, PR #2554) zwar Lint-Gates, aber
diese haben empirisch verifizierte Löcher: Alias-/Anker-Wikilinks (`[[s|t]]`, `[[s#a]]`)
werden gar nicht geprüft, `tags: []` passiert trotz SCHEMA-Pflicht, der Frontmatter-Lint
läuft fälschlich über `raw/` (latenter CI-Breaker — die erste echte Roh-Datei bricht CI)
und bei ungültigen Enum-Werten crasht der Linter ohne Diagnose. Zusätzlich publiziert
`build-site.yml` auch bei rotem Lint und kopiert `raw/` mit auf die öffentliche Site.
Es existiert außerdem keinerlei Nutzungs-Doku (kein How-to, kein Cheatsheet, keine
First-Aid, keine LLM-Workflow-Doku) und keine definierten Qualitätsziele für Struktur
und Organisation. Der Seed-Zustand (2 Seiten, leeres raw/) ist der ideale Zeitpunkt:
Jetzt definierte Ziele erzeugen nie einen Altbestand an Verstößen.

## What

- **11 Ziele `G-BRAIN01`–`G-BRAIN11`** definiert auf neuer Wiki-Seite `quality-goals`
  (type: decision), self-contained im brain-Repo (Verankerung-Entscheidung A, D5-konform).
- **6 Gates repariert** (Enforcement-Scope B — nur bestehende Checks halten, was sie
  versprechen; keine neuen blockierenden Struktur-Checks):
  `lint-wikilinks.sh` versteht Alias/Anker + listet alle Fehler (G-BRAIN01/04);
  `lint-frontmatter.sh` erzwingt nicht-leere `tags`, scoped auf wiki/+Hubs mit raw/- und
  README-Exemption, Diagnose statt set-e-Crash (G-BRAIN02/03/04); `build-site.yml`
  bekommt Lint-Job mit `needs` und staged `raw/` nicht mehr (G-BRAIN05/06).
- **5 Targets nur dokumentiert** mit kopierbarem Mess-Kommando + Baseline 2026-07-03:
  0 Orphans, ≤2 MOC-Hops, log-Eintrag pro Commit, raw-Backlog < 14 Tage,
  OpenSpec-SSOT-Abdeckung 0/24 → 24/24 (User-Annotation; Ingest ist Folge-Arbeit).
- **Nutzungs-Doku:** `usage`, `cheatsheet`, `first-aid`, `llm-workflows` (mit ≥5
  kopierbaren Prompt-Vorlagen inkl. OpenSpec-SSOT-Sync) als type: runbook; `README.md`
  als GitHub-Landing; SCHEMA-Nachträge Sprach- (DE-Prosa/EN-Fachbegriffe) und
  Slug-Konvention (kebab-case); `index.md`/`index-moc.md`/`log.md` verlinken die neuen
  Seiten (lebt G-BRAIN07/08/09 vor).
- **Dual-Target:** alles im Seed-SSOT `templates/brain/` (dieser PR); identischer
  Folge-PR ins live `Paddione/brain` nach Merge (T001578-Präzedenz gegen Drift).
- **Tests:** NEUE Datei `tests/spec/brain-quality-goals.bats` (kein Konflikt mit
  T001578-Appends; schließt die test:factory-Trigger-Lücke für templates/brain/**),
  RED→GREEN-Fixtures für alle 6 Gates + Selbst-Konformität aller Seed-Seiten.

Design-Spec: `docs/superpowers/specs/2026-07-03-brain-quality-goals-design.md`

_Ticket: T001608_
