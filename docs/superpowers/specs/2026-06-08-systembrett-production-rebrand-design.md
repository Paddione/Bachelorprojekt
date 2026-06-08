# Systembrett — Production-Readiness & Mentolder Voll-Rebrand

**Datum:** 2026-06-08
**Branch:** `feature/systembrett-production-rebrand`
**Ziel (`/goal`):** Systembrett ist bereit für den produktiven Einsatz und nach Mentolder-Brand designt.
**Design-Referenz (Menü):** [`assets/2026-06-08-brett-menu-final.html`](assets/2026-06-08-brett-menu-final.html) — im Browser öffnen.

---

## 1. Kontext & Ausgangslage

`brett` (Systembrett) ist eine Single-Page-3D-App mit drei Phasen: **Menü (A) → Lobby/Kontrollraum (B) → 3D-Board (C+)**, ausgeliefert über `k3d/brett.yaml` (`:latest`, Deploy via `task feature:brett`). Die GUI ist bereits token-getrieben über `brett/src/client/ui/theme.ts`.

**Zentraler Befund der Codebase-Exploration:** Auf Token-Ebene ist brett bereits zu ~90 % „Mentolder" — `theme.ts` definiert dieselben Werte wie das Website-Brand-System (`website/src/styles/global.css`): Brass `oklch(0.80 0.09 75)`, Sage `oklch(0.80 0.06 160)`, Ink `#0b111c`, Schriften Geist / Newsreader / Geist Mono, Radius `22px`, gleiches Easing. Es ist also **kein Rebrand von Null**, sondern Drift-Bereinigung + Veredelung + Production-Readiness.

Die Arbeit verteilt sich auf zwei Achsen:

**Achse 1 — Brand/Design-Drift.** Es existieren *zwei* parallele Token-Vokabulare:
- Menü + Lobby: sauber auf `--brett-*` (= Mentolder).
- 3D-Board-Chrome (`public/index.html`-Inline-CSS, `ui/hud.ts`, `ui/onboarding.ts`): ein **älteres** Set mit hartkodierten Werten (`#0e1014`, `#e7ead0`, `--parchment-2`, `--hairline-soft`), das das `--brett-*`-System umgeht.

**Achse 2 — Production-Readiness** (aus dem GUI-Audit, siehe §7): fehlende `:disabled`/`:focus-visible`-States, fehlende `aria-label` an Icon-Buttons, keine Focus-Traps/ESC in Modals, `console.*` im Prod-Code, stille Async-Fehlschläge, lückenhaftes Mobile, Touch-Targets < 44 px.

---

## 2. Getroffene Entscheidungen (Brainstorming)

| Achse | Entscheidung |
|------|-------------|
| **Umfang** | **Vollausbau** — Menü + Lobby + Board-Chrome, plus tiefes a11y-/Mobile-Overhaul, Verbindungs-Status-UI, vollständige Cruft-Bereinigung, Vereinheitlichung aller Modal-Muster. |
| **Ausführungsweg** | **Software Factory (DeepSeek)** via Plan-Reuse — autonome Umsetzung des präskriptiven Plans. |
| **Brand-Tiefe** | **Voll-Rebrand** — Token-Cleanup + Familien-Kohäsion (Wortmarke, Grain, Konstellations-Motiv, Stimme) + neue Identitätselemente (Hero-Visual). |
| **Visuelle Richtung** | **Blend A+C** — editorial-ruhige Basis (A) + Konstellation als dezente Bühne über das ganze Panel (C), oben gekrönt vom Hero-Banner. Bestätigt am finalen Menü-Mockup. |
| **Neue Funktion** | **Offene Sessions als Live-Liste** im Menü (joinbar, Klick zum Beitreten) — ergänzt den Code-Beitritt. **Netto-neue Funktion**, braucht Backend-Endpoint. |

### 2.1 Liefermodell — „Claude Design Injection into the Software Factory"

Weil DeepSeek (der Factory-Executor) bei Design-/Build-Urteil nachweislich schwach ist, werden **alle** Gestaltungsentscheidungen in diese Planungsphase verlagert. Konkret:

