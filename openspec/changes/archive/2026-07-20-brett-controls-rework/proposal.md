# Proposal: brett-controls-rework

## Why

Drei vom User gemeldete Defekte machen die Grundbedienung des Systembretts unzuverlässig
(Ticket T002006):

1. **Mehrfach-Spawn kaputt:** Doppelklick auf freien Boden spawnt nur, wenn keine Figur
   selektiert ist — der Boot-Seed selektiert aber sofort eine Figur, daher teleportiert
   jeder weitere Doppelklick nur die selektierte Figur statt zu spawnen
   (`brett/src/client/board-boot.ts`, dblclick-Handler).
2. **Vorlagen-Dropdown leer:** `GET /api/templates` liest `process.env.BRAND`, die reale
   Env-Var heißt überall `BRETT_BRAND` → Brand-Fallback greift immer; zusätzlich werden
   Fetch-Fehler in `lobby.ts` still verschluckt (leeres Dropdown ohne Hinweis).
3. **Dropdowns nicht app-konform:** Vier native `<select>`-Stellen mit inkonsistentem
   Ad-hoc-Styling statt der `--brett-*`-Design-Tokens.

Sekundär: Spawn bei nicht-offenem WebSocket geht still verloren (lokale Geisterfigur,
verschwindet beim nächsten Snapshot).

## What

- Doppelklick auf freien Boden spawnt IMMER eine neue Figur; die Entscheidung wird als
  pure Funktion `dblclickFloorAction()` nach `brett/src/client/board-dblclick.ts`
  extrahiert (testbar, Kontext-Injektion gemäß T001931).
- `admin.ts` löst die Brand über `BRETT_BRAND` (Fallback `BRAND`, dann `'mentolder'`) auf.
- Lobby-Dropdown zeigt disabled Feedback-Optionen: "Keine Vorlagen vorhanden" (leer)
  bzw. "Vorlagen konnten nicht geladen werden" (Fetch-Fehler).
- Gemeinsamer Token-basierter Select-Styler `styleSelect()` in `ui/primitives.ts`,
  angewandt in `hud.ts`, `topbar-participants.ts`, `zone-editor.ts`.
- Spawn ohne offenen WS zeigt einen HUD-Hinweis (`spawnOfflineNotice`).

Design-Spec: `docs/superpowers/specs/2026-07-20-brett-controls-rework-design.md`

_Ticket: T002006_
