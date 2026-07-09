# Proposal: agent-guide-harness-badge

## Why

T001611 (harness-workflow-split, gemergt) hat der Agent-Guide-Registry
(`docs/agent-guide/registry/tools.yaml`) ein `harness`-Feld pro Tool hinzugefügt
(`claude`/`opencode`/`both`), es aber bewusst nicht bis in die Webapp-Projektion
(`scripts/agent-guide/emit-webapp.mjs` → `website/src/lib/agent-guide.generated.json`)
durchgereicht, um den UI-Churn in diesem vorangegangenen Change klein zu halten. Die
bereits bestehende interaktive Agent-Guide-Sidekick-UI
(`website/src/components/assistant/AgentGuideView.svelte` + `GuideCard.svelte` +
`GuideFindBar.svelte`) kann daher weder nach Harness filtern noch ein Harness-Badge auf
den Tool-Karten zeigen — obwohl das Backend die Information seit T001611 hat.

Zusätzlich beschriftet `GuideCard.svelte` den "Prompt kopieren"-Button für die Init-Prompt-
Sektion pauschal mit `"In Claude Code einfügen"`, unabhängig vom tatsächlichen Harness des
Tools. Für die 4 opencode-Skills (`opencode-flow-plan/-execute/-chore`,
`opencode-git-workflow`), deren `init_prompt_de` bereits natürlichsprachige
opencode-Trigger-Formulierungen enthält (seit T001611), ist dieses Label irreführend — der
Text ist erkennbar nicht für eine Claude-Code-Slash-Eingabe gedacht.

## What

- `harness` von der Registry über `emit-webapp.mjs` in `agent-guide.generated.json`
  durchreichen (Fallback `both` bei fehlendem Feld).
- `harness` im `Tool`-Typ (`agentGuide.ts`) und im `GuideEntry`-Suchindex
  (`agentGuideSearch.ts`) verfügbar machen — nur für Tool-Einträge, nicht für Ziele
  (Goals haben kein Harness-Attribut, da ein Ziel-Flow mehrere Tools über beide Harnesses
  hinweg verketten kann).
- Harness-Badge auf Tool-Karten (`GuideCard.svelte`) — sichtbar nur bei `claude` oder
  `opencode`, nicht bei `both` (Normalfall, kein Rauschen).
- Harness-Filter in `GuideFindBar.svelte`, analog zum bestehenden
  Gefahrenstufen-Filter (Set-basiert, leer = alle, zwei Toggle-Buttons "Claude Code" /
  "opencode"; `both`-Tools bleiben bei jedem aktiven Filter sichtbar).
- Harness-bewusste Beschriftung der Init-Prompt-Sektion in `GuideCard.svelte`:
  `claude` → "In Claude Code einfügen" (unverändert), `opencode` → "In opencode
  einfügen" (neu), `both`/unbekannt → "Prompt einfügen" (neu, harness-neutral).

Explizit außerhalb des Scopes: kein Live-Dispatch aus dem Portal (Web-Request löst
Agent-Prozess aus) — nur Anzeige-/Filter-/Label-Änderungen.

_Ticket: T001612_