1. **Opus erzeugt vorab** alle urteilslastigen Artefakte: diese Spec, den finalen Menü-Mockup (HTML/CSS, committet als Asset), die Token-Drift-Map (§4) und einen **maximal präskriptiven Plan** mit exakten Werten + `file:line`-Edits.
2. **Die Factory führt nur mechanisch aus** (Plan-Reuse, kein Neu-Planen): `bash scripts/ticket.sh enqueue --id <T-ID> --branch feature/systembrett-production-rebrand --plan <plan-pfad>`.
3. **Review-Gate:** Da Design-Qualität DeepSeeks Schwachstelle ist, wird der resultierende PR vor Merge visuell gegen das Menü-Asset geprüft (Acceptance-Kriterien §10). Genuin design-sensible Restteile (falls die Factory sie nicht trifft) werden per `dev-flow-execute` (Opus) nachgezogen.

**Was der Nutzer aus dieser Phase erhält:** (a) diese Spec, (b) das standalone Menü-Design-Asset, (c) der präskriptive Plan, (d) der Enqueue-Handoff.

---

## 3. Architektur & Einheiten (Isolation)

Bestehende, beizubehaltende Struktur (gut isoliert, testbar):
- **`ui/theme.ts`** — SSOT aller Design-Tokens (`injectTheme`). **Hierher** wandern alle bisher hartkodierten/`--parchment`-Werte.
- **`ui/primitives.ts`** — `Panel/Button/Field/Drawer/RosterItem/Badge`. Wird um fehlende States (`:disabled`, `:focus-visible`, ghost/danger-Hover) erweitert.
- **`ui/menu.ts`**, **`ui/lobby.ts`** — Screen-Renderer (pures Model + DOM).
- **`board-boot.ts`**, `ui/fig-panel.ts`, `ui/appearance.ts`, `ui/hud.ts`, `ui/onboarding.ts`, `public/index.html` — Board-Chrome.

Neue Einheiten:
- **`ui/sessions.ts`** — reines View-Model + Renderer für die Offene-Sessions-Liste (analog `lobby.ts`: pure `buildOpenSessionsViewModel(state)` + `mountOpenSessions(container, vm, handlers)`). Importierbar/testbar ohne DOM.
- **`open-sessions-client.ts`** — Fetch/Polling-Client (`fetchOpenSessions()`), reine Datenfunktionen separat von DOM.
- **Server:** neuer Read-Endpoint (siehe §6) + Aufzählung der In-Memory-Session-Registry.
- **`ui/toast.ts`** — zentrales, gescoptes Feedback-System (Error/Success/Info) — ersetzt stille Fehlschläge und `console.*`-only-Pfade.
- **`ui/a11y.ts`** — Hilfen für Focus-Trap + ESC-to-close + Focus-Restore, von allen Modals/Drawers genutzt (eine Implementierung, kein Copy-Paste).

Designprinzip: jede Einheit hat einen klaren Zweck, ein definiertes Interface, ist ohne ihre Internas verständlich und einzeln testbar.

---

## 4. Design-System — Token-Vereinheitlichung (Achse 1)

**Regel:** Ein einziges Vokabular — `--brett-*` (definiert in `theme.ts`). Jeder hartkodierte Farb-/Linien-/Schriftwert in der GUI wird durch das passende Token ersetzt. Keine zweite Token-Sprache mehr.

### 4.1 Drift-Map (alt → kanonisch)

| Altwert / Legacy-Var (Fundort) | Kanonisches Token | Wert |
|---|---|---|
| `#0e1014` (`public/index.html` body/topbar) | `--brett-ink-900` | `#0b111c` |
| `#e7ead0` (Parchment-Text, `index.html`, `hud.ts`) | `--brett-fg` | `#eef1f3` |
| `--parchment-2`, `#b9bda3` (online-indicator, hud) | `--brett-mute` | `#8c96a3` |
| `--hairline-soft`, `rgba(231,234,208,0.08)` | `--brett-line` | `rgba(255,255,255,.07)` |
| `rgba(11,17,28,0.82)` (note billboard, hud.ts) | über `resolveToken('--brett-ink-900')` | — |
| `rgba(200,169,110,0.7)` (note billboard accent) | über `resolveToken('--brett-brass')` | `oklch(0.80 0.09 75)` |
| Onboarding inline `rgba(20,22,18,0.88)` / `#fff` (`onboarding.ts`) | `--brett-ink-850` / `--brett-fg` | `#101826` / `#eef1f3` |

> Canvas-gerenderte Werte (hud-Badges, note-Billboards) müssen weiter Hex/rgba sein — aber **aufgelöst via `resolveToken(name, fallback, getVar)`** aus `ui/skin.ts`, nicht hartkodiert. So bleibt `theme.ts` SSOT.

