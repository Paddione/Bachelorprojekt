# Proposal: toolset-check-fixture-valid-schema

## Why

`node scripts/toolset/check.test.mjs` schlägt auf `origin/main` fehl, da das im Test generierte Fixture für `cli:gh-axi` (`state: canonical`) weder `use_when` noch `roles` deklariert. Seit T002592 erzwingt `scripts/toolset/check.mjs` diese Pflichtfelder für jede kanonische Instanz (Schema der Nutzungssemantik).

## What

1. In `scripts/toolset/check.test.mjs` das YAML-Fixture für `cli:gh-axi` um gültige `use_when`- und `roles`-Felder ergänzen.
2. Einen zusätzlichen Testfall in `scripts/toolset/check.test.mjs` ergänzen, der explizit verifiziert, dass `check.mjs` bei fehlendem `use_when` oder fehlenden `roles` auf kanonischen Instanzen mit Exit != 0 fehlschlägt.

_Ticket: T004889_

