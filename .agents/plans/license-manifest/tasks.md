---
title: "license-manifest — Reuse-Policy und Dritt-Lizenz-Manifest"
ticket_id: T901032
domains: [docs, legal, ci]
status: active
---

# license-manifest — Implementation Plan

## File Structure

- `docs/legal/reuse-policy.md`: neu, Wiederverwendungs-Policy.
- `docs/legal/third-party-manifest.json`: neu, maschinenlesbares Manifest.
- `docs/legal/NOTICE.md`: neu, menschliche Attribution.
- `scripts/legal/license-check.sh`: neu, fail-closed Checker.
- `.github/workflows/license-policy.yml`: neu, CI-Workflow.
- `docs/legal/asset-licensing.md`: neu, Asset-Lizenzierung getrennt von Code.
- `docs/legal/release-attribution.md`: neu, Release-Checkliste.
- `tests/spec/license-manifest.bats`: neu, Spec-Guards.

## Zweck

Verbindliche permissive Reuse-Policy mit Dritt-Lizenz-Manifest: exakt gepinnte
Komponentenversionen, gesammelte LICENSE/NOTICE-Texte, transitive
Lizenz-Inventur, Release-Attribution und CI-Policy als Code. Asset-Lizenzierung
bleibt getrennt von Code-Lizenzierung. Kein AGPL-Embed ohne separaten Beschluss.

## Scope and evidence

Work only in the worktree on `chore/license-manifest-T901032`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.
Decisions aus Brainstorming 2026-10-09: Policy-Fakten aus T901032 bindend
(MIT eigener Code, Apache-2.0 mit Notices ok, kein AGPL-Embed ohne Beschluss,
Design-Repo-Code MIT mit Per-Asset-Rechten, Start privat und Quarantäne);
CI-Policy ist Teil dieses Tickets; Manifest JSON plus NOTICE-Abdeckung;
keine bestehenden Dateien ändern.
Prior-Art: keine Lizenz-ADR, keine Lizenz-Guards im Repo.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-reuse-policy.md | Policy-Dokument | `docs/legal/reuse-policy.md` |  |
| p2 | tasks.d/p2-manifest-notice.md | Manifest und Notices | `docs/legal/third-party-manifest.json`, `docs/legal/NOTICE.md` | p1 |
| p3 | tasks.d/p3-ci-enforcement.md | CI-Enforcement | `scripts/legal/license-check.sh`, `.github/workflows/license-policy.yml` | p2 |
| p4 | tasks.d/p4-assets-release.md | Assets und Release | `docs/legal/asset-licensing.md`, `docs/legal/release-attribution.md` | p1 |
| p5 | tasks.d/p5-tests.md | tests | `tests/spec/license-manifest.bats` | p1, p2, p3, p4 |

## Tasks

- [x] **0. Rotphase: Failing-Test-Step zuerst.** Lege die BATS-Guards aus p5 als
  Skelett an und lasse sie gegen den unimplementierten Stand laufen,
  expected: FAIL. Befehl: `bats tests/spec/license-manifest.bats`.
  Erst danach beginnt die Implementierung der Partials p1 bis p4.
- [x] **1. Partial p1 ausführen** (`tasks.d/p1-reuse-policy.md`): Policy-Dokument
  schreiben. Verify pro Partial-Plan.
- [x] **2. Partial p2 ausführen** (`tasks.d/p2-manifest-notice.md`): Manifest und
  NOTICE schreiben. Verify pro Partial-Plan.
- [x] **3. Partial p3 ausführen** (`tasks.d/p3-ci-enforcement.md`): Checker und
  Workflow schreiben. Verify pro Partial-Plan.
- [ ] **4. Partial p4 ausführen** (`tasks.d/p4-assets-release.md`): Asset- und
  Release-Dokumente schreiben. Verify pro Partial-Plan.
- [ ] **5. Partial p5 ausführen** (`tasks.d/p5-tests.md`): BATS-Guards
  vervollständigen, alle grün.
- [ ] **6. Finaler Verify-Task.** Alle Partials gemergt, keine Baseline-Einträge
  hinzugefügt, keine Brand-Domain-Literale in Code-Snippets:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
