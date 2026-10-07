#!/usr/bin/env bats

# [T900885] Der Factory-Slot ist stillgelegt (E1-1): factory.model und
# factory.locked existieren nicht mehr — weder im Schema
# (scripts/llm-proxy/loadouts.mjs, T900728-Nachlauf) noch in den
# ausgelieferten Loadouts (scripts/llm/loadouts.json). Geprueft wird
# jetzt die eigentliche Zusicherung: Das ausgelieferte Dokument traegt
# keinen factory-Block mehr. Vorher (T013434): Gueltigkeit des Blocks
# (existierender Slug, boolescher Lock).

@test "shipped loadouts carry no factory block" {
  run node --input-type=module -e "
    import{readLoadouts}from'./scripts/llm-proxy/loadouts.mjs';
    const{doc}=readLoadouts();
    if(doc.factory!=null){console.log('factory-still-present');process.exit(1)}
    console.log('factory-absent-ok')
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"factory-absent-ok"* ]]
}

# T900728: the cockpit-UI assertion (KiRoutingPanel under the website factory
# path) moved to the A3a web retirement — rest scope cannot reference it.
