---
title: "Plan: CI Auto-Skip bei Docs-only-Changes"
ticket_id: eea90c15-7f33-4e61-8249-a05269e16136
domains: [ci]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: batch-2026-06-10
parent_feature: null
depends_on_plans: []
---

# Plan: CI Auto-Skip bei Docs-only-Changes

**Ticket:** eea90c15
**Branch:** feature/eea90c15-ci-docs-skip
**Datum:** 2026-06-10
**Status:** staged

---

## Ziel

Die `paths-ignore`-Liste in `.github/workflows/ci.yml` um `**/CLAUDE.md` erweitern, damit PRs die ausschlielich CLAUDE.md-Dateien (in beliebiger Tiefe) aendern, die CI-Pipeline nicht triggern.

---

## Architektur

### Neue Dateien

Keine.

### Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `.github/workflows/ci.yml` | `**/CLAUDE.md` zu `paths-ignore` in `pull_request`-Trigger (nach Zeile 8) und `push`-Trigger (nach Zeile 19) hinzufuegen |

### Nicht geaendert

- `.github/workflows/build-website.yml` — hat eigenen `paths`-Filter (`website/**`)
- `.github/workflows/build-brett.yml` — hat eigenen `paths`-Filter (`brett/**`)
- `.github/workflows/e2e-pr.yml` — hat eigenen `paths`-Filter (`website/**`, `tests/e2e/**`)
- `.github/workflows/build-website-korczewski.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/ai-review.yml`
- `.github/workflows/build-docs.yml`
- Alle anderen Workflow-Dateien

---

## Tech-Stack

GitHub Actions YAML — `paths-ignore` Filter auf Workflow-Triggern.

---

## Tasks

- [ ] **T1 — paths-ignore in ci.yml erweitern:** In `.github/workflows/ci.yml` die Zeile `- '**/CLAUDE.md'` nach `- '*.md'` im `pull_request.paths-ignore`-Block (nach Zeile 8) und im `push.paths-ignore`-Block (nach Zeile 19) einfuegen. Beide Trigger muessen identische `paths-ignore`-Listen haben. Die resultierende Liste in beiden Triggern: `docs/**`, `*.md`, `**/CLAUDE.md`.
- [ ] **T2 — YAML-Syntax validieren:** `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` ausfuehren. Erwartete Ausgabe: kein Fehler. Alternativ `task workspace:validate` wenn verfuegbar.
- [ ] **T3 — Commit und PR erstellen:** Branch `feature/eea90c15-ci-docs-skip` committen und PR gegen `main` eroeffnen. Titel: `ci: expand docs-only paths-ignore to include **/CLAUDE.md`. Da `ci.yml` selbst geaendert wird, laeuft die CI fuer diesen PR normal — das ist korrekt und erwuenscht.

---

## Verifikation

### Lokal

- YAML-Syntax-Check: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` muss fehlerfrei durchlaufen
- `head -22 .github/workflows/ci.yml` zeigt beide `paths-ignore`-Bloecke mit jeweils 3 Eintraegen

### CI

- CI muss auf dem PR selbst gruun laufen (da `ci.yml` geaendert wird, greift `paths-ignore` nicht fuer diesen PR)
- Nach Merge: PR mit ausschlielicher `website/CLAUDE.md`-Aenderung eroeffnen — CI-Workflow darf nicht getriggert werden

### Akzeptanzkriterien-Checkliste

- [ ] `paths-ignore` im `pull_request`-Trigger enthaelt `**/CLAUDE.md`
- [ ] `paths-ignore` im `push`-Trigger enthaelt `**/CLAUDE.md`
- [ ] Keine anderen Workflows veraendert
- [ ] YAML syntaktisch valide
- [ ] CI auf dem Implementierungs-PR ist gruun
