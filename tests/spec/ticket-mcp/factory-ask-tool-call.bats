#!/usr/bin/env bats
#
# SSOT: openspec/changes/factory-ask-tool-call (T003987)
# Ticket: T003987 — factory_ask liefert Tool-Call-String statt Antwort
#   (gemma26-throughput emittiert <|tool_call|>call:factory_status{}<tool_call|>)
#
# PRUEFMODUS: Semantischer Wert-Check (T002716) — wie Sibling factory-ask-timeout.bats
# (T003803): Der Defekt sitzt in der Antwortverarbeitung des Go-Handlers; die
# LLM-Ausgabe selbst ist nicht deterministisch pruefbar. Geprueft werden deshalb
# EXISTENZ, VERDRAHTUNG und ZUSAMMENSETZUNG der Allowlist im Quelltext.
# Ohne Implementierung ist der Test rot (kein vakuoser Negativtest).

@test "T003987: Allowlist factoryReadOnlyTools existiert mit Status/Queue, ohne side-effecting Tools" {
  run grep -E 'factoryReadOnlyTools' scripts/factory/mcp-go/main.go
  [ "$status" -eq 0 ]

  block=$(awk '/var factoryReadOnlyTools = map/,/^}/' scripts/factory/mcp-go/main.go)
  grep -qF '"factory_status"' <<<"$block"
  grep -qF '"factory_queue"' <<<"$block"
  # Side-effecting Tools duerfen NIE auto-ausgefuehrt werden (Operator-Entscheid
  # 2026-08-14, Brainstorming): enqueue/trigger gehoeren nicht in die Allowlist.
  ! grep -qE 'factory_enqueue|factory_trigger' <<<"$block"
}

@test "T003987: resolveToolCallAnswer existiert und ist im Answer-Pfad verdrahtet" {
  run grep -E 'func resolveToolCallAnswer' scripts/factory/mcp-go/main.go
  [ "$status" -eq 0 ]

  # T003104-Lehre: Definition ohne Aufruf = toter Code — die Funktion muss
  # innerhalb von toolFactoryAsk angewendet werden, nicht nur existieren.
  awk '/func toolFactoryAsk/,/^}/' scripts/factory/mcp-go/main.go | grep -qE 'resolveToolCallAnswer'
}

@test "T003987: System-Prompt verbietet rohe Tool-Call-Syntax" {
  # Der Prompt ist ein einzeiliger Raw-String (const factorySystemPrompt = `...`).
  block=$(sed -n 's/.*const factorySystemPrompt = `\(.*\)`.*/\1/p' scripts/factory/mcp-go/main.go)
  [ -n "$block" ]
  grep -qiE 'tool_call' <<<"$block"
  grep -qiE 'never|nicht' <<<"$block"
}
