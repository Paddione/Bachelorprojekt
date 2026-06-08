# Brett appearance-assets — Design Spec

**Datum:** 2026-06-08
**Branch:** `feature/brett-appearance-assets`
**Scope:** Erster produktiver Inkrement — 3 neue Gesichts-Emotionen + 2 neue Accessoires für den Brett figure-pack, generiert mit dem `atelier` MCP (headless Pixel-Art-Editor) und in die bestehende appearance-Maschinerie integriert.

## Ziel & Motivation

Der Brett figure-pack bietet aktuell ~12 emotionale Gesichts-„Stances" (neutral, observing, distant, overwhelmed, protective, yearning, resolved, withdrawn, present, mourning, curious, blocked) plus 5 benannte Portraits, sowie 23 Accessoires. Für systemische Aufstellungsarbeit fehlen einige emotional distinkte Ausdrücke. Eine vorausgegangene Machbarkeits-Demo hat bestätigt, dass `atelier` den flach-minimalistischen Brett-Stil bei den figure-pack-Nativgrößen (512²/256²) gut trifft. Dieser Inkrement liefert eine klein kuratierte, sofort wählbare Erweiterung.

## Asset-Liste (Deliverable)

### Gesichter — 512×512 RGBA PNG, transparent, dunkle Striche (`#1b1f28`)

Stil-Referenz: `brett/public/assets/figure-pack/faces/neutral.png` — weich-abgerundete Striche, zentriert bei u/v=0.5 (Vorderseite der Kopf-Sphere). Anwendung als `MeshLambertMaterial.map` mit `alphaTest: 0.5`.

| Name | Ausdruck | Abgrenzung zu Bestehendem |
|------|----------|---------------------------|
| `relieved` | Geschlossene, zufriedene Augen (◠◠) + weiches Aufatmen-Lächeln (‿) | Positive Auflösung — gibt es noch nicht |
| `defiant` | Nach innen-unten geknickte Brauen + flacher/harter Mund | Feindselig/standhaltend — vs. `protective` (schützend, nicht aggressiv) |
| `fearful` | Weite runde Augen (○○) + kleiner, knapper Mund | Angst/Alarm — vs. `overwhelmed` (Reizüberflutung, Brauen hoch) |

Emotionaler Spread: positiv-ruhig / feindselig / ängstlich — alle im minimalen Strich-Stil eindeutig unterscheidbar.

### Accessoires — 256×256 RGBA PNG, Palette aus `colors_and_type.css` (Sage/Brass/Skin)

Stil-Referenz: `brett/public/assets/figure-pack/accessories/coat.png` — flache Formen, gedämpfte erdige Palette. Anwendung als billboardetes Sprite an einem Bone.

| Name | Slot (`ACC_GROUPS`) | Platzierung |
|------|---------------------|-------------|
| `scarf` | `upper` | `bone: neck`, spiegelt die `shawl`-Platzierung (`anchorPx [128,80]`, `billboard yAxis`, leichter Z-Vorschub gegen Torso-Clipping). Etwas schmaler als shawl (`sizeMeters ~[0.7,0.7]`) |
| `spectacles` | `head` | `bone: head`, `billboard yAxis`, auf Augenhöhe positioniert (`positionOffset` so gewählt, dass die Brille vor der Gesichts-Sphere auf u/v≈0.5 sitzt, nicht auf dem Scheitel wie `cap`/`crown`) |

## Integration — betroffene Dateien

Faces und Accessoires nutzen die vorhandene spec-getriebene „build-once"-Maschinerie. Kein neues Subsystem.

### Gesichter (null Code-Änderung)
1. Drei PNGs nach `brett/public/assets/figure-pack/faces/{relieved,defiant,fearful}.png`.
2. Drei Einträge unter `"faces"` in `brett/public/assets/figure-pack/placement_spec.json`:
   ```json
   "relieved": { "file": "faces/relieved.png", "stance": "eased, present — soft closed eyes and a quiet smile" }
   ```
   (analog `defiant`, `fearful` mit passender `stance`-Beschreibung).
