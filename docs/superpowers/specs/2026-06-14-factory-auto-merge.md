---
ticket_id: T000722
plan_ref: docs/superpowers/plans/2026-06-14-factory-auto-merge.md
status: active
date: 2026-06-14
---

# Spec: Factory Auto-Merge nach grüner CI (T000722)

## Kontext & Ist-Zustand

`gh pr merge --auto --squash --delete-branch` ist **bereits** in drei Stellen implementiert:
- `.claude/skills/dev-flow-execute/SKILL.md` (Zeilen 478–479, 531)
- `scripts/factory/pipeline.js` (Step 4)
- `.github/workflows/auto-enable-automerge.yml` — setzt `--auto` auf **jedem** neuen PR

Das `--auto`-Flag lässt GitHub automatisch mergen, sobald alle **required status checks** grün sind.

**Das eigentliche Problem:** Der Job `E2E PR` aus `e2e-pr.yml` ist aktuell ein required check.
Wenn Live-Prod einen Bug hat (z.B. ContactForm-i18n), schlägt E2E fehl — und blockiert
**jeden** PR, egal ob der PR selbst korrekt ist. Das ist das Henne-Ei-Problem aus T000712.

## Was dieses Feature ändert

**Einzige inhaltliche Änderung:** `E2E PR` wird aus den GitHub Branch Protection required status
checks für `main` entfernt. E2E bleibt weiterhin als informativer CI-Check sichtbar
(die Workflow-Datei `e2e-pr.yml` bleibt unverändert), blockiert aber keinen Auto-Merge mehr.

Alle anderen Teile (auto-merge Logik, squash, branch-delete) sind bereits korrekt implementiert.

## Kern-Nutzerflow

1. Factory (oder dev-flow-execute) öffnet PR und ruft `gh pr merge --auto --squash --delete-branch`
2. GitHub wartet auf: offline-tests ✓, security-scan ✓, brett-typescript ✓, vitest ✓, commit-lint ✓
3. Wenn alle 5 grün → automatischer Squash-Merge + Branch-Delete
4. E2E-Check läuft weiter (informativ) — schlägt er fehl, erscheint er im PR als gelbe Warnung,
   blockiert aber keinen Merge

## Akzeptanzkriterien

- [ ] `gh api` Aufruf entfernt `E2E PR` aus den required status checks für `main`
- [ ] PRs mit grünen offline-tests/security-scan/brett-typescript/vitest/commit-lint werden
      automatisch gemerged, auch wenn E2E rot ist
- [ ] PRs mit rotem offline-test (z.B. BATS-Fehler) werden NICHT automatisch gemerged
- [ ] E2E-Workflow (`e2e-pr.yml`) läuft weiterhin und zeigt Ergebnis im PR
- [ ] Ein Skript `scripts/gh-branch-protection.sh` dokumentiert + kann die aktuelle
      required-checks-Konfiguration idempotent anwenden (für Disaster-Recovery)
- [ ] Emergency-Stop ist möglich: Patrick kann E2E temporär wieder als required setzen
      (via GitHub Settings UI oder das Skript mit `--add-e2e`)
- [ ] `dev-flow-execute/SKILL.md` und CLAUDE.md dokumentieren das E2E-Verhalten

## Nicht-Scope

- Kein neues Merge-Zeitfenster (läuft 24/7 — bereits so)
- Kein Auto-Deploy nach Merge (separates Feature)
- Keine Änderung an `e2e-pr.yml` selbst
- Keine Änderung der anderen 5 required checks
- Kein Rollback-Mechanismus bei Post-Merge-Fehlern

## Edge Cases

- **PR mit CONFLICTING-Status:** GitHub lässt Auto-Merge bei Konflikten nicht zu — bleibt so,
  korrekt (Konflikt muss manuell gelöst werden)
- **E2E grün:** Merge passiert wie bisher, kein Unterschied für den Happy Path
- **E2E rot durch PR-eigenen Bug:** PR-Autor sieht E2E rot → manuell prüfen; Auto-Merge
  wartet nicht auf E2E, mergt wenn die 5 Pflicht-Checks grün sind — Autor muss E2E selbst
  im Blick behalten
- **Rate-Limit auf GitHub API:** Skript nutzt `gh api` mit PAT (`GH_PAT`), gleiche
  Credentials wie `auto-enable-automerge.yml`

## Fehlerfall-Behandlung

- Wenn `gh api` Aufruf fehlschlägt (z.B. kein PAT mit `admin:repo`): Fehlermeldung mit
  Hinweis auf manuelle GitHub-Settings-URL
- Wenn required check bereits entfernt: Skript ist idempotent, kein Fehler

## Erfolgsmetrik

Kein Factory-PR bleibt nach grünen Offline-Tests ungemerged wegen eines Live-Prod-E2E-Bugs.
Das Henne-Ei-Problem (Prod-Bug blockiert seinen eigenen Fix) ist gebrochen.

## Technische Constraints

- GitHub Branch Protection API: `PATCH /repos/{owner}/{repo}/branches/main/protection`
- Aktuell bekannte required checks (Stand 2026-06-14):
  `offline-tests`, `security-scan`, `brett-typescript`, `vitest`, `commit-lint`, `E2E PR`
- Nach diesem Feature: `E2E PR` nicht mehr in der Liste
- `GH_PAT` Secret muss `repo` + `admin:repo` Scope haben (gleich wie für auto-enable-automerge)
- Repo: `Paddione/Bachelorprojekt`

## Betroffene Dateien

| Datei | Art der Änderung |
|-------|-----------------|
| `scripts/gh-branch-protection.sh` | NEU — dokumentiert + setzt required checks via gh API |
| `dev-flow-execute/SKILL.md` | Kommentar-Update: E2E nicht required |
| `CLAUDE.md` | Gotcha-Update: E2E informativ, nicht blocking |
| `.github/workflows/auto-enable-automerge.yml` | Ggf. Kommentar-Update |
