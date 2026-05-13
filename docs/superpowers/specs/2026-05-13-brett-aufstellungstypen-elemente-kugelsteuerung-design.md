# Brett: Aufstellungstypen, Erweiterte Elemente & Kugelsteuerung

**Datum:** 2026-05-13  
**Status:** Genehmigt  
**Scope:** `brett/public/index.html`, `brett/public/art-library/`  
**Branch:** `feature/brett-aufstellungstypen-elemente`

---

## Zusammenfassung

Drei zusammenhängende Erweiterungen für das systemische Brett:

1. **Aufstellungstypen** — Dropdown in der Toolbar zur Auswahl des Kontext-Typs (Familienaufstellung, Organisationsaufstellung, Tetralemma, Inneres Team)
2. **Erweiterte Elemente** — 29 neue SVG-Figuren in 6 Kategorien; Toolbar zeigt Kategorie-Tabs
3. **Kugelsteuerung** — Port der `ctrlBall`-Interaktion aus `brett-v2.html` in `index.html`

`brett-v2.html` wird nach dem Port gelöscht.

---

## Feature 1: Aufstellungstyp-Dropdown

### Verhalten

- In der Toolbar ganz links: `<select id="constellation-type">` mit Optionen:
  - `""` → `— frei —` (Standard)
  - `familie` → `👨‍👩‍👧 Familienaufstellung`
  - `organisation` → `🏢 Organisationsaufstellung`
  - `tetralemma` → `◇ Tetralemma`
  - `inneres-team` → `🧠 Inneres Team`
- Typ-Wechsel aktiviert automatisch den passenden Standard-Kategorie-Tab:
  - `familie` → Tab `Personen`
  - `organisation` → Tab `Rollen`
  - `tetralemma` → Tab `Abstrakta`
  - `inneres-team` → Tab `Personen`
  - `""` → aktiver Tab bleibt erhalten
- Alle Kategorie-Tabs bleiben immer zugänglich — der Typ **filtert nicht**, er setzt nur den Fokus.
- Typ wird im Snapshot mitgespeichert: `state.constellationType` (string, optional).
- Beim Laden eines Snapshots wird der gespeicherte Typ wiederhergestellt.

### UI-Position

```
[Typ-Dropdown] | [sep] | [Kategorie-Tabs] | [Figur-Buttons] | [sep] | [Farbe] | [Größe] | …
```

---

## Feature 2: Kategorie-Tabs & Neue SVG-Figuren

### Toolbar-Tabs

Sechs Tabs unmittelbar nach dem Typ-Dropdown (vor den Figur-Buttons):

| Tab-ID | Label | Emoji |
|---|---|---|
| `personen` | Personen | 👤 |
| `rollen` | Rollen | 🏢 |
| `abstrakta` | Abstrakta | ◆ |
| `symbole` | Symbole | ♥ |
| `raeume` | Räume | 🚪 |
| `natur` | Natur | 🌿 |

- Beim Laden der Seite ist Tab `personen` aktiv.
- Klick auf Tab → Figur-Buttons werden auf Elemente dieser Kategorie gefiltert.
- Aktiver Tab wird visuell hervorgehoben (bestehende `.active`-Klasse).

### Neue Manifest-Felder

`art-library/manifest.json` wird auf Version `"2"` angehoben:

```json
{
  "version": "2",
  "assets": [
    { "id": "person", "kind": "character", "label": "Person", "category": "personen", "files": { "figurine": "person.svg" } }
  ]
}
```

Alle bestehenden Assets (`person`, `kind`, `gruppe`, `tier`, `system`, `objekt`) bekommen `"category": "personen"`.

### Neue SVG-Assets

Alle neuen Figuren folgen dem gleichen Stil wie die bestehenden (Silhouette auf transparentem Hintergrund, viewBox `0 0 120 200`, gleiche Strichstärken und Farbpalette-Neutralität).

**Kategorie `personen`** (5 neue):

| id | label | Beschreibung |
|---|---|---|
| `mann` | Mann | Aufrechte Silhouette, breitere Schultern als `person` |
| `frau` | Frau | Silhouette mit Rock/geschwungener Linie |
| `senior` | Ältere Person | Person mit Gehstock, leicht gebückt |
| `baby` | Baby | Sehr kleine liegende/sitzende Figur |
| `nonbinary` | Nicht-binär | Neutrale Silhouette, ⊕-Symbol auf Brust |

**Kategorie `rollen`** (4 neue):

| id | label | Beschreibung |
|---|---|---|
| `fuehrungskraft` | Führungskraft | Person mit Stern/Abzeichen oben |
| `mitarbeiter` | Mitarbeiter | Person mit Krawatte/Kragen-Andeutung |
| `kunde` | Kunde | Person mit Aktentasche |
| `berater` | Externer Berater | Person mit Pfeil (kommt von außen) |

**Kategorie `abstrakta`** (6 neue):

| id | label | Beschreibung |
|---|---|---|
| `ziel` | Ziel | Fadenkreuz / Zielscheibe |
| `hindernis` | Hindernis | Warndreieck / Blockade |
| `ressource` | Ressource | Blitz / Energiestab |
| `tabu` | Tabu | Durchgestrichener Kreis |
| `geheimnis` | Geheimnis | Schloss |
| `tod` | Tod | Stundenglas / Sense (stilisiert) |

