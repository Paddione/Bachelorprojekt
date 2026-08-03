---
title: "mishap-t001973 — Implementation Plan"
ticket_id: T001973
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001973 — Implementation Plan

_Ticket: T001973_

**Mishap:** `git pull --rebase` im main-Checkout wurde blockiert, weil während
der stash/rebase-Sequenz ein Git-Hook generierte Artefakte
(`website/src/data/openspec-status.json`, `website/src/lib/goals-data.generated.json`)
neu schrieb — der Working Tree war nach `git stash` sofort wieder dirty und
`stash pop` kollidierte ("would be overwritten").

**Root Cause (identifiziert):** Zwei Hooks unter `core.hooksPath=.githooks`
führen `task freshness:regenerate` **ohne jeden Guard** aus:

- `.githooks/post-merge` — regeneriert unconditionally nach jedem Merge/Pull
  (Zeile `task -d "$repo_root" freshness:regenerate`), auch wenn gerade ein
  Rebase/Autostash läuft.
- `.githooks/pre-commit` — der Freshness-Block (T000581, `_FRESHNESS_FILES`)
  regeneriert und auto-staged vor jedem Commit, ebenfalls ohne Guard.

**Fix:** Gemeinsamer Suppress-Guard in beiden Hooks: Regeneration skippen,
wenn (a) `$GIT_DIR/rebase-merge` oder (b) `$GIT_DIR/rebase-apply` existiert
(Rebase in progress), (c) `$GIT_DIR/MERGE_HEAD` existiert (Merge in
progress), oder (d) das env-Opt-out `FRESHNESS_HOOK_DISABLED=1` gesetzt ist
(analog zu `SCS_HOOK_DISABLED` in `.githooks/post-commit-index`).
`GIT_DIR` via `git rev-parse --absolute-git-dir` auflösen (worktree-sicher).

## File Structure

```
.githooks/post-merge                    # geändert: Suppress-Guard vor freshness:regenerate
.githooks/pre-commit                    # geändert: gleicher Guard vor dem Freshness-Block (T000581)
tests/spec/pre-commit-freshness.bats    # geändert: neue @test-Einträge für den Rebase/Merge-Guard
```

Kein neues BATS-File: die Hook-Freshness-Tests leben bereits in
`tests/spec/pre-commit-freshness.bats` (BATS-Konvention: ein File pro Spec,
keine neuen ticket-nummerierten Files).

## Tasks

- [ ] **Task 1 — Failing-Tests schreiben (RED).**
      Datei: `tests/spec/pre-commit-freshness.bats`. Neue `@test`-Einträge
      anhängen, die das Fehlverhalten reproduzieren. Setup pro Test: temporäres
      Git-Repo unter `$BATS_TEST_TMPDIR` initialisieren, einen `task`-**Stub**
      vorn in `PATH` legen, der bei Aufruf mit `freshness:regenerate` eine
      Markerdatei (`$BATS_TEST_TMPDIR/regen-ran`) schreibt, dann den echten
      Hook aus `$REPO_ROOT/.githooks/` im Temp-Repo aufrufen:
      1. `post-merge suppressed during rebase`: Dummy-Verzeichnis
         `.git/rebase-merge` im Temp-Repo anlegen (plus `node_modules/`-Dummy,
         damit der Hook den Regen-Zweig erreicht), `.githooks/post-merge`
         ausführen → assert: Markerdatei existiert NICHT (keine Regeneration).
      2. `post-merge suppressed during am-rebase`: dito mit `.git/rebase-apply`.
      3. `post-merge suppressed via env opt-out`: `FRESHNESS_HOOK_DISABLED=1`
         setzen, ohne Dummy-Verzeichnis → assert: Markerdatei existiert nicht.
      4. `pre-commit freshness block suppressed during rebase`:
         `.git/rebase-merge`-Dummy anlegen, `.githooks/pre-commit` ausführen
         (git-crypt-/agent-lock-Teile laufen fail-open im Temp-Repo) →
         assert: Markerdatei existiert nicht.
      5. `post-merge still regenerates normally`: Kontrolltest ohne Dummy und
         ohne env-Var → assert: Markerdatei EXISTIERT (Guard darf den
         Normalfall nicht brechen; dieser Test ist schon auf main grün).

- [ ] **Task 2 — RED-Lauf verifizieren.**
      Runner gegen die in Task 1 erweiterte Testdatei:

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats
      ```

      expected: FAIL — die neuen Guard-Tests (1–4) schlagen fehl, weil die
      Hooks noch unconditionally regenerieren (Markerdatei wird trotz
      laufendem Rebase geschrieben). Kontrolltest (5) ist grün.

- [ ] **Task 3 — Guard in `.githooks/post-merge` einbauen (GREEN Teil 1).**
      Datei: `.githooks/post-merge`. Direkt nach dem `repo_root`-Resolve einen
      Guard-Block einfügen (vor dem `freshness:regenerate`-Aufruf):

      ```bash
      # Suppress regen while a rebase/merge/stash sequence is in flight [T001973]
      _gd="$(git rev-parse --absolute-git-dir 2>/dev/null || true)"
      if [ "${FRESHNESS_HOOK_DISABLED:-0}" = "1" ] \
         || [ -d "$_gd/rebase-merge" ] || [ -d "$_gd/rebase-apply" ] \
         || [ -f "$_gd/MERGE_HEAD" ]; then
        exit 0
      fi
      ```

      (`exit 0` ist hier korrekt: der gesamte Hook-Body besteht aus
      Regen-/Sync-Schritten — loc-budget-Restore und codebase-memory-Reindex
      sind ohne Regeneration ebenfalls unnötig bzw. unerwünscht mid-rebase.)

- [ ] **Task 4 — Guard in `.githooks/pre-commit` einbauen (GREEN Teil 2).**
      Datei: `.githooks/pre-commit`. Denselben Guard als Bedingung um den
      Freshness-Block (T000581, Zeilen mit `_FRESHNESS_FILES` +
      `task freshness:regenerate`) legen — NICHT `exit 0` für den ganzen Hook,
      denn die Secret-/agent-lock-Checks davor müssen bei echten Commits
      während eines Rebase (z. B. `git rebase --continue`) weiter laufen. Nur
      der Regen-/Auto-Stage-Teil wird geskippt. Kommentar mit `[T001973]` und
      Hinweis auf das env-Opt-out `FRESHNESS_HOOK_DISABLED=1` ergänzen.

- [ ] **Task 5 — GREEN-Lauf.**
      Erneut ausführen:

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats
      ```

      Erwartung: alle Tests grün — inkl. der bestehenden T001388-Tests
      (Drift-Guard/Auto-Stage), die der Guard nicht verändern darf.

- [ ] **Task 6 — Final Verification.**
      Die drei Pflicht-Gates ausführen (Test-Inventory wird durch die neuen
      `@test`-Einträge neu generiert und muss mitcommittet werden):

      ```bash
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```
