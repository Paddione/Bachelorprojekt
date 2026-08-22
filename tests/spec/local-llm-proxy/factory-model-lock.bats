#!/usr/bin/env bats

# [T013434] Der erste Test verglich bis 2026-08-22 gegen das Literal
# 'gemma26-throughput'. Das war der Grund, warum der Factory-Pin bei jedem
# Modellwechsel mitgeaendert werden musste — und warum er beim Wechsel auf
# qwen38-220k stehenblieb. Geprueft wird jetzt die eigentliche Zusicherung:
# factory.model benennt ein Loadout, das es im selben Dokument gibt, und
# factory.locked ist boolesch. Beides driftet nicht mit dem Modell.

@test "shipped loadouts carry a valid factory block" {
  run node --input-type=module -e "
    import{readLoadouts}from'./scripts/llm-proxy/loadouts.mjs';
    const{doc}=readLoadouts();
    const slugs=doc.loadouts.map(l=>l.slug);
    if(typeof doc.factory.locked!=='boolean'){console.log('locked-not-boolean');process.exit(1)}
    if(!slugs.includes(doc.factory.model)){console.log('unknown-slug:'+doc.factory.model);process.exit(1)}
    console.log('factory-model-ok:'+doc.factory.model)
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"factory-model-ok:"* ]]
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