**Kategorie `symbole`** (6 neue):

| id | label | Beschreibung |
|---|---|---|
| `herz` | Herz | Herzsymbol |
| `stern` | Stern | Fünfzackiger Stern |
| `kreuz` | Kreuz | Gleicharmiges Kreuz |
| `schild` | Schild | Schildsilhouette |
| `anker` | Anker | Ankersymbol |
| `pfeil` | Pfeil | Großer Richtungspfeil |

**Kategorie `raeume`** (4 neue):

| id | label | Beschreibung |
|---|---|---|
| `mauer` | Mauer | Backsteinmauer-Silhouette (Trennung) |
| `bruecke` | Brücke | Bogenbrücke von vorne |
| `tuer` | Tür | Rechteck mit Türrahmen und Knauf |
| `schwelle` | Schwelle | Horizontale Linie mit Stufe |

**Kategorie `natur`** (4 neue):

| id | label | Beschreibung |
|---|---|---|
| `baum` | Baum | Stilisierter Laubbaum (Stabilität) |
| `fels` | Fels | Rundlicher Felsbrocken |
| `fluss` | Fluss | Gewellte horizontale Linien |
| `wurzel` | Wurzel | Verästeltes Wurzelsystem nach unten |

**Gesamt neue Assets: 29** (5 + 4 + 6 + 6 + 4 + 4)

### Code-Änderungen

`bootArtLibrary()` erweitert:
- Liest `manifest.version` — bei `"2"` wird Kategorie-Logik aktiviert
- Baut Tab-Buttons dynamisch aus den im Manifest vorhandenen `category`-Werten
- `renderTabContent(categoryId)` filtert `ART_MANIFEST.assets` und baut Figur-Buttons für die aktive Kategorie neu auf
- Beim Tab-Klick wird `renderTabContent()` aufgerufen

---

## Feature 3: Kugelsteuerung (Port aus brett-v2.html)

### Verhalten

- Klick auf **leeres Brett** (kein Figur-Treffer, linke Maustaste) → transparente Kontrollkugel erscheint an der Klick-Position auf dem Brett
- Kugel ziehen (mousemove/touchmove während `ctrlBallDrag=true`):
  - Horizontal → `orbit.theta` ändern (Brett rotiert)
  - Vertikal → `orbit.phi` ändern (Brett kippt), geclampt auf `[0.12, π/2.02]`
  - `updateCamera()` wird aufgerufen
  - Kugel dreht sich visuell mit der Drag-Richtung
- Klick auf leeres Brett wenn Kugel sichtbar → Kugel ausblendet
- Loslassen → `ctrlBallDrag=false`, Kugel-Rotation zurücksetzen
- Cursor ändert sich auf `grab` wenn über Kugel, `grabbing` beim Ziehen

### Kugel-Aufbau (Three.js)

```
group (ctrlBall)
├── sphere (MeshStandardMaterial, halbtransparent, goldfarben)
└── ring  (TorusGeometry, sichtbar als Gitterring)
```

Fade-In-Animation beim Erscheinen (~150 ms, opacity 0 → 1).

### Bestehende Interaktion

Das RMB-Drag (`rmbOn`) bleibt erhalten als Fallback. Die Kugelsteuerung ergänzt es — beide Wege rotieren den Orbit.

### Hint-Text

Ein `<div id="ctrl-ball-hint">` unter dem Canvas:
> *Klick auf Brett → Steuerkugel erscheint &nbsp;|&nbsp; Kugel ziehen: Brett drehen &nbsp;|&nbsp; Figur ziehen: verschieben &nbsp;|&nbsp; Doppelklick: Beschriftung*

### Neue State-Variablen

```js
let ctrlBall = null, ctrlBallActive = false, ctrlBallDrag = false;
let ctrlBallStart = { x: 0, y: 0, theta: 0, phi: 0 };
```

### Neue Hilfsfunktionen

- `showCtrlBall(bx, bz)` — erzeugt Gruppe, fügt zur Szene hinzu, startet Fade-In
- `hideCtrlBall()` — entfernt Gruppe aus Szene, setzt Flags zurück
- `pickBall(ndc)` — Raycaster-Treffer auf `ctrlBall`-Gruppe

---

## Cleanup

- `brett/public/brett-v2.html` wird **gelöscht**

---

## Datei-Änderungen

| Datei | Änderung |
|---|---|
| `brett/public/art-library/manifest.json` | Version 2, `category`-Feld, 29 neue Assets |
| `brett/public/art-library/*.svg` | 29 neue SVG-Figurinen |
| `brett/public/index.html` | Typ-Dropdown, Kategorie-Tabs, Kugelsteuerung, Hint-Text |
| `brett/public/brett-v2.html` | **Gelöscht** |

---

## Nicht in Scope

- Aufstellungstyp filtert die sichtbaren Elemente (alle Tabs bleiben immer zugänglich)
- Typ-spezifische Vorlagen/Pre-populated-Boards
- Animationen beim Kategorie-Wechsel
- Änderung des WebSocket-Protokolls (constellationType wird nur lokal im Snapshot gespeichert, nicht live gesynct)
