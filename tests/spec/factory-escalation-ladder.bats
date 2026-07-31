#!/usr/bin/env bats
# tests/spec/factory-escalation-ladder.bats
# Ticket: T002369 — Factory-Eskalationsleiter: gemma → deepseek-flash → deepseek-pro
#
# Design:
#   Der Watchdog (watchdog.sh) zählt consecutive Stale-Runden ohne Fortschritt
#   (factory_attempt:<ext_id>). factory-prep.sh liest diesen Zähler, berechnet
#   den bevorstehenden Pipeline-Durchlauf (pipeline_attempt = counter + 1) und
#   mapped auf ein Tier (flash/haiku/sonnet). pipeline.mjs übersetzt das Tier
#   in eine konkrete Model-Konfiguration.
#
#   Versuch   Zähler   pipeline_attempt   Tier
#   1.        —/0      1                  flash (lokal)
#   2.        1        2                  haiku (deepseek-chat)
#   3.        2        3                  sonnet (deepseek-reasoner)
#   4+        ≥3       3+                 sonnet (geklammert)

PM="scripts/factory/pipeline.mjs"
PR="scripts/factory/pipeline-runner.js"
FP="scripts/vda/factory-prep.sh"
WD="scripts/factory/watchdog.sh"
DB="scripts/factory/dispatcher-bridge.sh"
RP="scripts/factory/route-provider.sh"

# ─────────────────────────────────────────────────────────────────────────────
# D1 — pipeline.mjs: Model-Tier-Mapping
# ─────────────────────────────────────────────────────────────────────────────

@test "T002369-D1: pipeline.mjs deklariert MODEL_TIERS Mapping" {
  grep -q 'MODEL_TIERS' "$PM"
}

@test "T002369-D1: pipeline.mjs hat flash Tier (local LM Studio)" {
  grep -q 'flash.*lmstudio' "$PM"
}

@test "T002369-D1: pipeline.mjs hat haiku Tier (deepseek-chat)" {
  grep -q 'haiku.*deepseek' "$PM"
}

@test "T002369-D1: pipeline.mjs hat sonnet Tier (deepseek-reasoner)" {
  grep -q 'sonnet.*deepseek' "$PM"
}

@test "T002369-D1: pipeline.mjs liest A.model_tier aus den Pipeline-Args" {
  grep -q 'args?.model_tier' "$PM"
}

@test "T002369-D1: pipeline.mjs fallback auf flash wenn kein Tier gesetzt" {
  grep -q '?? MODEL_TIERS.flash' "$PM"
}

# ─────────────────────────────────────────────────────────────────────────────
# D2 — factory-prep.sh: Attempt-Logik und Tier-Mapping
# ─────────────────────────────────────────────────────────────────────────────

@test "T002369-D2: factory-prep.sh liest factory_attempt aus factory_control" {
  grep -q 'factory_attempt:' "$FP"
}

@test "T002369-D2: factory-prep.sh mapped pipeline_attempt 1→flash" {
  grep -q 'model_tier="flash"' "$FP"
}

@test "T002369-D2: factory-prep.sh mapped pipeline_attempt 2→haiku" {
  grep -q 'model_tier="haiku"' "$FP"
}

@test "T002369-D2: factory-prep.sh mapped pipeline_attempt 3+→sonnet" {
  grep -q 'model_tier="sonnet"' "$FP"
}

@test "T002369-D2: factory-prep.sh injeziert attempt und model_tier in launch entry" {
  grep -q '"attempt":\$at' "$FP"
  grep -q '"model_tier":\$mt' "$FP"
}

# ─────────────────────────────────────────────────────────────────────────────
# D3 — route-provider.sh: Skip-Phase-Pin für Escalation
# ─────────────────────────────────────────────────────────────────────────────

@test "T002369-D3: route-provider.sh unterstützt ROUTE_SKIP_PINNED" {
  grep -q 'ROUTE_SKIP_PINNED' "$RP"
}

@test "T002369-D3: route-provider.sh überspringt Phase-Pin wenn ROUTE_SKIP_PINNED=true" {
  grep -q 'ROUTE_SKIP_PINNED.*true' "$RP"
}

# ─────────────────────────────────────────────────────────────────────────────
# D4 — dispatcher-bridge.sh: Tier-Durchreichung
# ─────────────────────────────────────────────────────────────────────────────

@test "T002369-D4: dispatcher-bridge.sh extrahiert attempt aus launch row" {
  grep -q '\.attempt' "$DB"
}

@test "T002369-D4: dispatcher-bridge.sh extrahiert model_tier aus launch row" {
  grep -q '\.model_tier' "$DB"
}

@test "T002369-D4: dispatcher-bridge.sh zeigt Tier im Launch-Log" {
  grep -q 'tier=' "$DB"
}

# ─────────────────────────────────────────────────────────────────────────────
# D5 — watchdog.sh: Tier-Name in Kommentaren
# ─────────────────────────────────────────────────────────────────────────────

@test "T002369-D5: watchdog.sh leitet Tier-Name aus attempt ab" {
  grep -q 'tier_name=' "$WD"
}

@test "T002369-D5: watchdog.sh zeigt Tier-Name im attempt_note" {
  grep -q 'tier=' "$WD"
}

@test "T002369-D5: watchdog.sh mapped attempt 1→flash" {
  grep -q 'tier_name="flash"' "$WD"
}

@test "T002369-D5: watchdog.sh mapped attempt 2→haiku" {
  grep -q 'tier_name="haiku"' "$WD"
}

@test "T002369-D5: watchdog.sh mapped attempt 3→sonnet" {
  grep -q 'tier_name="sonnet"' "$WD"
}
