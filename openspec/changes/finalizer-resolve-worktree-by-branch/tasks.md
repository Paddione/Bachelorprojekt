---
title: "finalizer-resolve-worktree-by-branch — Implementation Plan"
ticket_id: T012240
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# finalizer-resolve-worktree-by-branch — Implementation Plan

_Ticket: T012240_

## File Structure

```
tests/spec/agent-skills/finalize-worktree-branch-validation.bats   new     (bereits im RED-Commit)
scripts/devflow-post-merge-finalize.sh                             modify  407 L, S1-Limit .sh = 800, Budget 393
openspec/specs/agent-skills.md                                     modify  (Archiv-Merge des Deltas, durch openspec archive)
```

## Partials

| # | Rolle | target_files |
|---|-------|--------------|
| p1 | fix + tests | `scripts/devflow-post-merge-finalize.sh`, `tests/spec/agent-skills/finalize-worktree-branch-validation.bats` |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Test liegt bereits im Stage-Commit dieses
      Branches. Er extrahiert die Auflösungssektion per awk-Bereichsmuster aus
      `scripts/devflow-post-merge-finalize.sh` und führt sie gegen ein Sandbox-Git-Repo
      aus; geprüft wird, welchen Branch der aufgelöste Worktree hält.
      Vor der Implementierung ausführen — `expected: FAIL` für Test 2
      („Slug-Pfad mit fremdem Branch wird NICHT gewaehlt"); Test 1 (Positiv-Anker) und
      Test 3 (Fallback) sind bereits grün und müssen es bleiben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-worktree-branch-validation.bats
# expected: FAIL — "not ok 2 resolve: Slug-Pfad mit fremdem Branch wird NICHT gewaehlt"
```

## Task 1 — Branch-exakte Auflösung zur ersten Wahl machen

- [ ] In `scripts/devflow-post-merge-finalize.sh` die Worktree-Auflösung umstellen.
      Die Sektion beginnt bei `WORKTREE=""` und endet bei der Fallback-Zeile
      `[[ -z "$WORKTREE" ]] && WORKTREE="$REPO_DIR/.worktrees/$SLUG"`.

      Neue Reihenfolge:
      1. Branch-exakt über `git worktree list --porcelain` — der Worktree, dessen
         Eintrag `branch refs/heads/$BRANCH` trägt.
      2. Nur wenn (1) leer bleibt: der Slug-Kandidat `$REPO_DIR/.worktrees/$SLUG`,
         und auch dann nur, wenn er existiert **und** `$BRANCH` ausgecheckt hat
         (`git -C "$_wt_candidate" rev-parse --abbrev-ref HEAD` = `$BRANCH`).
      3. Bleibt beides leer: unverändert `$REPO_DIR/.worktrees/$SLUG` als Fallback,
         damit Schritt 10 seine bestehende „bereits entfernt"-Meldung behält.

      Der bestehende awk-Ausdruck für (1) wird übernommen, nicht neu geschrieben.
      Den Skript-Kommentar über der Sektion an die neue Reihenfolge angleichen —
      er beschreibt aktuell den Slug-Kandidaten als Rückfall, während der Code ihn
      zuerst nimmt.

- [ ] Die awk-Extraktion im Test hängt an den beiden Ankerzeilen. Bleiben Anfang
      (`WORKTREE=""`) und Ende (`[[ -z "$WORKTREE" ]] && WORKTREE=`) der Sektion
      wörtlich erhalten, greift sie weiter. Wird eine der beiden Zeilen umformuliert,
      im selben Task das Bereichsmuster in
      `tests/spec/agent-skills/finalize-worktree-branch-validation.bats`
      (Funktion `resolve_worktree`) mitziehen — der Test bricht sonst mit
      „Auflösungssektion nicht gefunden" ab statt eine Aussage zu treffen.

- [ ] GREEN-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-worktree-branch-validation.bats
# expected: 3/3 ok
```

- [ ] Regression der bestehenden Finalizer-Guards — die Source-Grep-Aussagen in
      `post-merge-finalize-guards.bats` referenzieren die Auflösung (T008014-Block)
      und dürfen durch die Umstellung nicht brechen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills/
```

## Task 2 — Abschließende Verifikation

- [ ] Vollständiger Verify-Lauf:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

