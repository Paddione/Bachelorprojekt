#!/usr/bin/env bats

@test "shipped loadouts carry a valid factory block" {
  run node --input-type=module -e "import{readLoadouts}from'./scripts/llm-proxy/loadouts.mjs';const{doc}=readLoadouts();if(doc.factory.model!=='gemma26-throughput'||doc.factory.locked!==false)process.exit(1)"
  [ "$status" -eq 0 ]
}

@test "admin UI offers a select and lock toggle without text input" {
  run grep -q 'id="factory-model"' scripts/llm-proxy/ui/index.html
  [ "$status" -eq 0 ]
  run grep -q 'id="factory-locked"' scripts/llm-proxy/ui/index.html
  [ "$status" -eq 0 ]
  run awk '/<fieldset id="factory">/,/<\/fieldset>/' scripts/llm-proxy/ui/index.html
  [ "$status" -eq 0 ]
  [[ "$output" != *'type="text"'* ]]
}
