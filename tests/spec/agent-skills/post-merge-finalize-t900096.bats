#!/usr/bin/env bats
# tests/spec/agent-skills/post-merge-finalize-t900096.bats
# SSOT: openspec/specs/agent-skills.md (Delta devflow-post-merge-guards) · Ticket: T900096
#
# PRÜFMODUS-Doku: Runtime fuer Lib-Helper (`scripts/lib/finalize-step-guards.sh`
# per source laden, `git`-Stub via PATH mit porcelain-Fixtures, Exit-Codes
# pruefen); Source-Grep mit Anker NUR fuer die Call-Sites in `finalize.sh` —
# dokumentierte Ausnahme T002448-M4 (Schritt 1 `ticket.sh get` braucht die
# Ticket-DB — wie in `post-merge-finalize-guards.bats` dokumentiert). Nur
# belegte Symbole (`mark_warn`-/`[warn]`-/`[skip]`-Format, `FATAL … >&2` +
# `exit 1`). Token-/Secret-Werte kommen nirgends vor.
#
# RED-Nachweis (Guards neutralisiert, expected: FAIL — die Runtime-Tests (1a)
# und (2a) fallen auf "immer-gruen" zurueck, die Anker bleiben gruen):
#   cat > /tmp/neutral-guards-T900096.sh <<'EOF'
#   finalize_assert_clean_tree() { return 0; }
#   finalize_branch_fully_merged() { return 0; }
#   finalize_holding_worktree() { return 0; }
#   EOF
#   FINALIZE_GUARDS_LIB=/tmp/neutral-guards-T900096.sh \
#     tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-t900096.bats
#
# Jeder Guard-Test bekommt einen Positiv-Anker (T002356-M1): ohne Anker waere
# die Aussage bei entfernter Logik vakuos.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]
  # RED-Umschalter: neutralisierte Lib per Env einhaengen (Default: Repo-Lib).
  GUARDS_LIB="${FINALIZE_GUARDS_LIB:-$REPO_ROOT/scripts/lib/finalize-step-guards.sh}"
  [ -f "$GUARDS_LIB" ]

  STUBS="$BATS_TEST_TMPDIR/stubs"
  TRACE="$BATS_TEST_TMPDIR/git-trace.log"
  mkdir -p "$STUBS"
  : > "$TRACE"

  # `git`-Stub: antwortet per Fixture-Env, protokolliert jeden Aufruf. Alle
  # Pfade absolut, kein `cd` (T006367-Regel wie in der Lib).
  cat > "$STUBS/git" <<'STUB'
#!/usr/bin/env bash
echo "git $*" >> "$GIT_TRACE"
case "$*" in
  *"status --porcelain"*) printf '%s' "$GIT_PORCELAIN"; exit 0 ;;
  *"merge-base --is-ancestor"*) exit "${GIT_MERGEBASE_RC:-0}" ;;
  *"log --oneline"*) printf '%s\n' "$GIT_LOG"; exit 0 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$STUBS/git"
  export PATH="$STUBS:$PATH"
  export GIT_TRACE="$TRACE" GIT_PORCELAIN="" GIT_LOG="" GIT_MERGEBASE_RC=0

  # shellcheck disable=SC1091 — Pfad steht erst zur Laufzeit fest (RED-Override).
  source "$GUARDS_LIB"
}

# Schritt-10-Anrufsimulation wie in finalize.sh: gemergt → Delete, sonst
# warn+skip (kein Delete, kein Abbruch — der Lauf geht weiter).
_step10_delete_branch() {
  local repo="$1" branch="$2"
  if finalize_branch_fully_merged "$repo" "$branch"; then
    git branch -D "$branch" && echo "[ok] Schritt 10: lokaler Branch $branch entfernt"
  else
    echo "[warn] Schritt 10: lokaler Branch $branch traegt ungemergte Commits — bleibt erhalten" >&2
    echo "[skip] Schritt 10: lokaler Branch $branch behalten"
  fi
}

@test "T900096 (1a): Branch mit ungemergten Commits wird behalten — kein branch -D, Warnung nennt Commits" {
  export GIT_MERGEBASE_RC=1
  export GIT_LOG="a1b2c3d plan: Arbeit auf Branch-B (T900078-Fall)
e4f5g6h fix: zweiter ungemergter Commit"
  run _step10_delete_branch "/tmp/repo" "feature/plan-T900078"
  [ "$status" -eq 0 ]
  # Kein Delete …
  [ -z "$(grep -F 'branch -D' "$TRACE" || true)" ]
  # … dafuer warn+skip, und die Warnung nennt die ungemergten Commits.
  printf '%s\n' "$output" | grep -q '\[warn\]'
  printf '%s\n' "$output" | grep -q 'zweiter ungemergter Commit'
  printf '%s\n' "$output" | grep -q '\[skip\]'
}

