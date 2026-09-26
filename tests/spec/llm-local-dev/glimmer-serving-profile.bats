#!/usr/bin/env bats
# tests/spec/llm-local-dev/glimmer-serving-profile.bats — T900365
# SSOT: openspec/specs/llm-local-dev.md
#   Requirement: Glimmer Serving Profile on :1919
#   Requirement: Reasoning-Off Requests Also Lower Glimmer's Reasoning Strength
#
# PRUEFMODUS: Quelltext. Das Serving-Profil manifestiert sich ausschliesslich in
# der systemd-Unit (CI hat weder GPU noch llama-server), die Reasoning-Kwargs
# in den Payload-Buildern mehrerer Sprachen — dokumentierter Ausnahmefall
# [T002448-M4]. Laufzeitbelege: openspec/changes/glimmer-local-backend/measurements/.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  UNIT="$REPO/scripts/llm/glimmer.service"
}

@test "T900365: glimmer.service carries the measured serving profile" {
  # Positiv-Anker: die Unit existiert und hat eine ExecStart-Zeile.
  [ -f "$UNIT" ]
  run grep -c '^ExecStart=' "$UNIT"
  [ "$output" = "1" ]

  # ExecStart samt Fortsetzungszeilen (bis zur naechsten Key=Value-Zeile) als eine Zeile.
  local cmd; cmd="$(sed -n '/^ExecStart=/,/^Restart=/p' "$UNIT" | grep -v '^Restart=' | tr '\n' ' ')"
  local want
  for want in 'Muse-Glimmer-30B-UD-IQ3_XXS.gguf' 'Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf' \
              '--spec-type draft-dflash' '--spec-draft-n-max 4' '-c 131072' \
              '-ctk q8_0' '-ctv q8_0' '--alias Muse-Glimmer-30B' \
              '--host 0.0.0.0' '--port 1919' '-np 1' '--jinja'; do
    if ! grep -qF -e "$want" <<<"$cmd"; then
      echo "glimmer.service ExecStart fehlt: $want" >&2
      return 1
    fi
  done

  # Negativ-Aussagen: kein Vision-Projektor, Drafter nicht auf der 3060 Ti.
  [ -z "$(grep -F -e '--mmproj' <<<"$cmd" || true)" ]
  [ -z "$(grep -F -e '-devd CUDA1' <<<"$cmd" || true)" ]
}

@test "T900365: the Qwen unit is retired" {
  [ -f "$REPO/scripts/llm/glimmer.service" ]
  [ ! -e "$REPO/scripts/llm/qwen38-gsq.service" ]
}

@test "T900365: reasoning-off callers also send reasoning_strength low" {
  local f missing=""
  # T900399: die drei Factory-Aufrufer (triage-body.sh, factory-mcp-node/server.mjs,
  # factory/mcp-go/main.go) sind mit dem Factory-Subsystem entfallen.
  for f in scripts/brain-ingest-transform.sh \
           scripts/health-goals-payload.py scripts/arbitration/synthesize.mjs \
           scripts/web-audit.mjs scripts/plan-qa-check.sh; do
    # Positiv-Anker: der Aufrufer schaltet Thinking ueberhaupt ab.
    grep -q 'enable_thinking' "$REPO/$f" || { missing="${missing}${f}: kein enable_thinking (Anker)\n"; continue; }
    grep -qE "reasoning_strength[\"']?[[:space:]]*[:=]+[[:space:]]*[\"']low" "$REPO/$f" \
      || missing="${missing}${f}: reasoning_strength low fehlt\n"
  done
  if [ -n "$missing" ]; then printf "$missing" >&2; return 1; fi
}

# T900399: mit dem Wegfall von scripts/factory-mcp-node/server.mjs und
# scripts/factory/mcp-go/main.go bleibt kein modell-gegateter Aufrufer uebrig —
# der Test entfaellt ersatzlos (kein Ersatz-Anker noetig, es gibt kein Substrat).
