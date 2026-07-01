---
title: "t001349-korczewski-deploy-rate-metric — Implementation Plan"
ticket_id: T001349
domains: [ci-cd, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001349-korczewski-deploy-rate-metric — Implementation Plan

_Ticket: T001349_

**Goal:** Der G-CD01-Messbefehl in `.claude/lib/goals.md` zeigt auf die gelöschte Workflow-Datei
`build-website-korczewski.yml` (gelöscht durch PR #2167/T001229) und liefert dadurch dauerhaft den
eingefrorenen Wert 53 % zurück. Dieser Plan stellt den Messbefehl auf eine Job-Level `gh api`-Abfrage
gegen den aktuell existierenden, konsolidierten Workflow `build-website.yml` um, korrigiert die
Spec-Drift in `openspec/specs/website-core.md`, füllt das OpenSpec-Delta aus und verankert den bereits
committed-bereiten Regressionsguard aus `tests/spec/ci-cd.bats` als RED→GREEN-Gate. Der Guard ist
generisch (Regex über alle `--workflow <datei>.yml`-Treffer in `goals.md`) und fängt künftig jede
Workflow-Umbenennung ab, die in `goals.md` nicht nachgezogen wurde.

**Architecture:** Reine Dokumentations-/Test-/Spec-Änderung — kein Kubernetes-Manifest, kein
Workflow-YAML wird verändert. `goals.md` bleibt bei der bestehenden Konvention (inline Bash-Snippet
pro Ziel, kein dediziertes Skript). Der neue Guard-Test existiert bereits in `tests/spec/ci-cd.bats`
(Test-Name `"G-CD01: goals.md referenziert keine .github/workflows/*.yml-Datei, die nicht
existiert"`, Zeile ~120) und wird von diesem Plan NICHT neu geschrieben, sondern als RED-Schritt
referenziert.

**Tech Stack:** Markdown (`goals.md`, OpenSpec-Specs), BATS (bereits vorhandener Test), `gh api`
(GitHub REST API, Job-Level).

## Global Constraints

- Kein Kubernetes-Manifest, kein `.github/workflows/*.yml` wird in diesem Plan verändert — nur Prosa
  in `.claude/lib/goals.md`, Spec-Prosa in `openspec/specs/website-core.md`, das OpenSpec-Delta unter
  `openspec/changes/t001349-korczewski-deploy-rate-metric/specs/ci-cd.md`, sowie generierte
  Freshness-Artefakte.
- Der `gh api`-Live-Aufruf wird NUR zur Implementierungszeit ausgeführt, um den frischen Messwert für
  `goals.md` zu ermitteln — er ist NICHT Teil des BATS-Tests (der prüft nur Text in `goals.md`, keine
  Netzwerk-Dependency, bleibt offline-tauglich und CI-stabil).
- **S1-Budget (verifiziert, Stand dieser Plan-Erstellung):** alle vier berührten Dateien sind
  `nicht-baselined` (kein Eintrag in `docs/code-quality/baseline.json`), Extensions `.md`/`.bats` sind
  ohnehin nicht in der S1-Limit-Tabelle (`gates.yaml` kennt nur `.ts/.js/.jsx/.py`, `.svelte/.sh/.mjs/
  .mts`, `.astro/.tsx/.java/.php`, `.bash`, `.cjs`) → kein Zeilenbudget-Gate für diesen Plan.
  Ist-Zeilen zur Referenz: `.claude/lib/goals.md` 238, `openspec/specs/website-core.md` 707,
  `openspec/specs/ci-cd.md` 1055, `tests/spec/ci-cd.bats` 203 (der neue Test dort ist bereits
  enthalten, keine weitere Änderung an dieser Datei in diesem Plan).

---

## File Structure

```
.claude/lib/goals.md                                              — Modify (G-CD01 Messbefehl, Priorität, Tabellen)
openspec/specs/website-core.md                                    — Modify (Spec-Drift-Fix, gelöschte Datei-Referenz)
openspec/changes/t001349-korczewski-deploy-rate-metric/specs/ci-cd.md — Modify (Delta ausfüllen, Platzhalter-Requirement ersetzen)
website/src/data/test-inventory.json                               — Modify (regeneriert, falls freshness:regenerate Änderungen erkennt)
```

Der bereits committed-bereite Test in `tests/spec/ci-cd.bats` wird NICHT verändert — er ist der
RED-Fixpunkt dieses Plans.

**Decomposition rationale:** Task 1 verifiziert RED (der bestehende Test schlägt fehl). Task 2 fixt
`goals.md` (macht Task 1 grün). Task 3 korrigiert die Spec-Drift in `website-core.md` (unabhängig vom
Guard, aber gleicher Ursprungsfehler T001229). Task 4 füllt das OpenSpec-Delta aus. Task 5 führt die
finale CI-äquivalente Verifikation aus.

---

### Task 1: RED — bestehenden Guard-Test als Ausgangspunkt verifizieren

**Files:**
- Keine Änderung (Verifikations-Task)

**Interfaces:**
- Consumes: den bereits committed-bereiten Test in `tests/spec/ci-cd.bats` (Zeile ~120,
  `"G-CD01: goals.md referenziert keine .github/workflows/*.yml-Datei, die nicht existiert"`).
- Produces: Nachweis, dass der Test auf dem aktuellen Branch-Stand rot ist (findet
  `build-website-korczewski.yml` in `goals.md`, Datei existiert nicht mehr).

- [ ] **Step 1: Test isoliert ausführen und RED bestätigen**

```bash
bash tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "goals.md referenziert"
# expected: FAIL — goals.md referenziert noch build-website-korczewski.yml (Zeile ~63),
# .github/workflows/build-website-korczewski.yml existiert nicht mehr (geloescht durch PR #2167/T001229)
```

---

### Task 2: `.claude/lib/goals.md` — Messbefehl fixen, Priorität nachziehen

**Files:**
- Modify: `.claude/lib/goals.md`

**Interfaces:**
- Consumes: nichts (reine Prosa-/Befehls-Änderung).
- Produces: einen Messbefehl, der auf die existierende Datei `build-website.yml` zeigt (macht Task 1
  grün) und den frischen, zur Implementierungszeit gezogenen Messwert.

- [ ] **Step 1: Frischen Messwert ziehen (zur Implementierungszeit ausführen, NICHT den 15/15-Snapshot
      aus der Design-Spec hart kopieren — der könnte inzwischen veraltet sein)**

```bash
gh api "repos/{owner}/{repo}/actions/workflows/build-website.yml/runs?branch=main&per_page=15" \
    --jq '.workflow_runs[].id' \
  | xargs -I{} gh api repos/{owner}/{repo}/actions/runs/{}/jobs \
      --jq '.jobs[] | select(.name=="Deploy Website (korczewski)") | .conclusion' \
  | sort | uniq -c
```

Notiere das Ergebnis (z.B. `15 success` oder `14 success / 1 failure`) — dieser Wert ersetzt den
`53 %`-Wert in `goals.md` in Step 2.

- [ ] **Step 2: G-CD01-Sektion in `goals.md` aktualisieren**

Im Abschnitt `## G-CD01 — korczewski Website-Deploy-Rate` (Zeile ~58):
- Überschrift von `53 % → ≥ 90 % ⚠️` auf den frischen Messwert + `✅` ändern (z.B.
  `100 % (≥ 90 %) ✅`, je nach Ergebnis aus Step 1).
- "Was:"-Zeile auf den frischen Split aktualisieren (z.B. `15/15 grün` statt `8/15 grün (7
  Failures)`), Root-Cause-Satz durch einen kurzen Verweis auf den Fix ersetzen (Messbefehl zeigte auf
  gelöschten Workflow, jetzt auf `build-website.yml`/Job `deploy-korczewski`).
- Den Bash-Codeblock durch den in Step 1 verwendeten `gh api`-Job-Level-Befehl ersetzen (identischer
  Wortlaut wie in Step 1 dieses Tasks).
- Die `> **A · Baseline:** …`-Meta-Zeile auf `**C · Baseline:** <frischer Wert> · **Target:** ≥ 90 %
  · **Status:** erreicht · Ticket: T001349 (gefixt)` ändern und die `#prio-a`-Markierung entfernen
  (Sektion wandert semantisch nach Priorität C — "auf Target, halten").

- [ ] **Step 3: "Aktuell A-Ziele"-Liste (Zeile ~219) nachziehen**

`G-CD01` aus der Liste `**Aktuell A-Ziele (2026-07-01):** G-SIZE04, G-CD01, G-GIT03` entfernen, sodass
nur `G-SIZE04, G-GIT03` verbleiben.

- [ ] **Step 4: "Offene Tickets"-Tabelle (Zeile ~225-238) ergänzen**

Die bestehende Zeile `| G-CD01 | T001349 | offen |` ersetzen durch:

```markdown
| G-CD01 | T001349 | **gefixt** (Root Cause: Messbefehl zeigte auf geloeschten Workflow build-website-korczewski.yml; jetzt Job-Level gh api gegen build-website.yml) |
```

- [ ] **Step 5: Guard-Test jetzt GREEN verifizieren**

```bash
bash tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "goals.md referenziert"
# expected: PASS — goals.md referenziert keine geloeschte .github/workflows/*.yml-Datei mehr
```

---

### Task 3: Spec-Drift in `openspec/specs/website-core.md` korrigieren

**Files:**
- Modify: `openspec/specs/website-core.md`

**Interfaces:**
- Consumes: nichts.
- Produces: Scenario-Prosa, die mit der bereits migrierten BATS-Implementierung in
  `tests/unit/website-ci-deploy.bats` konsistent ist.

- [ ] **Step 1: GIVEN-Zeile im Scenario "korczewski Build-Workflow enthält kubectl set image"
      (Zeile ~359) korrigieren**

Ersetze:

```markdown
#### Scenario: korczewski Build-Workflow enthält kubectl set image *(BATS)*
- **GIVEN** die Datei `.github/workflows/build-website-korczewski.yml` existiert
```

durch:

```markdown
#### Scenario: korczewski Build-Workflow enthält kubectl set image *(BATS)*
- **GIVEN** die Datei `.github/workflows/build-website.yml` existiert und definiert den Job
  `deploy-korczewski`
```

Die restlichen Zeilen des Scenarios (`WHEN`/`THEN`/`AND`) bleiben unverändert — sie beschreiben bereits
brand-neutral den Deploy-Schritt, keine weitere Änderung nötig.

- [ ] **Step 2: Konsistenz mit `tests/unit/website-ci-deploy.bats` stichprobenartig prüfen**

```bash
grep -n "build-website" tests/unit/website-ci-deploy.bats openspec/specs/website-core.md
# expected: beide Dateien referenzieren nur noch build-website.yml, keine
# Referenz mehr auf build-website-korczewski.yml
```

---

### Task 4: OpenSpec-Delta ausfüllen

**Files:**
- Modify: `openspec/changes/t001349-korczewski-deploy-rate-metric/specs/ci-cd.md`

**Interfaces:**
- Consumes: den bereits vorhandenen BATS-Test in `tests/spec/ci-cd.bats` (Task 1) als SSOT-Anker.
- Produces: ein vollständiges OpenSpec-Delta ohne offenen Platzhalter, das die neue Requirement
  spiegelt.

- [ ] **Step 1: Platzhalter-Requirement durch das echte Requirement ersetzen**

Ersetze den kompletten Inhalt der Datei durch:

```markdown
## ADDED Requirements

### Requirement: Health-Goal-Messbefehle referenzieren nur existierende Workflow-Dateien
<!-- bats: ci-cd.bats -->

The system SHALL ensure that every `--workflow <datei>.yml` reference in `.claude/lib/goals.md`
points to a `.github/workflows/*.yml` file that currently exists in the repository, so that a
workflow consolidation or rename cannot silently freeze a health-goal measurement on a dead data
stream.

#### Scenario: goals.md referenziert keine geloeschte Workflow-Datei *(BATS)*
- **GIVEN** `.claude/lib/goals.md` enthaelt einen oder mehrere `--workflow <datei>.yml`-Verweise
- **WHEN** jeder referenzierte Dateiname gegen den Inhalt von `.github/workflows/` geprueft wird
- **THEN** existiert jede referenzierte Datei; ein Verweis auf eine geloeschte Datei laesst den
  Test fehlschlagen
```

- [ ] **Step 2: Delta gegen den bestehenden Test spiegeln**

```bash
grep -n "goals.md referenziert" tests/spec/ci-cd.bats
```

Prüfe, dass der oben eingefügte Scenario-Text (GIVEN/WHEN/THEN) inhaltlich exakt beschreibt, was der
Test in `tests/spec/ci-cd.bats` bereits tut (Regex über `--workflow <datei>.yml`, Existenzprüfung
gegen `.github/workflows/`) — keine neue Assertion, nur die spiegelnde Spec-Prosa.

---

### Task 5: Finale Verifikation

**Files:**
- Modify: `website/src/data/test-inventory.json` (nur falls `freshness:regenerate` Änderungen erkennt
  — keine neue Testdatei wird in diesem Plan angelegt, daher potenziell keine Änderung)

**Interfaces:**
- Consumes: alle vorherigen Task-Änderungen.
- Produces: einen grünen CI-äquivalenten Lauf, der bestätigt, dass der Guard grün ist und keine
  Freshness-/Quality-Gates regressiert sind.

- [ ] **Step 1: Gezielte Tests für geänderte Domains**

```bash
task test:changed
```

- [ ] **Step 2: Freshness-Artefakte regenerieren**

```bash
task freshness:regenerate
```

- [ ] **Step 3: CI-äquivalentes Freshness+Quality-Gate**

```bash
task freshness:check
```

- [ ] **Step 4: OpenSpec-Validierung**

```bash
bash scripts/openspec.sh validate
```

- [ ] **Step 5: Falls Step 2 Änderungen produziert hat, mitcommitten**

```bash
git add -A
git commit -m "chore(ci): regenerate freshness artifacts for T001349 G-CD01 fix" || echo "nothing to commit"
```

---

## Self-Review

- **Spec coverage:**
  - `ci-cd` ADDED "Health-Goal-Messbefehle referenzieren nur existierende Workflow-Dateien" →
    Task 4 (Delta) + Task 1/2 (bereits vorhandener BATS-Test wird RED→GREEN verifiziert).
  - `website-core` Spec-Drift (Scenario "korczewski Build-Workflow enthält kubectl set image") →
    Task 3.
  - `goals.md` G-CD01-Messwert + Prioritäts-Wechsel A→C → Task 2.
- **Placeholder scan:** keine offenen Platzhalter-Tokens außerhalb von
  Code-Fences; der einzige offene Platzhalter der Ausgangsdatei (`specs/ci-cd.md`) wird in Task 4
  Step 1 vollständig ersetzt.
- **Konsistenz:** Der Messbefehl aus Task 2 Step 1/2 ist wortidentisch mit dem Design-Spec-Vorschlag
  und mit Task 1 Step 1 dieses Plans — kein neuer, abweichender Befehl wird eingeführt.

## Risks

- **gh-API-Rate-Limit:** Der `gh api`-Job-Level-Befehl in Task 2 Step 1 macht bis zu 15 sequentielle
  API-Calls — bei `GITHUB_TOKEN`-Auth (5000 req/h) vernachlässigbar. Der BATS-Test selbst macht
  KEINEN Netzwerk-Call (prüft nur Text in `goals.md`), bleibt also offline-tauglich und CI-stabil.
- **Messwert-Drift zwischen Planerstellung und Implementierung:** Der in der Design-Spec dokumentierte
  15/15-Snapshot ist bewusst NICHT hart in diesen Plan kopiert — Task 2 Step 1 zieht den Wert zur
  Implementierungszeit erneut, um Drift zu vermeiden.