@test "T900096 (1a-Anker): voll gemergter Branch wird geloescht (branch -D laeuft, ok-Zeile)" {
  # Positiv-Anker: ohne ihn waere (1a) vakuos — eine Simulation, die nie
  # loescht, erfuellte "wird behalten" trivial.
  export GIT_MERGEBASE_RC=0
  run _step10_delete_branch "/tmp/repo" "feature/plan-T900078"
  [ "$status" -eq 0 ]
  grep -qF 'branch -D' "$TRACE"
  printf '%s\n' "$output" | grep -q '\[ok\] Schritt 10: lokaler Branch feature/plan-T900078 entfernt'
}

@test "T900096 (1b): Call-Site-Guard existiert in finalize.sh (merge-base-Anker + branch -D-Anker)" {
  run grep -qF 'merge-base --is-ancestor' "$FINALIZE"
  [ "$status" -eq 0 ]
  run grep -qF 'finalize_branch_fully_merged' "$FINALIZE"
  [ "$status" -eq 0 ]
  # Anker: die Delete-Aussage waere ohne bestehenden Delete-Aufruf vakuos.
  run grep -qF 'branch -D' "$FINALIZE"
  [ "$status" -eq 0 ]
}

@test "T900096 (2a): Dirty-Tree bricht VOR checkout -B ab — FATAL nennt Pfade" {
  export GIT_PORCELAIN="M docs/agent-guide/registry/agents.yaml
?? openspec/changes/fremd/tasks.md"
  # Die Lib ruft `exit 1` — darum in der Subshell (wie die Schritt-8-Subshell
  # in finalize.sh): Guard zuerst, checkout -B danach.
  run bash -c '
    export PATH="'"$STUBS"':$PATH" GIT_TRACE="'"$TRACE"'" GIT_PORCELAIN="'"$GIT_PORCELAIN"'"
    source "'"$GUARDS_LIB"'"
    finalize_assert_clean_tree "/tmp/archive" && git checkout -B "chore/x" origin/main
  '
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -q 'FATAL'
  printf '%s\n' "$output" | grep -q 'docs/agent-guide/registry/agents.yaml'
  printf '%s\n' "$output" | grep -q 'openspec/changes/fremd/tasks.md'
  # Stub-Trace belegt: checkout -B wurde nie aufgerufen.
  [ -z "$(grep -F 'checkout -B' "$TRACE" || true)" ]
}

@test "T900096 (2a-Anker): sauberer Tree laeuft durch — kein FATAL, checkout -B erreicht" {
  # Positiv-Anker: ohne ihn waere (2a) vakuos — ein Guard, der immer abbricht,
  # erfuellte "bricht bei Dirty ab" trivial.
  export GIT_PORCELAIN=""
  run bash -c '
    export PATH="'"$STUBS"':$PATH" GIT_TRACE="'"$TRACE"'" GIT_PORCELAIN=""
    source "'"$GUARDS_LIB"'"
    finalize_assert_clean_tree "/tmp/archive" && git checkout -B "chore/x" origin/main
  '
  [ "$status" -eq 0 ]
  [ -z "$(printf '%s\n' "$output" | grep -F 'FATAL' || true)" ]
  grep -qF 'checkout -B' "$TRACE"
}

@test "T900096 (2b): Schritt 8 verwirft nichts — kein checkout -- . / clean -fd im Archiv-Abschnitt" {
  # Bereichsmuster statt Zeilennummern (T003104): Einfuegungen oberhalb duerfen
  # den Test nicht faerben. Anker: der extrahierte Abschnitt muss existieren,
  # sonst waere die Negativ-Aussage vakuos.
  section="$(awk '/# Schritt 8/ { inside = 1 } inside { print } inside && /trap _restore_prev_branch EXIT/ { exit }' "$FINALIZE")"
  [ -n "$section" ]
  run grep -qF 'git checkout -- .' <<<"$section"
  [ "$status" -ne 0 ]
  run grep -qF 'git clean -fd' <<<"$section"
  [ "$status" -ne 0 ]
}
