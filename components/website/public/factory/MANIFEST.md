# Factory Floor — Asset-Manifest (D1)

Deko-Assets für `/dev-status` (FactoryFloor.svelte). **Graceful:** fehlt eine
Datei, blendet die Komponente das `<img>` per `onerror` aus und der CSS-Platzhalter
greift. Stabile Pfade → Asset-Swap ohne Code-Änderung. `public/` wird beim
Website-Deploy automatisch mitgezogen.

## Palette (mentolder Brass-Gold + Ink)
- Gold: `oklch(0.80 0.09 75)` (`--color-gold` aus `website/src/styles/global.css`)
- Gold-light: `oklch(0.86 0.09 75)` (`--color-gold-light`)
- Ink/Dunkel: `#0b111c` (`--color-dark`), `#101826` (`--color-dark-light`)
- Blockiert/Rot: Tailwind `red-500`
- Hintergrund: **transparent** (Komponente liegt auf `bg-dark`)

## Benötigte Dateien (alle SVG, transparenter Hintergrund)

| Pfad | Zweck | Maße (Richtwert) |
|------|-------|------------------|
| `station-scout.svg`     | Stations-Icon Scout      | 64×64 |
| `station-design.svg`    | Stations-Icon Design     | 64×64 |
| `station-plan.svg`      | Stations-Icon Plan       | 64×64 |
| `station-implement.svg` | Stations-Icon Implement  | 64×64 |
| `station-verify.svg`    | Stations-Icon Verify     | 64×64 |
| `station-deploy.svg`    | Stations-Icon Deploy     | 64×64 |
| `conveyor.svg`          | Fließband-Textur (tilebar) | 320×24 |
| `workpiece-idle.svg`    | Werkstück, wartend       | 32×32 |
| `workpiece-active.svg`  | Werkstück, in Bearbeitung| 32×32 |
| `workpiece-blocked.svg` | Werkstück, blockiert (rot)| 32×32 |
| `workpiece-done.svg`    | Werkstück, fertig        | 32×32 |
| `hall-backdrop.svg`     | (optional) Hallen-Hintergrund | 1280×400 |

## Hinweise für Claude Design
- Icons monochrom in Gold auf transparent (die Komponente setzt den Hintergrund).
- Werkstück-States visuell klar trennbar (Form/Farbe), nicht nur per Farbe (a11y).
- Keine eingebetteten Rasterbilder; reines SVG, < 8 KB pro Datei.
