#!/usr/bin/env bats
# tests/spec/llm-local-dev/alias-telemetry.bats
# SSOT: openspec/changes/freetoken-backend-evaluation/specs/llm-local-dev.md
#       Requirement "Alias Usage Telemetry for the FreeToken Plugin" (T900087, P7).
#
# Prueft AUSFUEHRUNG, nicht Quelltext (tests/CLAUDE.md: Output- statt
# Source-Verifikation): der Guard importiert .opencode/plugin/freetoken-active.ts
# ueber tsx, ruft dessen config-Hook mit einem Mock-cfg auf, treibt den
# installierten fetch-Wrapper und liest die entstandene JSONL-Datei zurueck.
#
# Kein laufender FreeToken-Server noetig: der config-Hook installiert den
# fetch-Wrapper synchron, BEVOR er discoverRuntime() awaited. Scheitert die
# Discovery (Port 1900/1919 tot — Normalfall in CI und auf diesem Host), faengt
# der aeussere try/catch das ab und der Wrapper bleibt gueltig stehen.
#
# LOCALAPPDATA wird PRO Testfall in einem eigenen tsx-Subprozess gesetzt:
# TELEMETRY_PATH im Plugin ist eine Modul-Top-Level-const, die beim Import
# ausgewertet wird — ein zweiter import() im selben Prozess traefe den
# Modul-Cache und pruefte fuer beide Aufrufe denselben (ersten) Pfad.

