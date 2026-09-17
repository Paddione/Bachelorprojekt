---
id: p1
title: "P1 — finalize.sh korrigieren + Guards auslagern (impl, disjunkt D1)"
ticket: T900096
change: devflow-post-merge-guards
ssot:
  - openspec/specs/agent-skills.md
  - openspec/changes/devflow-post-merge-guards/specs/agent-skills.md
target_files:
  - scripts/devflow-post-merge-finalize.sh
  - scripts/lib/finalize-step-guards.sh
non_goals:
  - "KEIN Test-Content (Tests = p2/p3)"
  - "Kein Touch an scripts/branch-reaper.sh (uebernommener Reaper-Guard bleibt)"
---

# P1 — finalize.sh korrigieren + Step-Guards auslagern

Kontext: `fix/devflow-post-merge-guards-T900096` enthaelt einen fremden
Partial-Fix (Reaper-Ancestor-Guard korrekt; Befund 2 via `git checkout -- .` +
`git clean -fd` destruktiv). Dieses Partial ersetzt den Discard durch
fail-closed Guards (Spec: `openspec/changes/devflow-post-merge-guards/specs/agent-skills.md`).

## P1.1 — Fremd-Hunk (Discard) ersatzlos streichen

Ziel: Schritt 8 verwirft keine fremden uncommitteten Aenderungen mehr.
Stellen (`scripts/devflow-post-merge-finalize.sh`, Schritt-8-Subshell nach
Anker `git checkout -B "$ARCHIVE_BRANCH" origin/main`): Kommentar-Anker
`# [T900096] Fremde uncommittete Aenderungen verwerfen` plus Folgezeile
`git checkout -- . 2>/dev/null || true; git clean -fd 2>/dev/null || true`
beide ersatzlos streichen (kein Stash — fail-closed kommt in P1.3).
Der uebernommene Reaper-Ancestor-Guard (`merge-base --is-ancestor`) bleibt
unangetastet.
Verify:
```bash
grep -n "checkout -- \.\|git clean -fd" scripts/devflow-post-merge-finalize.sh && exit 1 || echo OK-discarded-removed
```

## P1.2 — NEU `scripts/lib/finalize-step-guards.sh`

Ziel: Wiederverwendbare Guard-Helfer, < 60 Zeilen, `set -u`-kompatibel, kein
`cd` (cwd-Regel T006367 — Repo als Parameter, intern `git -C "$repo" ...`),
Muster nach `scripts/lib/archive-staged-scope.sh`:
- `finalize_assert_clean_tree <repo>` — `local repo="${1:?...}"`, dann
`git -C "$repo" status --porcelain` (fasst tracked-modifiziert UND untracked);
bei nicht-leerem Output FATAL-Zeile (`uncommittete Aenderungen`) + Pfadliste
nach stderr, `exit 1`. Spec-Szenario "Dirty main checkout aborts the archive".
- `finalize_branch_fully_merged <repo> <branch>` — `fetch origin main`
(best-effort, Fehlschlag tolerieren), dann
`git -C "$repo" merge-base --is-ancestor "$branch" origin/main`; rc=0 =
voll gemergt (Return 0), sonst Return 1 + `log --oneline origin/main..branch`
als Meldungsmaterial fuer die `mark_warn`-Zeile des Aufrufers. KEIN exit hier
(Aufrufer entscheidet: Skip statt Delete, kein Abbruch). Spec-Szenarien
"Branch with unmerged commits is kept" / "Fully merged branch is deleted".
Verify:
```bash
bash -n scripts/lib/finalize-step-guards.sh
wc -l scripts/lib/finalize-step-guards.sh  # expected: < 60
```

## P1.3 — Guard-Call-Sites in finalize.sh

Ziel: Dirty-Guard (fail-closed) + Ungemergt-Guard (warn+skip) verdrahten.
Stellen (`scripts/devflow-post-merge-finalize.sh`):
1. source-Zeile direkt unter Anker
`source "$_FINALIZE_HERE/lib/archive-staged-scope.sh"` (gleiches
`$_FINALIZE_HERE`- + `shellcheck source=`-Muster):
`source "$_FINALIZE_HERE/lib/finalize-step-guards.sh"`.
2. Dirty-Guard VOR Anker `git checkout -B "$ARCHIVE_BRANCH" origin/main`
(Order-Swap-Kommentar `# Order-Swap (Code-Review PR #4586)` liegt darueber):
`finalize_assert_clean_tree "$ARCHIVE_DIR"` — abortiert mit FATAL + Pfadliste
vor dem Branch-Wechsel. `archive_stage_commit`/`archive_assert_staged_scope`
bleibt zweites Netz (unangetastet).
3. Ungemergt-Guard VOR Anker `git -C "$REPO_DIR" branch -D "$BRANCH"` (im
`elif`-Zweig nach dem T006791-Restore-Skip, Anker `ist im Haupt-Checkout
ausgecheckt`): `if finalize_branch_fully_merged "$REPO_DIR" "$BRANCH"; then`
<bestehendes Delete> `else mark_warn "…ungemergte Commits…" + mark_skip …; fi`.
Kein Delete, kein exit bei Treffern (`mark_warn`/`mark_skip` existieren,
Anker `mark_skip() { echo "[skip] $1"`).
Verify:
```bash
bash -n scripts/devflow-post-merge-finalize.sh
grep -n "finalize-step-guards.sh\|finalize_assert_clean_tree\|finalize_branch_fully_merged" scripts/devflow-post-merge-finalize.sh
```

## P1.4 — S1-Neutralitaet: finalize.sh ≤ 811 Zeilen (VERPFLICHTEND)

Ziel: `task test:code-quality`/`quality:check` blockt Verschlechterung vs.
Baseline (`docs/code-quality/baseline.json`, `S1:scripts/devflow-post-merge-finalize.sh`,
Main-Stand 811, aktuell 813). Rechnung: P1.1 −2 + P1.3-Call-Sites ca. +4–8 =
ueber Budget → ZUSAETZLICH einen bestehenden Block als Funktion nach
`scripts/lib/finalize-step-guards.sh` auslagern, bis `wc -l` ≤ 811.
Kandidat (einer genuegt): Schritt-10-Worktree-Aufloesung (Anker
`_wt_holding_branch=`, `worktree list --porcelain`-awk-Block inkl.
`[T012256/B2]`-Kommentar) ODER `_restore_prev_branch()` (Anker
`_restore_prev_branch() {` + T006791-Kommentarblock). Regel: Parameter statt
`cd` (T006367), Verhalten identisch (gleiche `mark_*`-Aufrufe).
Verify (im Task ausfuehren): `wc -l scripts/devflow-post-merge-finalize.sh`
(expected ≤ 811) + `task quality:check | tail -5`.
