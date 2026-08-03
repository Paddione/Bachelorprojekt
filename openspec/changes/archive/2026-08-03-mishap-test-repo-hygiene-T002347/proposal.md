# Mishap-Bundle: test, repo/.gitattributes, skills/repo-hygiene — Proposal

## Kontext

Dieses Bundle fasst 3 Mishaps zusammen, die im Rahmen von repo-hygiene-Arbeiten an PR #3395 am 2026-07-27 aufgetreten sind. Alle drei haben eine gemeinsame Charakteristik: Sie betreffen die Test-Infrastruktur und GitOps-Runbooks, sind klein und klar abgrenzbar.

## Mishap 1: software-factory.bats schreibt ins echte openspec/

**Problem:** `tests/spec/software-factory.bats:3436` führt `mkdir -p openspec/changes/x && touch openspec/changes/x/tasks.md` direkt im Worktree aus, statt in einer temporären Umgebung. Folgen:
- Bei SIGTERM/Timeout bleibt `openspec/changes/x/tasks.md` als ungetrackte Datei liegen.
- Parallele Tests, die den openspec-Baum validieren (z.B. `openspec-workflow.bats`), sehen den unvollständigen Change-Ordner und schlagen fehl.

**Fix:** Die mkdir-Operation in ein `$BATS_TEST_TMPDIR`-Repo verlegen, analog zur Fixture-Technik in `tests/unit/check-commit-vs-diff.bats` und `tests/unit/preflight-pr-scope.bats`.

## Mishap 2: .gitattributes merge=ours erzeugt GitHub-only Phantom-Konflikte

**Problem:** `docs/generated/**`, `website/src/data/openspec-status.json` und ~15 weitere generierte Artefakte sind in `.gitattributes` mit `merge=ours` markiert. Lokal löst git dies über den Custom-Merge-Driver still auf. GitHub führt serverseitig KEINE Custom-Merge-Driver aus und meldet stattdessen merge conflicts.

**Fix (3-stufig):**
1. **Kurzfristig:** Die Falle in `docs/superpowers/references/gotchas-footguns.md` dokumentieren.
2. **Mittelfristig:** Den `gh pr update-branch`-REST-Fallback in die repo-hygiene Ops-Dokumentation aufnehmen, damit Entwickler nach einem Merge von `main` gezielt regenerieren können.
3. **Langfristig:** Die generierten Artefakte aus dem PR-Diff heraushalten (`.gitattributes` `diff=generated` oder CI-regeneriert statt committed).

## Mishap 3: Installierte gh-CLI kennt `gh pr update-branch` nicht

**Problem:** Die installierte `gh`-CLI-Version unterstützt kein `update-branch`-Subkommando. Die repo-hygiene-ops-Dokumentation nennt nur den `gh pr update-branch`-Weg, nicht den REST-API-Fallback.

**Fix:** Den REST-Fallback in `.agents/skills/references/repo-hygiene-ops.md` §3 aufnehmen. Alternativ `gh-axi` um ein `pr update-branch`-Kommando erweitern.
