---
title: "mishap-incident-rollup-2026-08-15-T008015 — Mishap-Bundle"
ticket_id: T008015
---

## ADDED Requirements

### Requirement: Deploy-Detection analysierte Archiv-Commit statt Feature-Merge (false negative)

The rollup bundle SHALL address the mishap "Deploy-Detection analysierte Archiv-Commit statt Feature-Merge (false negative)" (suspicious, scripts/devflow-post-merge-deploy.sh).

#### Scenario: Deploy-Detection analysierte Archiv-Commit statt Feature-Merge (false negative) is covered by the bundle

- **GIVEN** a batch entry "Deploy-Detection analysierte Archiv-Commit statt Feature-Merge (false negative)" (suspicious, scripts/devflow-post-merge-deploy.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: dev.mentolder.de liefert 404 für /sdlc/design-system (Dev-Stack zeigt SDLC-Build nicht)

The rollup bundle SHALL address the mishap "dev.mentolder.de liefert 404 für /sdlc/design-system (Dev-Stack zeigt SDLC-Build nicht)" (suspicious, dev-stack).

#### Scenario: dev.mentolder.de liefert 404 für /sdlc/design-system (Dev-Stack zeigt SDLC-Build nicht) is covered by the bundle

- **GIVEN** a batch entry "dev.mentolder.de liefert 404 für /sdlc/design-system (Dev-Stack zeigt SDLC-Build nicht)" (suspicious, dev-stack) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: plan-intel.sh parst keine annotierten target_files-Zellen (Präfixe/Braces werden Pfade)

The rollup bundle SHALL address the mishap "plan-intel.sh parst keine annotierten target_files-Zellen (Präfixe/Braces werden Pfade)" (drift, scripts/plan-intel.sh).

#### Scenario: plan-intel.sh parst keine annotierten target_files-Zellen (Präfixe/Braces werden Pfade) is covered by the bundle

- **GIVEN** a batch entry "plan-intel.sh parst keine annotierten target_files-Zellen (Präfixe/Braces werden Pfade)" (drift, scripts/plan-intel.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: post-commit-embed-Hook hing 2× (commit + amend), Port 15432 belegt — Wiederholung Mishap 7

The rollup bundle SHALL address the mishap "post-commit-embed-Hook hing 2× (commit + amend), Port 15432 belegt — Wiederholung Mishap 7" (degraded, .githooks/post-commit-embed).

#### Scenario: post-commit-embed-Hook hing 2× (commit + amend), Port 15432 belegt — Wiederholung Mishap 7 is covered by the bundle

- **GIVEN** a batch entry "post-commit-embed-Hook hing 2× (commit + amend), Port 15432 belegt — Wiederholung Mishap 7" (degraded, .githooks/post-commit-embed) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: pre-push-Gate (task quality:check) ueberschritt 2× das Bash-Timeout — Push wirkte wie Hang

The rollup bundle SHALL address the mishap "pre-push-Gate (task quality:check) ueberschritt 2× das Bash-Timeout — Push wirkte wie Hang" (suspicious, repo/git-workflow).

#### Scenario: pre-push-Gate (task quality:check) ueberschritt 2× das Bash-Timeout — Push wirkte wie Hang is covered by the bundle

- **GIVEN** a batch entry "pre-push-Gate (task quality:check) ueberschritt 2× das Bash-Timeout — Push wirkte wie Hang" (suspicious, repo/git-workflow) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: openspec-status.json wurde waehrend des Laufs extern als '{}' gestaged (3952→1 Zeilen)

The rollup bundle SHALL address the mishap "openspec-status.json wurde waehrend des Laufs extern als '{}' gestaged (3952→1 Zeilen)" (drift, repo/chore/plan-archive).

#### Scenario: openspec-status.json wurde waehrend des Laufs extern als '{}' gestaged (3952→1 Zeilen) is covered by the bundle

- **GIVEN** a batch entry "openspec-status.json wurde waehrend des Laufs extern als '{}' gestaged (3952→1 Zeilen)" (drift, repo/chore/plan-archive) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Hauptcheckout liegt auf fix/e2e-test-suite-resilience-T008338 statt main — Commit+Push ohne PR, Ticket triage ohne Lock

The rollup bundle SHALL address the mishap "Hauptcheckout liegt auf fix/e2e-test-suite-resilience-T008338 statt main — Commit+Push ohne PR, Ticket triage ohne Lock" (suspicious, git/main-checkout).

#### Scenario: Hauptcheckout liegt auf fix/e2e-test-suite-resilience-T008338 statt main — Commit+Push ohne PR, Ticket triage ohne Lock is covered by the bundle

- **GIVEN** a batch entry "Hauptcheckout liegt auf fix/e2e-test-suite-resilience-T008338 statt main — Commit+Push ohne PR, Ticket triage ohne Lock" (suspicious, git/main-checkout) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Ungetickter funktionaler Patch scripts/llm/bench-guff.sh untracked im Hauptcheckout

The rollup bundle SHALL address the mishap "Ungetickter funktionaler Patch scripts/llm/bench-guff.sh untracked im Hauptcheckout" (suspicious, repo/untracked).

#### Scenario: Ungetickter funktionaler Patch scripts/llm/bench-guff.sh untracked im Hauptcheckout is covered by the bundle

- **GIVEN** a batch entry "Ungetickter funktionaler Patch scripts/llm/bench-guff.sh untracked im Hauptcheckout" (suspicious, repo/untracked) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Streu-Artefakt-Verzeichnis website/ mit Prod-Credentials im Hauptcheckout

The rollup bundle SHALL address the mishap "Streu-Artefakt-Verzeichnis website/ mit Prod-Credentials im Hauptcheckout" (suspicious, repo/untracked).

#### Scenario: Streu-Artefakt-Verzeichnis website/ mit Prod-Credentials im Hauptcheckout is covered by the bundle

- **GIVEN** a batch entry "Streu-Artefakt-Verzeichnis website/ mit Prod-Credentials im Hauptcheckout" (suspicious, repo/untracked) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: chore/pk-device-autostart-T006842: download-quant.ps1 nie in main gemergt (T002431-Fall)

The rollup bundle SHALL address the mishap "chore/pk-device-autostart-T006842: download-quant.ps1 nie in main gemergt (T002431-Fall)" (suspicious, branch-reaper).

#### Scenario: chore/pk-device-autostart-T006842: download-quant.ps1 nie in main gemergt (T002431-Fall) is covered by the bundle

- **GIVEN** a batch entry "chore/pk-device-autostart-T006842: download-quant.ps1 nie in main gemergt (T002431-Fall)" (suspicious, branch-reaper) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