3. Keine TS-Änderung: `appearance.ts` liest die Liste dynamisch via `Object.keys(PLACEMENT_SPEC.faces)`; `presets.ts` validiert serverseitig gegen dieselben Keys.

### Accessoires
1. Zwei PNGs nach `brett/public/assets/figure-pack/accessories/{scarf,spectacles}.png`.
2. Zwei Einträge unter `"accessories"` in `placement_spec.json` mit vollständigen Platzierungs-Metadaten (`file`, `bone`, `anchorPx`, `sizeMeters`, `positionOffset`, `rotation`, `billboard`, `notes`) — `scarf` nach Vorbild `shawl`, `spectacles` nach Vorbild `cap`/`crown` aber auf Augenhöhe statt Scheitel.
3. `brett/src/client/ui/appearance.ts` — `ACC_GROUPS` erweitern: `scarf` in die `upper`-Liste, `spectacles` in die `head`-Liste. (Dies ist die einzige hardcodierte Liste; Platzierungs-Details kommen aus der Spec.)

## Asset-Generierung (atelier)

Workflow je Asset: `doc_create` → `doc_batch` (Zeichen-Ops) → `doc_render` → visuelle Inspektion → iterieren → `doc_render scale=1 out_path=<worktree>/brett/public/assets/figure-pack/...`.

- `relieved` (512²) und `scarf` (256²) wurden in der Demo bereits gebaut und visuell bestätigt; ihre atelier-Docs werden wiederverwendet/neu exportiert.
- `defiant` (512²), `fearful` (512²), `spectacles` (256²) werden neu generiert.
- Palette (verifiziert aus `colors_and_type.css`): sage `#b8c0a8`, sage-deep `#8e9a7c`, sage-soft `#cdd4c0`, skin `#d9c89b`, brass `#c8a96e`, brass-deep `#8a7244`; Gesichts-Striche dunkles Slate `#1b1f28`.
- atelier-Footgun: die `ellipse`-Op akzeptiert kein `size` — dicke Ringe aus zwei konzentrischen Ellipsen (außen füllen, innen mit `[0,0,0,0]` ausradieren).

## Verifikation

1. **Pro Asset:** atelier-Render visuell prüfen (Ausdruck lesbar? Stil konsistent mit Nachbar-Assets? Palette korrekt?).
2. **Spec-Validität:** `placement_spec.json` bleibt valides JSON; alle neuen `file`-Pfade existieren.
3. **In-Game:** appearance-Drawer öffnet, die 3 Gesichter erscheinen im Faces-Grid und applizieren korrekt auf die Kopf-Sphere; `scarf`/`spectacles` erscheinen in ihren Slots und billboarden korrekt ohne Clipping. Abgedeckt via dev-flow-execute / Playwright-E2E gegen die Live-Umgebung.
4. **Offline-Tests:** `task test:all` grün (Brett-Typecheck-Gate inкl.).

## Bewusst NICHT in diesem Inkrement

Je eigenes Folge-Ticket — separate Subsysteme mit deutlich höherem Aufwand:

- **Props/Terrain-Rendering** — die SVGs in `public/assets/props/` + `terrain/` sind aktuell an keinen Loader/Renderer angebunden; Integration = neues Subsystem (Loader, Registry, Platzierungs-UI).
- **Beziehungslinien-Glyphen** — `scene-lines.ts` existiert, ist aber feature-gated (`sf-t000467`) und ohne UI; ein Mittelpunkt-Glyph ist moderat aufwendig und gehört in ein eigenes Ticket.

## Deploy

Push-basiert nach beiden Brands (kein GitOps-Reconciler auf fleet). Brett wird via `task feature:brett` (oder äquivalentem Deploy-Task laut Oracle) für mentolder **und** korczewski neu gebaut/ausgerollt.