### 4.2 Verbindliche Marken-Tokens (bereits in `theme.ts`, ggf. zu ergänzen)

```
brass      oklch(0.80 0.09 75)     Akzent: Buttons, Links, Eyebrows, Hero-Knoten
brass-2    oklch(0.86 0.09 75)     Hover + serif-italic Emphase
sage       oklch(0.80 0.06 160)    Sekundär: Status „läuft", Trenner-Punkte
fg         #eef1f3                 Primärtext         fg-soft  #cdd3d9
mute       #8c96a3                 Tertiärtext        mute-2   #6a727e
ink-900    #0b111c (Panel-BG)      ink-850 #101826    ink-800 #17202e (Karten)
line       rgba(255,255,255,.07)   line-2  rgba(255,255,255,.12)
font-serif "Newsreader" · font-sans "Geist" · font-mono "Geist Mono"
radius 22px / 12px / 999px · ease 200ms · hover translateY(-1px)
```

### 4.3 Marken-Muster (aus dem Menü-Asset, auf alle Screens anzuwenden)

- **Eyebrow:** 26×2px Brass-Balken + Mono-Uppercase-Label (`letter-spacing .15em`), Sage-Punkt als Trenner.
- **Wortmarke:** Serif „mentolder." mit Brass-Punkt.
- **Konstellations-Motiv:** Figuren-Knoten (brass/sage/fg) + dünne Brass-Kanten — als Hero-Krone und als dezente Vollflächen-Bühne (~14 % Deckkraft, radial gemaskt). Markensignatur des Produkts.
- **Textur:** Film-Grain-Overlay (SVG-Turbulence, ~20 %, `mix-blend-mode: overlay`) + weicher Brass-Radial-Glow.
- **Buttons:** Primary = Brass-BG/Ink-Text/Pill; Ghost = transparent/`line-2`-Border/Pill, Hover → Brass.
- **Motion:** dezent, `prefers-reduced-motion` schaltet alle Animationen ab.

---

## 5. Screen-für-Screen-Redesign (Achse 1+2)

### 5.1 Menü (`ui/menu.ts`, `public/index.html` `#brett-menu`)
**Final, freigegeben** — siehe Design-Asset. Umfasst: Hero-Krone + Bühne, Wortmarke/Eyebrow, Newsreader-Headline mit italic-brass Emphase, Subtitle; Primary „Neue Session starten"; Code-Beitritt (Input + Ghost-Button); **Offene-Sessions-Liste** (§6); deaktivierte Items „Gespeicherte Aufstellungen"/„Einstellungen" mit „bald verfügbar"-Tag; Footer Identität + Abmelden. Alle States (`:hover`, `:focus-visible`, disabled) und `aria-label` sind im Asset definiert und gelten als Implementierungsvorgabe.

### 5.2 Lobby / Kontrollraum (`ui/lobby.ts`)
Gleiche Sprache anwenden: Header mit Eyebrow + Session-Code + Copy (mit **Success-Feedback**, §7); Roster-Panel (RosterItem/Badge in Tönen leiter/stellvertreter/beobachter); Settings-Panel; Coaching-Editor (Textarea, prefilled — Verhalten beibehalten, Optik angleichen). Konstellation als dezente Bühne hinter dem Grid. Bereits token-sauber → primär Veredelung + States/a11y.

### 5.3 Board-Chrome (`public/index.html`, `board-boot.ts`, `ui/fig-panel.ts`, `ui/appearance.ts`, `ui/hud.ts`, `ui/onboarding.ts`)
- **Topbar:** alle Inline-Hex auf Tokens (§4.1); `:disabled`/`:focus-visible` für `.preset-btn`/`.icon-btn`/Export; Mobile-Scroll-Schatten-Indikator; `aria-label` für alle Icon-/Emoji-Buttons (Presets, Export PNG/JSON/PDF, Aussehen).
- **Figur-Panel & Aussehen-Drawer:** Token-Cleanup; Focus-Trap + ESC + Focus-Restore (`ui/a11y.ts`); Grids als semantische Listen (`role="list"`); Lade-/Leer-Zustände für Thumbnail-Grids; vereinheitlichtes Öffnen/Schließen-Muster (eine Drawer-Mechanik statt drei).
- **HUD / Status-Pill / Onboarding-Toasts:** hartkodierte Farben raus (§4.1); Onboarding nutzt das zentrale Toast-/Token-System; Lock-Badges/Note-Billboards via `resolveToken`.
- **Konstellations-Motiv** dezent als Marken-Signatur ins Board-Leerflächen-Branding (optional, nicht über die 3D-Szene legen).