setup() {
  export REPO="$(cd "$BATS_TEST_DIRNAME/../../../" && pwd)"
  export TSX="$REPO/node_modules/.bin/tsx"
  export PLUGIN="$REPO/.opencode/plugin/freetoken-active.ts"

  cat > "$BATS_TEST_TMPDIR/telemetry-harness.mjs" <<'HARNESS'
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [, , pluginPath, alias] = process.argv;
// pathToFileURL: ein nackter Windows-Pfad (C:\...) laesst den ESM-Loader mit
// ERR_UNSUPPORTED_ESM_URL_SCHEME (protocol 'c:') abbrechen.
const { default: createPlugin } = await import(pathToFileURL(pluginPath).href);
const hooks = await createPlugin();

let upstreamCall = null;
const cfg = {
  provider: {
    "freetoken-local": {
      models: { active: { limit: { context: 100000 } } },
      options: {
        fetch: async (url, init) => {
          upstreamCall = { url: String(url), body: init?.body ?? null };
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    },
  },
};

await hooks.config(cfg);
const wrapped = cfg.provider["freetoken-local"].options.fetch;
const body = JSON.stringify({
  model: alias,
  messages: [{ role: "user", content: "x".repeat(37) }],
});

let threw = false;
let res;
try {
  res = await wrapped("http://127.0.0.1:1919/v1/chat/completions", { body });
} catch {
  threw = true;
}

writeFileSync(process.env.RESULT_FILE, JSON.stringify({
  threw,
  status: res ? res.status : null,
  upstreamBody: upstreamCall ? upstreamCall.body : null,
}));
HARNESS
}

@test "T0 freetoken-active.ts laedt und config ist eine Funktion (Positiv-Anker)" {
  [ -x "$TSX" ] || skip "tsx not installed (run npm ci)"
  [ -f "$PLUGIN" ]
  cat > "$BATS_TEST_TMPDIR/anchor.mjs" <<'ANCHOR'
import { pathToFileURL } from "node:url";
const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();
process.exit(typeof hooks.config === "function" ? 0 : 1);
ANCHOR
  run "$TSX" "$BATS_TEST_TMPDIR/anchor.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}

@test "T1 active-thinking Request wird unter eigenem Alias mit ts+promptChars erfasst" {
  [ -x "$TSX" ] || skip "tsx not installed (run npm ci)"
  LOCALAPP_T1="$(mktemp -d)"
  mkdir -p "$LOCALAPP_T1/FreeToken/logs"
  out="$BATS_TEST_TMPDIR/t1-result.json"
  LOCALAPPDATA="$LOCALAPP_T1" RESULT_FILE="$out" \
    "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"
  jq -e '.threw == false and .status == 200' "$out"

  jsonl="$LOCALAPP_T1/FreeToken/logs/alias-telemetry.jsonl"
  [ -f "$jsonl" ]
  last="$(tail -n1 "$jsonl")"
  echo "$last" | jq -e '.alias == "active-thinking"'
  echo "$last" | jq -e '.promptChars | (type == "number") and (. > 0)'
  echo "$last" | jq -e '.ts | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T")'
}

@test "T2 active-fast Request wird unter eigenem Alias erfasst" {
  [ -x "$TSX" ] || skip "tsx not installed (run npm ci)"
  LOCALAPP_T2="$(mktemp -d)"
  mkdir -p "$LOCALAPP_T2/FreeToken/logs"
  out="$BATS_TEST_TMPDIR/t2-result.json"
  LOCALAPPDATA="$LOCALAPP_T2" RESULT_FILE="$out" \
    "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-fast"
  jq -e '.threw == false and .status == 200' "$out"

  jsonl="$LOCALAPP_T2/FreeToken/logs/alias-telemetry.jsonl"
  [ -f "$jsonl" ]
  tail -n1 "$jsonl" | jq -e '.alias == "active-fast"'
}

@test "T3 Telemetriedatei liegt ausserhalb des Working Tree" {
  [ -x "$TSX" ] || skip "tsx not installed (run npm ci)"
  LOCALAPP_T3="$(mktemp -d)"
  mkdir -p "$LOCALAPP_T3/FreeToken/logs"
  out="$BATS_TEST_TMPDIR/t3-result.json"
  LOCALAPPDATA="$LOCALAPP_T3" RESULT_FILE="$out" \
    "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"
  jq -e '.threw == false' "$out"

  [ -f "$LOCALAPP_T3/FreeToken/logs/alias-telemetry.jsonl" ]
  inside_repo="$(find "$REPO" -name 'alias-telemetry.jsonl' 2>/dev/null)"
  [ -z "$inside_repo" ]
}

@test "T4 Telemetrie-Schreibfehler aendert Request nicht und wirft nicht" {
  [ -x "$TSX" ] || skip "tsx not installed (run npm ci)"
  LOCALAPP_T4="$(mktemp -d)"
  # FreeToken/logs bleibt bewusst ungeschaffen -> appendFile schlaegt fehl
  # (appendFile legt keine Elternverzeichnisse an).
  [ ! -d "$LOCALAPP_T4/FreeToken/logs" ]

  LOCALAPP_OK="$(mktemp -d)"
  mkdir -p "$LOCALAPP_OK/FreeToken/logs"
  out_ok="$BATS_TEST_TMPDIR/t4-ok-result.json"
  LOCALAPPDATA="$LOCALAPP_OK" RESULT_FILE="$out_ok" \
    "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"

  out_fail="$BATS_TEST_TMPDIR/t4-fail-result.json"
  LOCALAPPDATA="$LOCALAPP_T4" RESULT_FILE="$out_fail" \
    "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"

  jq -e '.threw == false and .status == 200' "$out_fail"
  [ ! -f "$LOCALAPP_T4/FreeToken/logs/alias-telemetry.jsonl" ]

  # Positiv-Anker: der Erfolgsfall muss die Datei tatsaechlich geschrieben
  # haben, sonst belegt der Vergleich unten nichts.
  [ -f "$LOCALAPP_OK/FreeToken/logs/alias-telemetry.jsonl" ]

  body_ok="$(jq -r '.upstreamBody' "$out_ok" | jq -S .)"
  body_fail="$(jq -r '.upstreamBody' "$out_fail" | jq -S .)"
  [ "$body_ok" = "$body_fail" ]
}
