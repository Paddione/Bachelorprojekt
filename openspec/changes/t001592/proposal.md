# Proposal: t001592

## Why

Die lokale Agenten-Orchestrierung erfordert verbesserte Steuerungsmöglichkeiten direkt im Factory Floor Dashboard sowie eine zentrale Einstellungsseite (Sidekick Settings) für globale Orchestrierungs-Parameter. Ohne diese Oberflächen können Administratoren die Provider-Zuweisung je Phase/Station nicht komfortabel einsehen oder ändern, und globale Flags wie das Token-Budget oder die Harness-Verwendung müssen direkt in der Datenbank modifiziert werden.

## What

1. **Station-Badge + Provider-Zuweisung auf dem Factory Floor:**
   - In `FactoryFloor.svelte` und den zugehörigen Komponenten (wie `StationColumn.svelte`) wird für jede Phase ein Badge angezeigt.
   - Ein Klick auf das Badge öffnet einen Drawer, in dem man Provider-Einträge für diese Phase (`source` entsprechend der Phase, z. B. `factory-scout`, `factory-plan`, `factory-implement`, `factory-review`) anlegen, aktivieren/deaktivieren, die Priorität verschieben oder Details editieren kann. Hierzu wird `KiProviderDrawer.svelte` wiederverwendet bzw. direkt eingebunden.
   
2. **Sidekick Settings View ('agent-settings'):**
   - In `PortalSidekick.svelte` und `SidekickHome.svelte` wird die Ansicht `'agent-settings'` ("Agenten-Einstellungen") integriert.
   - Folgende Steuerungen für globale Orchestrierungs-Parameter werden bereitgestellt:
     - `context_budget` (Zahlen-Input/Slider, default/max 180000)
     - `spawn-harness-toggle` (Checkbox/Switch für opencode spawn harness)
     - `lavish-delegation-regel` (Checkbox/Switch für lavish delegation review)
     - `kill-switch` (Checkbox/Switch zum globalen Deaktivieren aller Agenten)
     - Ein Link zur Key/Provider-Verwaltung unter `/admin/ki-konfiguration`.

_Ticket: T001592_
