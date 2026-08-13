#!/usr/bin/env bats
# tests/spec/dev-flow-plan/domains-vocabulary.bats
# T002614 — Freie domains-Woerter in Proposals greifen im Rollenfilter ins Leere.
# SSOT: openspec/specs/dev-flow-plan.md (Requirement "plan-context.sh filters by role").
#
# Pruefmodus: Output-Verifikation — die Tests fuehren scripts/plan-context.sh gegen
# Fixture-Repos aus und pruefen dessen Output/Exit, nicht den Quelltext. Das
# Vokabular wird ueber den `--vocab`-Flag aus dem Skript selbst gelesen (single
# source of truth) statt per Source-Grep im Test dupliziert.
#
# Fixture-Strategie: identisch zu tests/spec/plan-context.bats (T001895) — ein
# Wegwerf-git-Repo unter $BATS_TEST_TMPDIR, damit `git rev-parse --show-toplevel`
# in plan-context.sh CHANGES_DIR dorthin ankert und nie $REPO/openspec/changes/
# anfasst (keine Races mit openspec-workflow.bats im parallelen CI-Lauf).
#
# Bewusste Ausnahme: der letzte Test (Korpus-Guard) liest die ECHTEN Proposals
# unter $REPO/openspec/changes/ — absichtliche Abweichung von der Fixture-
# Entkopplung (T001534/T001895), weil der Guard genau den lebenden Korpus pruefen
# soll und nur liest (keine Mutation, daher keine Race). Wird ein neues Proposal
# mit ungemappten Woertern angelegt, faellt der Guard rot, bis das Wort in
# `_role_allowlist` aufgenommen oder das Proposal repariert ist.
#
# Rot-Vertrag: die Faelle 1-6 FAILEN auf dem Pre-Fix-Stand (vor T002614) und
# PASSEN nach dem Fix; die Anker-Faelle sind vorsaetzlich vorher wie nachher gruen
# (T002356: Positiv-Anker neben Negativaussagen).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/plan-context.sh"
  [[ -x "$SCRIPT" ]] || chmod +x "$SCRIPT"

  TMP_ROOT="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$TMP_ROOT"
  git init -q "$TMP_ROOT"
  git -C "$TMP_ROOT" config user.email "t002614-test@example.invalid"
  git -C "$TMP_ROOT" config user.name "T002614 Test"

  CHANGES_DIR="$TMP_ROOT/openspec/changes"

  _make_fixture() {
    local slug="$1" domains="$2"
    mkdir -p "$CHANGES_DIR/$slug"
    cat > "$CHANGES_DIR/$slug/proposal.md" <<EOF
---
title: "Proposal: $slug"
---

# Proposal: $slug

test fixture, safe to ignore.
EOF
    cat > "$CHANGES_DIR/$slug/tasks.md" <<EOF
---
title: "Tasks: $slug"
domains: [$domains]
status: active
---

# Tasks: $slug

- [ ] test fixture task
EOF
  }

  _run_pcf() {
    (cd "$TMP_ROOT" && bash "$SCRIPT" "$@")
  }

  # Domain-Token eines Proposals lesen (proposal.md, Fallback tasks.md) —
  # Spiegel des Frontmatter-Parsings in plan-context.sh.
  _proposal_domains() {
    local path="$1" f content
    for f in "$path" "$(dirname "$path")/tasks.md"; do
      [[ -f "$f" ]] || continue
      content=$(awk 'BEGIN{f=0} /^---$/{if(f==0){f=1;next} else if(f==1){exit}} f==1{print}' "$f")
      if printf '%s\n' "$content" | grep -q '^domains:'; then
        printf '%s\n' "$content" | sed -n 's/^domains:[[:space:]]*\(.*\)$/\1/p' | head -1 \
          | tr -d '[]"' | tr ',' ' ' | tr -s ' '
        return
      fi
    done
  }
}

# ── (1) Selbst-Match: voller Rollenname als Domain erreicht die eigene Rolle ──

@test "T002614: full role name as domain matches its own role (RED pre-fix)" {
  _make_fixture "zz-t002614-self-test" "bachelorprojekt-test"
  out="$(_run_pcf bachelorprojekt-test 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: zz-t002614-self-test" \
    || { echo "MISSING: zz-t002614-self-test (domains: [bachelorprojekt-test]) should be included for role bachelorprojekt-test"; return 1; }
}

@test "T002614: full role name 'bachelorprojekt-infra' matches role bachelorprojekt-infra (RED pre-fix)" {
  _make_fixture "zz-t002614-self-infra" "bachelorprojekt-infra"
  out="$(_run_pcf bachelorprojekt-infra 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: zz-t002614-self-infra" \
    || { echo "MISSING: zz-t002614-self-infra (domains: [bachelorprojekt-infra]) should be included for role bachelorprojekt-infra"; return 1; }
}

