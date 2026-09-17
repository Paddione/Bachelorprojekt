# p3 — finalize-Guard-Tests für Schritt 8/10 (T900096)

- id: p3 · depends_on: [p1]
- target_file (D1, NUR): `tests/spec/agent-skills/post-merge-finalize-t900096.bats` (NEU)
- SSOT: `openspec/specs/agent-skills.md` (Delta `devflow-post-merge-guards`) · Ticket: T900096
- KEINE Implementation in diesem Partial.

## T1 — RED: neue BATS-Datei anlegen (muss FAILen)

- Header: SSOT + T900096 + PRÜFMODUS-Doku. Source-Grep ist die dokumentierte
  Ausnahme T002448-M4 (Schritt 1 `ticket.sh get` braucht die Ticket-DB — wie in
  `post-merge-finalize-guards.bats` dokumentiert); Runtime für Lib-Helper
  (`scripts/lib/finalize-step-guards.sh` per source laden, `git`-Stub via PATH
  mit porcelain-Fixtures, exit-Codes prüfen); Source-Grep mit Anker NUR für die
  2-zeiligen Call-Sites in `finalize.sh`. Jeder Guard-Test bekommt einen
  Positiv-Anker T002356-M1 (ohne Anker wäre die Aussage bei entfernter Logik vakuos).
- (1a) Branch mit ungemergten Commits wird behalten: Lib-Guard per source laden,
  `git`-Stub liefert für `merge-base --is-ancestor` Exit 1 → kein `branch -D`,
  `[warn]` nennt die ungemergten Commits. Anker: Stub liefert Exit 0 →
  `branch -D "$BRANCH"` läuft, `mark_ok "Schritt 10: lokaler Branch $BRANCH entfernt"`.
- (1b) Call-Site-Guard existiert: `grep -qF 'merge-base --is-ancestor'` auf
  `scripts/devflow-post-merge-finalize.sh` + Anker `grep -qF 'branch -D'`.
  Nur belegte Symbole (`mark_warn`/`mark_skip`, `FATAL … >&2` + `exit 1`).
- (2a) Dirty-Tree → FATAL-Abbruch VOR `checkout -B`: `git`-Stub liefert
  `M docs/agent-guide/registry/agents.yaml` (getrackt-modifiziert) plus eine
  `??`-Zeile (untracked) für `status --porcelain` → Exit non-zero, `FATAL` nennt
  die dirty Pfade, Stub-Trace belegt: `checkout -B` nie aufgerufen. Anker:
  leere porcelain-Ausgabe → Abschnitt läuft durch (kein FATAL).
- (2b) Negativ-Guard gegen Fremd-Ansatz: im Schritt-8-Abschnitt (awk-Bereich
  `# Schritt 8` bis `trap _restore_prev_branch EXIT`, T003104) kommen
  `git checkout -- .` und `git clean -fd` NICHT vor (`run …; [ "$status" -ne 0 ]`).
- RED-Nachweis: Guards in lib temporär neutralisieren (Guard-Funktionen zu
  `return 0` stubben ODER `finalize.sh`-Stand von `origin/main` ausleihen) →
  Lauf FAILt. Phrase `expected: FAIL` in den Step-Body. Exakter Aufruf
  (vendored runner): `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-t900096.bats`

## T2 — GREEN: gleicher Lauf auf Branch-Stand

- `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-t900096.bats` → alle Tests ok (Guards aus p1 aktiv).

## T3 — Nachbarn bleiben grün

- `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats tests/spec/agent-skills/finalize-hardening.bats tests/spec/agent-skills/finalize-archive-state.bats tests/spec/agent-skills/finalize-worktree-branch-validation.bats tests/spec/dev-flow-plan/archive-staged-scope.bats` → alle grün.
