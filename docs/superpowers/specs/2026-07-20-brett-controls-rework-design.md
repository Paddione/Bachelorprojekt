---
ticket_id: T002006
plan_ref: openspec/changes/brett-controls-rework/tasks.md
status: active
date: 2026-07-20
---

# Systembrett Controls Rework — Design-Spec

## Kontext

Drei vom User gemeldete Defekte im Systembrett (`brett/`), Ticket T002006:

1. Mehrfaches Spawnen von Figuren funktioniert nicht.
2. Das Vorlagen-Dropdown in der Lobby erscheint leer.
3. Die Dropdown-Menüs wirken stilistisch nicht app-konform.

## Root-Cause-Analyse

### 1. Mehrfach-Spawn

`brett/src/client/board-boot.ts` (dblclick-Handler): Doppelklick auf freien Boden spawnt nur,
wenn **keine** Figur selektiert ist — sonst wird die selektierte Figur teleportiert
(`easeFigure`). Da der Boot-Seed (`board-boot.ts:464`) sofort eine Figur erzeugt UND
selektiert (`addFigure` → `selectFigure`), ist praktisch immer eine Figur selektiert:
Jeder weitere Doppelklick verschiebt statt zu spawnen. Der Nutzer erlebt: "es geht nur
eine Figur".

Sekundär: `fig-panel.ts addFigure` sendet `sendAddFigure` nur bei offenem WebSocket —
sonst bleibt die Figur rein lokal und verschwindet beim nächsten Server-Snapshot,
ohne Feedback.

### 2. Leere Preset-/Vorlagen-Dropdowns

`brett/src/server/routes/admin.ts` (`GET /api/templates`) liest `process.env.BRAND` —
die reale Env-Var heißt aber überall `BRETT_BRAND` (`auth.ts resolveBrand`,
`k3d/brett.yaml`). `BRAND` ist nie gesetzt → Fallback `'mentolder'` greift immer;
unter anderer Brand geseedete Coaching-Templates sind unsichtbar.
Zusätzlich verschluckt `lobby.ts` beide Template-Fetch-Fehler still
(`.catch(() => {})`) — 500er/leere Tabellen ergeben ein kommentarlos leeres Dropdown.

### 3. Dropdown-Styling

Vier native `<select>`-Stellen mit je eigenem Ad-hoc-Styling:
`ui/lobby.ts` (`.brett-lobby__select`, token-basiert — Referenz-Look),
`ui/hud.ts` (Sprachwahl, inline transparent/brass), `ui/topbar-participants.ts`
(Rollen), `ui/zone-editor.ts` (Zonen-Variante). Kein gemeinsamer Styler; auf dunklem
UI klappen Options teils hell/unlesbar auf.

## Entscheidungen

- **D1 — Doppelklick spawnt immer:** Doppelklick auf freien Boden erzeugt IMMER eine
  neue Figur, unabhängig von der Selektion. Der Doppelklick-Teleport entfällt
  (Bewegen geht weiterhin per Drag). Doppelklick auf eine Figur öffnet weiterhin den
  Appearance-Drawer (unverändert). Die Entscheidung wird als pure Funktion
  `dblclickFloorAction()` in ein neues Modul `brett/src/client/board-dblclick.ts`
  extrahiert (testbar ohne DOM/three; Kontext-Injektion gemäß T001931 — kein
  modul-globaler State).
- **D2 — Brand-Env vereinheitlichen:** `admin.ts` nutzt
  `process.env.BRETT_BRAND || process.env.BRAND || 'mentolder'` — identisch zur
  `resolveBrand`-Konvention in `auth.ts`.
- **D3 — Dropdown-Feedback:** Fehlgeschlagene Template-Fetches erzeugen eine
  disabled Option "Vorlagen konnten nicht geladen werden"; eine leere Liste erzeugt
  eine disabled Option "Keine Vorlagen vorhanden". Kein stiller Leerlauf mehr.
- **D4 — Zentraler Select-Styler:** Neue Funktion `styleSelect(el)` in
  `ui/primitives.ts`, die die `.brett-lobby__select`-Optik als Token-Styles setzt
  (`--brett-ink-850`-Hintergrund, `--brett-fg`, `--brett-line-2`-Border, radius 8px,
  dunkle Options). Angewandt in `hud.ts` (Sprachwahl), `topbar-participants.ts`,
  `zone-editor.ts`. `lobby.ts` behält seine CSS-Klasse (bereits konform).
- **D5 — Spawn-Feedback:** Ist der WebSocket beim Spawn nicht offen, zeigt der Client
  einen HUD-Hinweis (bestehender Toast-Mechanismus), statt die Figur still lokal
  verschwinden zu lassen.

## Nicht-Ziele

- Server-Permission-Modell (leiter/stellvertreter/beobachter) bleibt unverändert.
- Kein Custom-Dropdown-Widget — native `<select>` bleibt (A11y).
- 200-Figuren-Cap bleibt.

## Verifikation

- Strukturelle RED→GREEN-Tests in `tests/spec/brett.bats` (SSOT `openspec/specs/brett.md`).
- Verhaltens-Tests in `brett/test/` (node:test, `MOCK_DB=true`).
- `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