# ── (2) Vokabular: beobachtete Korpus-Woerter erreichen ihre gemappte Rolle ──

@test "T002614: corpus word 'scripts' reaches role bachelorprojekt-test (RED pre-fix)" {
  _make_fixture "zz-t002614-scripts" "scripts"
  out="$(_run_pcf bachelorprojekt-test 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: zz-t002614-scripts" \
    || { echo "MISSING: zz-t002614-scripts (domains: [scripts]) should be included for role bachelorprojekt-test"; return 1; }
}

@test "T002614: corpus word 'deployment' reaches role bachelorprojekt-infra (RED pre-fix)" {
  _make_fixture "zz-t002614-deployment" "deployment"
  out="$(_run_pcf bachelorprojekt-infra 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: zz-t002614-deployment" \
    || { echo "MISSING: zz-t002614-deployment (domains: [deployment]) should be included for role bachelorprojekt-infra"; return 1; }
}

# ── (3) Fail-loud: Proposal ohne Anchor wird NICHT still exkludiert ──

@test "T002614: all-dead domains emit a WARN naming slug and domains (RED pre-fix)" {
  _make_fixture "zz-t002614-dead" "tooling, skills"
  err="$(_run_pcf bachelorprojekt-ops 2>&1 >/dev/null || true)"
  if ! { echo "$err" | grep -q "zz-t002614-dead" && echo "$err" | grep -q "matching no role allowlist" && echo "$err" | grep -q "tooling"; }; then
    echo "MISSING stderr WARN for all-dead proposal (domains: [tooling, skills], role: ops) — got stderr: [$err]"
    return 1
  fi
}

@test "T002614: anchored proposal emits no dead-domains WARN (positive anchor)" {
  _make_fixture "zz-t002614-anchored" "ops"
  err="$(_run_pcf bachelorprojekt-ops 2>&1 >/dev/null || true)"
  if echo "$err" | grep -q "matching no role allowlist"; then
    echo "REGRESSION: anchored proposal (domains: [ops]) triggered the dead-domains WARN"
    return 1
  fi
}

@test "T002614: orchestrator includes an unanchored proposal without WARN (anchor)" {
  _make_fixture "zz-t002614-unanchored" "tooling"
  out="$(_run_pcf orchestrator 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: zz-t002614-unanchored" \
    || { echo "MISSING: orchestrator must include the unanchored proposal"; return 1; }
  err="$(_run_pcf orchestrator 2>&1 >/dev/null || true)"
  if echo "$err" | grep -q "matching no role allowlist"; then
    echo "REGRESSION: orchestrator (__ALL__) must not emit the dead-domains WARN"
    return 1
  fi
}

# ── (4) Korpus-Guard: jedes aktive Proposal hat mindestens einen Domain-Anchor ──

@test "T002614: every active proposal has at least one domain anchor (corpus guard)" {
  vocab="$(bash "$SCRIPT" --vocab 2>/dev/null || true)"
  # Vertrag: --vocab liefert die Token-Union (Rollen-Allowlists + Rollennamen),
  # KEINEN Proposal-Dump. Pre-Fix ist --vocab unbekannt und der Aufruf faellt auf
  # den unknown-role-Pfad mit Volltext zurueck — daran scheitert die Assertion.
  if { ! case " $vocab " in *" website "*) true ;; *) false ;; esac; } \
     || printf '%s\n' "$vocab" | grep -q "Active proposal"; then
    echo "MISSING: plan-context.sh --vocab must print the union vocabulary (tokens, no proposal markup)"
    return 1
  fi

  unanchored=0
  for f in "$REPO"/openspec/changes/*/proposal.md; do
    [[ -f "$f" ]] || continue
    slug="$(basename "$(dirname "$f")")"
    [[ "$slug" == "archive" ]] && continue
    domains="$(_proposal_domains "$f")"
    [[ -z "$domains" ]] && continue  # legacy ohne domains bzw. domains: [] — nicht Guard-Scope
    anchored=0
    for d in $domains; do
      [[ "$d" == */* ]] && continue  # Pfad-Token sind explizite Verweise, nie Vokabular
      case " $vocab " in
        *" $d "*) anchored=1; break ;;
      esac
    done
    if [[ "$anchored" -eq 0 ]]; then
      echo "UNANCHORED: $slug (domains: [$domains]) — Wort in _role_allowlist aufnehmen oder Proposal reparieren"
      unanchored=$((unanchored+1))
    fi
  done
  [ "$unanchored" -eq 0 ] \
    || { echo "corpus guard: $unanchored proposal(s) without a domain anchor"; return 1; }
}
