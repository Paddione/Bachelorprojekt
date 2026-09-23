#!/usr/bin/env bats
# PRUEFMODUS: Output-Verifikation
# SSOT: openspec/specs/llm-local-dev.md
# Ticket: T900220 — FreeToken (:1919, Qwen3.6) lehnt jede zweite
# role=system-Nachricht ab ("could not encode request: System message must be
# at the beginning."). opencode 1.18.31 schickt fuer qwen38-primary und den
# Titel-Agenten system,system,user. Das Plugin
# .opencode/plugin/system-message-merge.ts fuehrt fuer den Provider
# llamacpp-local alle system-Nachrichten zu einer an Position 0 zusammen.
#
# Der Test laedt das Plugin wie opencode (Modul-Export -> config-Hook), setzt
# einen Stub-fetch als upstream ein und prueft den Body, den der Stub erhaelt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PLUGIN="${REPO_ROOT}/.opencode/plugin/system-message-merge.ts"
  command -v node >/dev/null 2>&1 || skip "node binary not installed"
}

# $1 = Provider-Key, $2 = messages-JSON. Gibt die Rollen des an den Stub
# gesendeten Bodys aus (kommagetrennt), danach Zeile 2 den ersten Inhalt.
drive() {
  PLUGIN="$PLUGIN" PROVIDER="$1" MESSAGES="$2" node --experimental-strip-types --no-warnings --input-type=module -e '
    import { pathToFileURL } from "node:url"
    const mod = await import(pathToFileURL(process.env.PLUGIN).href)
    const plugins = Object.values(mod).filter((v) => typeof v === "function")
    if (plugins.length === 0) { console.error("no plugin export"); process.exit(3) }
    let sent = null
    const cfg = { provider: { [process.env.PROVIDER]: { options: {
      fetch: async (_input, init) => { sent = init.body; return new Response("{}") },
    } } } }
    for (const p of plugins) { const hooks = await p({}); if (hooks.config) await hooks.config(cfg) }
    const body = JSON.stringify({ model: "Qwen3.8-27B-dualgpu", messages: JSON.parse(process.env.MESSAGES) })
    await cfg.provider[process.env.PROVIDER].options.fetch("http://127.0.0.1:1919/v1/chat/completions", { method: "POST", body })
    const msgs = JSON.parse(sent).messages
    console.log(msgs.map((m) => m.role).join(","))
    console.log(JSON.stringify(msgs[0].content))
  '
}

@test "T900220: plugin file exists" {
  [ -f "$PLUGIN" ]
}

@test "T900220: two leading system messages are merged into one at position 0" {
  run drive llamacpp-local '[{"role":"system","content":"A"},{"role":"system","content":"B"},{"role":"user","content":"hi"}]'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "system,user" ]
  [ "${lines[1]}" = '"A\n\nB"' ]
}

@test "T900220: a system message later in the conversation moves to the front" {
  run drive llamacpp-local '[{"role":"system","content":"A"},{"role":"user","content":"u1"},{"role":"assistant","content":"a1"},{"role":"system","content":"B"},{"role":"user","content":"u2"}]'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "system,user,assistant,user" ]
  [ "${lines[1]}" = '"A\n\nB"' ]
}

@test "T900220: array content is flattened to text when merging" {
  run drive llamacpp-local '[{"role":"system","content":[{"type":"text","text":"A"}]},{"role":"system","content":"B"},{"role":"user","content":"hi"}]'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "system,user" ]
  [ "${lines[1]}" = '"A\n\nB"' ]
}

@test "T900220: a single leading system message passes through unchanged" {
  run drive llamacpp-local '[{"role":"system","content":"A"},{"role":"user","content":"hi"}]'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "system,user" ]
  [ "${lines[1]}" = '"A"' ]
}

@test "T900220: other providers are not touched" {
  run drive opencode-go '[{"role":"system","content":"A"},{"role":"system","content":"B"},{"role":"user","content":"hi"}]'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "system,system,user" ]
}
