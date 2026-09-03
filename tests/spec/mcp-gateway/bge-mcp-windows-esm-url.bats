#!/usr/bin/env bats
# tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats
# SSOT: openspec/specs/mcp-gateway.md
#
# T900039 — Der bge-mcp-Shim laedt components/website/src/lib/bge-router.ts per
# dynamischem import(). Wird dabei ein absoluter Pfad statt einer file://-URL
# uebergeben, bricht Node auf Windows mit ERR_UNSUPPORTED_ESM_URL_SCHEME ab
# ("Received protocol 'c:'"), noch bevor irgendeine Fachlogik laeuft.
#
# Der Test braucht weder Netzwerk noch einen freien Port: ohne BGE_MCP_TOKEN
# lehnt der Server den Start mit einer definierten Meldung ab — und zwar ERST
# NACH dem Router-Import. Die Meldung ist damit der Positiv-Anker dafuer, dass
# der Import geglueckt ist.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  # Windows/MSYS: node braucht C:/... statt /c/... (siehe tests/spec/mcp-gateway.bats).
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
  command -v node >/dev/null 2>&1 || skip "node binary not installed"
}

@test "bge-mcp shim laedt den bge-router und erreicht die Token-Pruefung" {
  run env -u BGE_MCP_TOKEN node "$REPO/scripts/bge-mcp/server.mjs"

  # Positiv-Anker: der Start ist bis zur Token-Pruefung gekommen, der
  # Router-Import also geglueckt. [T900052] Der Server fail-fasted jetzt mit
  # der gemeinsamen MCP-HTTPSEC-Meldung statt der eigenen "is unset"-Ausgabe.
  [[ "$output" == *"MCP-HTTPSEC: Pflicht-Token fehlt"* ]]
}

@test "bge-mcp shim scheitert nicht am ESM-URL-Schema" {
  run env -u BGE_MCP_TOKEN node "$REPO/scripts/bge-mcp/server.mjs"

  [[ "$output" != *"ERR_UNSUPPORTED_ESM_URL_SCHEME"* ]]
}