---

## 6. Neue Funktion — Offene Sessions (Live-Liste)

### 6.1 Frontend (`ui/sessions.ts`, `open-sessions-client.ts`)
- Im Menü gerendert (Design im Asset): Abschnitt „Offene Sessions" mit Mono-Eyebrow + Count-Badge; Zeilen mit Status-Punkt (sage=läuft / brass=wartet), Titel, Code (mono), Leitung, Teilnehmerzahl; Hover/Focus blendet „Beitreten"-Pille ein; Klick → bestehender Join-Flow (`/api/join?code=…`).
- **Pflicht-States (Production-Readiness):**
  - **Loading:** dezente Skeleton-Zeilen während des Fetch.
  - **Empty:** „Aktuell keine offenen Sessions" + Hinweis, per Code beizutreten.
  - **Error:** Inline-Hinweis + „Erneut versuchen" (kein stiller Fehlschlag).
- **Refresh:** Polling alle ~5 s, solange das Menü sichtbar ist (kein WS nötig); Pause, wenn Tab/Menü nicht aktiv.

### 6.2 Backend (`brett/src/server/…`)
- **Neuer Read-Endpoint** `GET /api/sessions/open` (auth-gated wie der Rest), liefert die aktiven Sessions aus der In-Memory-Session-Registry.
- **Response-Shape:**
  ```json
  { "sessions": [
    { "code": "KRB-9A2", "title": "Führungsteam Q3", "leiterName": "Patrick",
      "participantCount": 3, "status": "laeuft" }
  ] }
  ```
- **`status`:** `"laeuft"` (Runde aktiv) | `"wartet"` (in Lobby). Abgeleitet aus der Session-Phase.
- **Sichtbarkeit (Entscheidung):** Default = alle aktiven Sessions für authentifizierte Nutzer sichtbar (internes Coaching-Tool). *Offen für Review:* feinere Sichtbarkeit (nur eigene/eingeladene). Bis dahin: keine sensiblen Inhalte im Listing — nur Code/Titel/Leitung/Anzahl/Status.
- **Tests:** Server-Unit-Test für das Mapping Registry → Response-Shape (inkl. leerer Liste, Phasen→status).

---

## 7. Production-Readiness — verbindliche Anforderungen (Achse 2)

Aus dem GUI-Audit, jetzt als Akzeptanz-Anforderungen:

**P1 (blockierend):**
1. `:disabled` + `:focus-visible` an **allen** interaktiven Elementen (Topbar-Buttons, Presets, Export, Menü-/Lobby-Buttons, Session-Zeilen, Input).
2. `aria-label` an allen Icon-/Emoji-Buttons; Join-Zeilen mit beschreibendem Label (im Asset vorhanden).
3. Focus-Trap + ESC-to-close + Focus-Restore für Figur-Panel, Aussehen-Drawer, Menü/Lobby-Overlays (`ui/a11y.ts`).
4. **Keine `console.*` im Prod-Pfad** — entfernen oder hinter Debug-Flag (`board-boot.ts:496/515/527/547`, `ws-client.ts:561`, `export.ts:192`). Top-Level-`getElementById(...)!` (`hud.ts:6`, `appearance.ts:81-85`) absichern.
5. **Sichtbares Fehler-/Erfolgs-Feedback** über `ui/toast.ts`: Template-Fetch-Fehler, PDF/PNG/JSON-Export, Auth-Ausfall, Session-Join-Fehler.

**P2:**
6. Onboarding/HUD-Farben auf Tokens (§4.1).
7. Lade-/Leer-Zustände für Appearance-/Persons-Grids.
8. Einheitliche Button-Feedback-Muster (PNG/JSON wie PDF mit State; Copy/Coaching-Save mit Success-Toast).
9. Inline-Validierung des Join-Codes (Text statt nur Border-Farbe).
10. **Verbindungs-Status-Indikator** statt nur Online-Count: „verbunden / verbindet … / getrennt" (aus `ws-client.ts`-Zuständen).
11. Mobile: vollständige Breakpoints für Drawer/Panels/Modals; Touch-Targets ≥ 44 px; Topbar-Scroll-Schatten.
12. Deaktivierte Menü-Items mit klarem „bald verfügbar"-Tag (im Asset vorhanden).

