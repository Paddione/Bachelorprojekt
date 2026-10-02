#!/usr/bin/env bats

# [T013434] Der erste Test verglich bis 2026-08-22 gegen das Literal
# 'gemma26-throughput'. Das war der Grund, warum der Loadout-Pin bei jedem
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

# T900728: the cockpit-UI assertion (KiRoutingPanel under the website factory
# path) moved to the A3a web retirement — rest scope cannot reference it.
