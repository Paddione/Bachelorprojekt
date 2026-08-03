#!/usr/bin/env bats
# tests/spec/toolset-registry/collect-kinds.bats — Erfassung aller Instanz-Kinds [T002592]
#
# Pruefmodus: command output verification. Die Tests fuehren `node scripts/toolset/collect.mjs`
# AUS und werten dessen JSON-Ausgabe aus; der Quelltext wird nicht gegreppt (T002448-M4).
#
# Hintergrund: collect.mjs las bis T002592 ausschliesslich die mcpServers-Bloecke der
# Harness-Configs. Die 36 Eintraege unter enabledPlugins in .claude/settings.json waren ihm
# unbekannt, weshalb die im SSOT-Spec geforderte unreviewed-Quarantaene fuer plugin:/skill:/cli:
# nicht stattfinden konnte.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

# Gibt die Kind-Praefixe der Ausgabe als sortierte, kommagetrennte Liste aus.
kinds_of() {
  node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
    console.log([...new Set(d.map(i => i.instance.split(":")[0]))].sort().join(","));
  '
}

@test "collect: Ausgabe ist wohlgeformtes JSON" {
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | node -e 'JSON.parse(require(\"fs\").readFileSync(0,\"utf8\")); console.log(\"parsed\")'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"parsed"* ]]
}

@test "collect: erfasst alle fuenf Instanz-Kinds" {
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | node -e '
    const d = JSON.parse(require(\"fs\").readFileSync(0, \"utf8\"));
    console.log([...new Set(d.map(i => i.instance.split(\":\")[0]))].sort().join(\",\"));
  '"
  [ "$status" -eq 0 ]
  [[ "$output" == *"mcp"* ]]
  [[ "$output" == *"plugin"* ]]
  [[ "$output" == *"skill"* ]]
  [[ "$output" == *"cli"* ]]
  [[ "$output" == *"agent"* ]]
}

@test "collect: Plugins aus enabledPlugins erscheinen mit voller Marketplace-Id" {
  # superpowers@claude-plugins-official ist in .claude/settings.json aktiv. Der
  # Marketplace-Suffix ist Teil der Id, weil gleichnamige Plugins aus verschiedenen
  # Marketplaces verschiedene Instanzen sind.
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | grep -c 'plugin:superpowers@claude-plugins-official'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "collect: Skills werden aus dem SKILL.md-Frontmatter gelesen" {
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | grep -c 'skill:toolset-curate'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "collect: OVERVIEW.md wird nicht als Skill gezaehlt" {
  # Positiv-Anker zuerst: es werden ueberhaupt Skills erfasst. Ohne ihn bestuende die
  # Negativ-Aussage vakuos, falls die Skill-Erfassung ganz fehlt (T002356-M1).
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | grep -c '\"skill:'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 10 ]

  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | grep -c 'skill:OVERVIEW' || true"
  [ "$output" -eq 0 ]
}

@test "collect: jede Instanz traegt ein curation-Feld" {
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | node -e '
    const d = JSON.parse(require(\"fs\").readFileSync(0, \"utf8\"));
    const missing = d.filter(i => typeof i.curation !== \"string\");
    console.log(\"total=\" + d.length + \" missing=\" + missing.length);
  '"
  [ "$status" -eq 0 ]
  [[ "$output" == *"missing=0"* ]]
  # Positiv-Anker: es wurden ueberhaupt Instanzen erfasst.
  [[ "$output" != *"total=0"* ]]
}

@test "collect: registrierte Instanz ist NICHT unreviewed" {
  # cli:gh-axi ist in capabilities.yaml als canonical gefuehrt. Dieser Test ist der
  # Positiv-Anker gegen die Trivialimplementierung, die schlicht alles als unreviewed
  # markiert und damit den unreviewed-Test bestehen wuerde.
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | node -e '
    const d = JSON.parse(require(\"fs\").readFileSync(0, \"utf8\"));
    const e = d.find(i => i.instance === \"cli:gh-axi\");
    console.log(e ? \"curation=\" + e.curation : \"NOT_FOUND\");
  '"
  [ "$status" -eq 0 ]
  [[ "$output" == *"curation=canonical"* ]]
}

@test "collect: --unreviewed liefert eine echte Teilmenge" {
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs | node -e 'console.log(JSON.parse(require(\"fs\").readFileSync(0,\"utf8\")).length)'"
  [ "$status" -eq 0 ]
  local total="$output"

  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/collect.mjs --unreviewed | node -e '
    const d = JSON.parse(require(\"fs\").readFileSync(0, \"utf8\"));
    const wrong = d.filter(i => i.curation !== \"unreviewed\").length;
    console.log(d.length + \" \" + wrong);
  '"
  [ "$status" -eq 0 ]
  local filtered wrong
  filtered="$(echo "$output" | cut -d' ' -f1)"
  wrong="$(echo "$output" | cut -d' ' -f2)"

  # Teilmenge, nicht die Gesamtmenge — und ausschliesslich unreviewed-Eintraege.
  [ "$filtered" -lt "$total" ]
  [ "$wrong" -eq 0 ]
}