**P3:**
13. Feature-Flag-Reads (`window.__brettFeatures`) in eine Utility konsolidieren.
14. UI-Copy konsistent **Deutsch**: gemischte EN-Labels prüfen (Pose-Presets „Stand/Kneel/…", „PHYS/IK"). *Entscheidung:* Pose-Presets ins Deutsche (z. B. „Stehen/Knien/Liegen/Kriechen/Hocken/T-Pose") — im Plan final festlegen.
15. Tastatur-Hinweise (Shortcuts) im Status-Pill/Tooltip.

---

## 8. Konsistenz & Footguns (brett-spezifisch)

- **`:latest`-Image beibehalten** (`k3d/brett.yaml`) — CI warnt, ist gewollt; Deploy via `task feature:brett`.
- **Proto-/Asset-Footguns** (arena/brett): keine Änderung am 3D-Renderer/Szene-Logik; nur GUI-Layer + neuer Read-Endpoint.
- **Token-SSOT:** niemals an `theme.ts` vorbei hartkodieren; Canvas-Werte via `resolveToken`.
- **`prefers-reduced-motion`** respektieren (Grain/Glow/Konstellation/Puls abschalten).

---

## 9. Testing

- **Unit (node:test / vitest, offline):** `lobby-template-fill` (bestehend), neu: `sessions`-View-Model (Mapping, leere Liste, status-Ableitung), `open-sessions-client` (Parsing/Fehlerpfad), `a11y`-Focus-Trap-Logik (pur), `toast`-Queue.
- **Server-Unit:** `/api/sessions/open` Registry→Shape.
- **Typecheck-Gate:** brett TS-Typecheck muss grün sein (CI-Gate aktiv).
- **`task test:all`** offline grün; **`task test:factory`** falls FA-SF berührt (nicht erwartet).
- **E2E (Playwright, nach Deploy):** Menü rendert mit Sessions-Liste, Join-Zeile fokussierbar + per Tastatur bedienbar, Modals fangen Fokus, Empty-State sichtbar wenn keine Sessions. Projektzuordnung im Plan.

---

## 10. Akzeptanz-Kriterien (Review-Gate vor Merge)

1. Kein hartkodierter Farb-/Linienwert mehr in der GUI außerhalb `theme.ts` (Drift-Map §4.1 vollständig abgearbeitet) — per grep verifizierbar.
2. Menü entspricht dem Design-Asset (Hero-Krone, Bühne, Sessions-Liste, States).
3. Alle P1-Anforderungen erfüllt; `grep -rn "console\." brett/src/client` im Prod-Pfad leer (oder Debug-gated).
4. `GET /api/sessions/open` liefert das Shape; Menü zeigt Loading/Empty/Error.
5. Tastatur-Durchlauf Menü→Lobby→Board ohne Fokus-Falle; Modals ESC-schließbar.
6. `task test:all` + brett-Typecheck grün.
7. `prefers-reduced-motion` schaltet Animationen ab.

---

## 11. Out of Scope (YAGNI)

- Keine Änderung an der 3D-Szene/Physik/IK oder am WS-Protokoll (außer dem additiven Read-Endpoint).
- Kein i18n-Framework (nur konsistentes Deutsch).
- „Gespeicherte Aufstellungen" / „Einstellungen" bleiben deaktiviert („bald verfügbar") — nur die Offene-Sessions-Liste wird neu gebaut.
- Keine feingranulare Sessions-Sichtbarkeit/Berechtigung in dieser Iteration (notiert für später, §6.2).

---

## 12. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| **DeepSeek-Build-Qualität** (design-sensibel) | Maximal präskriptiver Plan (exakte Werte + `file:line`), committetes Menü-Asset als Ziel, Review-Gate (§10), Opus-Nachzug per `dev-flow-execute` für verfehlte design-sensible Teile. |
| Token-Cleanup bricht Board-Optik | Drift-Map 1:1 (gleiche Farbsemantik), visuelle Vorher/Nachher-Prüfung am Board. |
| Sessions-Endpoint leakt sensible Daten | Listing enthält nur Code/Titel/Leitung/Anzahl/Status; Sichtbarkeit als Review-Punkt. |
| Animationen/Performance auf schwachen Geräten | `prefers-reduced-motion`, dezente Deckkraft, keine Animation über die 3D-Szene. |

## 13. Deployment

`task feature:brett` (baut + importiert/pusht `:latest`, beide Brands). Nach Deploy: `kubectl exec` in den brett-Pod und ausgeliefertes `dist/client` prüfen (nicht nur Pod-Ready), dann E2E (§9).
