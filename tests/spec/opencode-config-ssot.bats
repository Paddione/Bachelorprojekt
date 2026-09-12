#!/usr/bin/env bats
# SSOT-Guard fuer .opencode/agent-models.jsonc [T900162].
#
# Prueft die vier Kerninvarianten der opencode-Agenten-/Modellkonfiguration:
#   1. big-pickle-Limit ist auf 260000 kalibriert (Free-Quota, models.dev 256k-Basis)
#   2. jeder freetoken-local-Modelleintrag traegt ein Messdatum (messung/2026)
#   3. der Sync nach ~/.config/opencode ist idempotent (dry-run liefert leeren diff)
#   4. tot verifizierte Provider tragen einen // stale:-Marker
#
# Die JSONC-Auswertung laeuft ueber node + jsonc-parser (im Repo vorhanden),
# Kommentar-Pruefungen ueber den Rohtext — jsonc-parser verwirft Kommentare.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  cd "$REPO_ROOT" || return 1
}

@test "SSOT: opencode-zen/big-pickle limit.context == 260000" {
  node -e '
    const { parse } = require("jsonc-parser");
    const fs = require("fs");
    const src = fs.readFileSync(".opencode/agent-models.jsonc", "utf8");
    const errors = [];
    const cfg = parse(src, errors, { allowTrailingComma: true });
    if (errors.length) { console.error("parse errors:", errors); process.exit(1); }
    const v = cfg.provider["opencode-zen"].models["big-pickle"].limit.context;
    if (v !== 260000) { console.error("big-pickle limit.context =", v, "(expected 260000)"); process.exit(1); }
  '
}

@test "SSOT: jeder freetoken-local-Modelleintrag traegt Messdatum-Kommentar" {
  node -e '
    const { parse } = require("jsonc-parser");
    const fs = require("fs");
    const src = fs.readFileSync(".opencode/agent-models.jsonc", "utf8");
    const errors = [];
    const cfg = parse(src, errors, { allowTrailingComma: true });
    if (errors.length) { console.error("parse errors:", errors); process.exit(1); }
    const models = cfg.provider["freetoken-local"].models;
    const names = Object.keys(models);
    if (names.length === 0) { console.error("keine freetoken-local-Modelle"); process.exit(1); }
    const bad = [];
    for (const name of names) {
      const idx = src.indexOf(`"${name}": {`);
      if (idx < 0) { bad.push(name + ": Key nicht gefunden"); continue; }
      const limitIdx = src.indexOf(`"limit": {`, idx);
      if (limitIdx < 0) { bad.push(name + ": kein limit-Block"); continue; }
      if (!/messung|2026/.test(src.slice(idx, limitIdx))) {
        bad.push(name + ": kein Messdatum-Kommentar (messung/2026)");
      }
    }
    if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
  '
}

@test "Sync: dry-run ist idempotent (leerer diff nach apply)" {
  tmp="$(mktemp -d)"
  export OPENCODE_CONFIG="$tmp/opencode.jsonc"
  # Erster Lauf wendet den Sync auf die Temp-Config an.
  bash scripts/opencode-sync-agents.sh >/dev/null 2>&1
  # Zweiter Lauf als dry-run: muss "no changes" melden (leerer diff).
  run bash scripts/opencode-sync-agents.sh --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"no changes"* ]]
}

@test "SSOT: tot verifizierte llamacpp-local-Modelle tragen // stale:-Marker" {
  node -e '
    const fs = require("fs");
    const src = fs.readFileSync(".opencode/agent-models.jsonc", "utf8");
    const dead = ["hauhau-qwen36", "gemma12-vision"];
    const bad = [];
    for (const name of dead) {
      const idx = src.indexOf(`"${name}": {`);
      if (idx < 0) { bad.push(name + ": Eintrag fehlt"); continue; }
      const limitIdx = src.indexOf(`"limit": {`, idx);
      if (limitIdx < 0) { bad.push(name + ": kein limit-Block"); continue; }
      if (!/stale:/.test(src.slice(idx, limitIdx))) {
        bad.push(name + ": kein // stale:-Marker");
      }
    }
    if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
  '
}
