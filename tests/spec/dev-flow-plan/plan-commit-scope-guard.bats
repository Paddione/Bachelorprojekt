#!/usr/bin/env bats
# T004896: Pläne dürfen nur gültige Commit-Scopes vorschreiben. Der Mishap:
# T004829s tasks.md schrieb `git commit -m "fix(openspec-embed): …"` vor, der
# commit-msg-Hook lehnte zur Commit-Zeit ab. Dieser Guard erzwingt das frühe
# Gate: plan-lint Hard Rule P2, die jede `type(scope):`-Vorkommensform in der
# Plan-Datei gegen die SSOT-Allowlist (commitlint.config.cjs, gelesen via
# `scripts/validate-commit-msg.sh scopes`) plus Ticket-/Health-Goal-Scopes prüft.
#
# Prüfmodus: command output verification [T002448-M4]. Jeder Test GENERIERT einen
# Fixture-Plan in $BATS_TEST_TMPDIR, ruft `scripts/plan-lint.sh` darauf auf und
# prüft $status/$output — kein Source-Grep.
#
# Fixture-Konstruktion: jeder Fixture-Plan erfüllt alle übrigen plan-lint Hard
# Rules (Frontmatter, H1, File Structure, Task 1 mit bats-Runner + `expected:
# FAIL`, GREEN-Task, Verify-Task), damit ein Fehlschlag nur aus der P2-Regel
# stammen kann (Muster: plan-lint-b1b-prose-path.bats).

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LINT="$REPO/scripts/plan-lint.sh"
  VALIDATE="$REPO/scripts/validate-commit-msg.sh"
}

# Generiert einen minimal-gültigen Fixture-Plan; $1..$n sind Zusatzzeilen, die
# in den Task-1-Body eingefügt werden (z. B. die Commit-Vorschreibung).
make_plan() {
  local p="$BATS_TEST_TMPDIR/plan-$BATS_TEST_NUMBER.md"
  {
    printf -- '---\ntitle: P2 Fixture\nticket_id: T004896\ndomains: [test]\nstatus: active\n---\n\n'
    printf '# P2 Fixture Implementation Plan\n\n'
    printf '## File Structure\n\n'
    printf '| File | Aktion |\n|------|--------|\n'
    printf -- '| `tests/spec/dev-flow-plan/plan-commit-scope-guard.bats` | neu |\n\n'
    printf '## Task 1: Commit vorschreiben\n\n'
    printf -- '- [ ] **Step 1: Write the failing test**\n\n'
    printf 'Run: `bats tests/unit/example.bats`\nExpected: FAIL\n\n'
    printf -- '- [ ] **Step 2: Prescribe the commit**\n\n'
    for line in "$@"; do
      printf '%s\n' "$line"
    done
    printf '\n## Task 2: GREEN\n\n- [ ] implement\n\n'
    printf '## Task 3: Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n'
  } > "$p"
  printf '%s' "$p"
}

@test "T004896 (Kern, RED→GREEN): ungültiger Commit-Scope in Plan-Vorschreibung failt plan-lint" {
  # Mishap-Reproduktion: die exakte Form aus T004829s tasks.md:95.
  local p
  p="$(make_plan 'git commit -m "fix(openspec-embed): slug literal in embed_output_is_success match [T004829]"')"

  run bash "$LINT" "$p"

  # ROT heute (plan-lint kennt P2 nicht, Exit 0) — GRÜN nach Task 2 (P2-Hard-Rule).
  [ "$status" -eq 1 ] || {
    echo "P2 schlug nicht an — plan-lint Exit $status statt 1:" >&2
    echo "$output" >&2
    return 1
  }
  echo "$output" | grep -qF 'openspec-embed' || {
    echo "P2-Meldung nennt den ungültigen Scope nicht:" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T004896 (Positiv-Anker): gültiger Named-Scope 'scripts' passiert plan-lint" {
  local p
  p="$(make_plan 'git commit -m "fix(scripts): tighten scope validation [T004896]"')"

  run bash "$LINT" "$p"

  [ "$status" -eq 0 ] || {
    echo "gültiger Scope 'scripts' wurde abgelehnt (Exit $status):" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T004896 (Positiv-Anker): Ticket- und Health-Goal-Scopes passieren plan-lint" {
  # Immer erlaubt: commitlint.config.cjs:66–67 (`^T\d{6}$`, `^G-[A-Z][A-Z0-9]+$`).
  local p
  p="$(make_plan 'git commit -m "chore(T004896): archive change" && git commit -m "fix(G-AGENTIC01): regen goal"')"

  run bash "$LINT" "$p"

  [ "$status" -eq 0 ] || {
    echo "Ticket-/Health-Goal-Scopes wurden abgelehnt (Exit $status):" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T004896 (Fixture-Ausnahme): Test-Eingabe-Zeile mit Redirection löst P2 nicht aus" {
  # Belegt am aktiven Fall commit-scope-openspec/tasks.md:78 — eine Zeile, die
  # eine absichtlich ungültige Message als HOOK-Test-Eingabe erzeugt, ist keine
  # Commit-Vorschreibung und darf plan-lint nicht rot machen.
  local p
  p="$(make_plan "printf 'chore(openspec): 54 gemergte Changes archivieren [T003139]\\n' > /tmp/msg-t003139.txt")"

  run bash "$LINT" "$p"

  [ "$status" -eq 0 ] || {
    echo "Fixture-Zeile löste P2 aus (Exit $status) — Fehlalarm:" >&2
    echo "$output" >&2
    return 1
  }
}
