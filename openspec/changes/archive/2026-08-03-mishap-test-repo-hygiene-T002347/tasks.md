# Mishap-Bundle: test, repo/.gitattributes, skills/repo-hygiene — Tasks

## Task 1: software-factory.bats — openspec mkdir in BATS_TEST_TMPDIR verlegen

**Datei:** `tests/spec/software-factory.bats`
**Zelle:** `@test "T001444: stage-plan auto-emits scout/design/plan done"` (Z. 3436)

**Änderung:**
1. `mkdir -p openspec/changes/x && touch openspec/changes/x/tasks.md` ersetzen durch TMPDIR-basiertes Repo:
   ```bash
   TMP_REPO="$BATS_TEST_TMPDIR/repo"
   mkdir -p "$TMP_REPO" && cd "$TMP_REPO"
   git init -q && git config user.email t@t && git config user.name t
   mkdir -p openspec/changes/x && touch openspec/changes/x/tasks.md
   git add openspec/
   run bash ../../scripts/ticket.sh stage-plan ...
   ```
2. `rm -rf openspec/changes/x` entfernen (unnötig, da tmpdir automatisch aufgeräumt wird).
3. `cd "$BATS_TEST_TMPDIR"` vor Test-Ende nicht vergessen.

**Verifikation:** `bats --filter "T001444" tests/spec/software-factory.bats` läuft grün.

---

## Task 2: gotchas-footguns.md — Phantom-Konflikt-Dokumentation

**Datei:** `docs/superpowers/references/gotchas-footguns.md`

**Änderung:**
- Neuen Eintrag unter "Git & GitHub" einfügen:
  - Symptom: `mergeStateStatus=DIRTY` bei lokal sauberem Merge-Tree
  - Ursache: GitHub ignoriert `merge=ours`-Custom-Driver
  - Fix-Script: REST-API `update-branch` mit expected_head_sha

**Referenz:** Siehe `design.md` §Mishap 2 für den genauen Wortlaut.

---

## Task 3: repo-hygiene-ops.md — gh pr update-branch REST-Fallback

**Datei:** `.agents/skills/references/repo-hygiene-ops.md` §3

**Änderung:**
- Nach der `gh pr merge`-Dokumentation einen Subabschnitt "PR-Branch aktualisieren" einfügen.
- Zwei Wege dokumentieren:
  1. `gh pr update-branch <n>` — falls gh-Version es unterstützt
  2. REST-API-Fallback — falls nicht
- Hinweis auf SHA-Ermittlung via `git rev-parse HEAD`.

**Verifikation:** Manuell: `grep -q update-branch .agents/skills/references/repo-hygiene-ops.md`

---

## Reihenfolge

1. Task 1 (test-Flakiness beheben)
2. Task 2 (Phantom-Konflikt dokumentieren — schnellster Fix)
3. Task 3 (Runbook-Lücke schließen)
