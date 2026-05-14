---
title: Brett: Aufstellungstypen, Erweiterte Elemente & Kugelsteuerung — Implementation Plan
domains: []
status: active
pr_number: null
---

# Brett: Aufstellungstypen, Erweiterte Elemente & Kugelsteuerung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typ-Dropdown in der Toolbar, 6 Kategorie-Tabs mit 29 neuen SVG-Figurinen, und Port der ctrlBall-Orbit-Steuerung aus brett-v2.html — alles in `brett/public/index.html`.

**Architecture:** Alle Änderungen: `brett/public/index.html` (HTML/CSS/JS), `brett/public/art-library/manifest.json` (Asset-Registry auf v2), 29 neue SVG-Dateien in `brett/public/art-library/`. Der ctrlBall ist eine Three.js-Group, die bei Klick auf leeres Brett erscheint. Das Kategorie-System ist ein UI-Filter über das Manifest — es lädt alle Texturen beim Boot, rendert nur die aktive Kategorie als Buttons.

**Tech Stack:** Three.js (SphereGeometry, TorusGeometry, MeshStandardMaterial), SVG (viewBox 0 0 240 400, stroke #C8F76A), Vanilla JS, HTML/CSS

---

## Datei-Map

| Datei | Änderung |
|---|---|
| `brett/public/art-library/manifest.json` | v2, `category`-Feld für alle 35 Assets |
| `brett/public/art-library/mann.svg` … (29 neue) | Neue SVG-Figurinen |
| `brett/public/index.html` | Toolbar HTML+CSS, `bootArtLibrary()` rewrite, `renderTabContent()`, Typ-Dropdown, Save/Load `constellationType`, ctrlBall-Port, Hint |
| `brett/public/brett-v2.html` | **Löschen** |

---

## Task 1: Feature-Branch anlegen

**Files:**
- Keine Dateiänderungen — Branch-Setup

- [ ] **Step 1: Branch erstellen**

```bash
git checkout -b feature/brett-aufstellungstypen-elemente
```

Expected: Switched to a new branch 'feature/brett-aufstellungstypen-elemente'

- [ ] **Step 2: Commit (leerer Marker)**

```bash
git commit --allow-empty -m "chore(brett): start feature/brett-aufstellungstypen-elemente"
```

---

## Task 2: manifest.json auf v2 aktualisieren

**Files:**
- Modify: `brett/public/art-library/manifest.json`

- [ ] **Step 1: manifest.json ersetzen**

Vollständiger neuer Inhalt — alle 6 bestehenden Assets bekommen `"category": "personen"`, 29 neue Assets werden hinzugefügt:

```json
{
  "version": "2",
  "assets": [
    { "id": "person",    "kind": "character", "label": "Person",   "category": "personen", "files": { "figurine": "person.svg"    } },
    { "id": "kind",      "kind": "character", "label": "Kind",     "category": "personen", "files": { "figurine": "kind.svg"      } },
    { "id": "gruppe",    "kind": "character", "label": "Gruppe",   "category": "personen", "files": { "figurine": "gruppe.svg"    } },
    { "id": "tier",      "kind": "character", "label": "Tier",     "category": "personen", "files": { "figurine": "tier.svg"      } },
    { "id": "system",    "kind": "character", "label": "System",   "category": "personen", "files": { "figurine": "system.svg"    } },
    { "id": "objekt",    "kind": "character", "label": "Objekt",   "category": "personen", "files": { "figurine": "objekt.svg"    } },
    { "id": "mann",      "kind": "character", "label": "Mann",     "category": "personen", "files": { "figurine": "mann.svg"      } },
    { "id": "frau",      "kind": "character", "label": "Frau",     "category": "personen", "files": { "figurine": "frau.svg"      } },
    { "id": "senior",    "kind": "character", "label": "Ältere P.", "category": "personen", "files": { "figurine": "senior.svg"    } },
    { "id": "baby",      "kind": "character", "label": "Baby",     "category": "personen", "files": { "figurine": "baby.svg"      } },
    { "id": "nonbinary", "kind": "character", "label": "Nicht-bin.", "category": "personen", "files": { "figurine": "nonbinary.svg" } },
    { "id": "fuehrungskraft", "kind": "character", "label": "Führungskraft", "category": "rollen", "files": { "figurine": "fuehrungskraft.svg" } },
    { "id": "mitarbeiter",    "kind": "character", "label": "Mitarbeiter",   "category": "rollen", "files": { "figurine": "mitarbeiter.svg"    } },
    { "id": "kunde",          "kind": "character", "label": "Kunde",         "category": "rollen", "files": { "figurine": "kunde.svg"          } },
    { "id": "berater",        "kind": "character", "label": "Berater",       "category": "rollen", "files": { "figurine": "berater.svg"        } },
    { "id": "ziel",      "kind": "character", "label": "Ziel",       "category": "abstrakta", "files": { "figurine": "ziel.svg"      } },
    { "id": "hindernis", "kind": "character", "label": "Hindernis",  "category": "abstrakta", "files": { "figurine": "hindernis.svg" } },
    { "id": "ressource", "kind": "character", "label": "Ressource",  "category": "abstrakta", "files": { "figurine": "ressource.svg" } },
    { "id": "tabu",      "kind": "character", "label": "Tabu",       "category": "abstrakta", "files": { "figurine": "tabu.svg"      } },
    { "id": "geheimnis", "kind": "character", "label": "Geheimnis",  "category": "abstrakta", "files": { "figurine": "geheimnis.svg" } },
    { "id": "tod",       "kind": "character", "label": "Tod",        "category": "abstrakta", "files": { "figurine": "tod.svg"       } },
    { "id": "herz",   "kind": "character", "label": "Herz",   "category": "symbole", "files": { "figurine": "herz.svg"   } },
    { "id": "stern",  "kind": "character", "label": "Stern",  "category": "symbole", "files": { "figurine": "stern.svg"  } },
    { "id": "kreuz",  "kind": "character", "label": "Kreuz",  "category": "symbole", "files": { "figurine": "kreuz.svg"  } },
    { "id": "schild", "kind": "character", "label": "Schild", "category": "symbole", "files": { "figurine": "schild.svg" } },
    { "id": "anker",  "kind": "character", "label": "Anker",  "category": "symbole", "files": { "figurine": "anker.svg"  } },
    { "id": "pfeil",  "kind": "character", "label": "Pfeil",  "category": "symbole", "files": { "figurine": "pfeil.svg"  } },
    { "id": "mauer",   "kind": "character", "label": "Mauer",   "category": "raeume", "files": { "figurine": "mauer.svg"   } },
    { "id": "bruecke", "kind": "character", "label": "Brücke",  "category": "raeume", "files": { "figurine": "bruecke.svg" } },
    { "id": "tuer",    "kind": "character", "label": "Tür",     "category": "raeume", "files": { "figurine": "tuer.svg"    } },
    { "id": "schwelle","kind": "character", "label": "Schwelle","category": "raeume", "files": { "figurine": "schwelle.svg"} },
    { "id": "baum",   "kind": "character", "label": "Baum",  "category": "natur", "files": { "figurine": "baum.svg"   } },
    { "id": "fels",   "kind": "character", "label": "Fels",  "category": "natur", "files": { "figurine": "fels.svg"   } },
    { "id": "fluss",  "kind": "character", "label": "Fluss", "category": "natur", "files": { "figurine": "fluss.svg"  } },
    { "id": "wurzel", "kind": "character", "label": "Wurzel","category": "natur", "files": { "figurine": "wurzel.svg" } }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add brett/public/art-library/manifest.json
git commit -m "feat(brett): manifest v2 — category field, 35 assets registered"
```

---

## Task 3: SVGs Personen (5 neue)

**Files:**
- Create: `brett/public/art-library/mann.svg`
- Create: `brett/public/art-library/frau.svg`
- Create: `brett/public/art-library/senior.svg`
- Create: `brett/public/art-library/baby.svg`
- Create: `brett/public/art-library/nonbinary.svg`

Alle SVGs: viewBox="0 0 240 400", stroke="#C8F76A", stroke-width="6", stroke-linecap="round", fill="none".

- [ ] **Step 1: mann.svg — breitere Schultern als `person`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="110" x2="120" y2="242" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="148" x2="42" y2="210" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="148" x2="198" y2="210" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="76" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="164" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: frau.svg — Rock-Silhouette**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="110" x2="120" y2="210" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="62" y2="212" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="178" y2="212" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="210" x2="68" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="210" x2="172" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="68" y1="366" x2="172" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: senior.svg — leicht gebückt mit Gehstock**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="126" cy="70" r="40" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="122" y1="110" x2="112" y2="238" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="118" y1="152" x2="54" y2="206" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="118" y1="152" x2="178" y2="194" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="112" y1="238" x2="72" y2="364" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="112" y1="238" x2="150" y2="364" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="178" y1="194" x2="184" y2="374" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <path d="M 166,194 Q 178,180 190,194" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: baby.svg — großer Kopf, kurzer Körper**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="136" r="58" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="194" x2="120" y2="284" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="218" x2="76" y2="258" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="218" x2="164" y2="258" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="284" x2="90" y2="352" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="284" x2="150" y2="352" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 5: nonbinary.svg — neutrale Figur mit ⊕-Symbol**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="110" x2="120" y2="242" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="54" y2="208" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="186" y2="208" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="76" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="164" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <circle cx="120" cy="182" r="18" fill="none" stroke="#C8F76A" stroke-width="5"/>
  <line x1="120" y1="164" x2="120" y2="200" stroke="#C8F76A" stroke-width="4" stroke-linecap="round"/>
  <line x1="102" y1="182" x2="138" y2="182" stroke="#C8F76A" stroke-width="4" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: Commit**

```bash
git add brett/public/art-library/mann.svg brett/public/art-library/frau.svg brett/public/art-library/senior.svg brett/public/art-library/baby.svg brett/public/art-library/nonbinary.svg
git commit -m "feat(brett): SVGs Kategorie personen (mann, frau, senior, baby, nonbinary)"
```

---

## Task 4: SVGs Rollen (4 neue)

**Files:**
- Create: `brett/public/art-library/fuehrungskraft.svg`
- Create: `brett/public/art-library/mitarbeiter.svg`
- Create: `brett/public/art-library/kunde.svg`
- Create: `brett/public/art-library/berater.svg`

- [ ] **Step 1: fuehrungskraft.svg — Person mit Stern darüber**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="84" r="40" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="124" x2="120" y2="252" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="162" x2="56" y2="218" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="162" x2="184" y2="218" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="252" x2="78" y2="374" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="252" x2="162" y2="374" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <polygon points="120,14 126,32 146,32 130,44 136,62 120,50 104,62 110,44 94,32 114,32" fill="none" stroke="#C8F76A" stroke-width="5" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: mitarbeiter.svg — Person mit Krawatte**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="110" x2="120" y2="242" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="54" y2="208" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="186" y2="208" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="76" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="164" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <polygon points="120,118 113,154 120,168 127,154" fill="none" stroke="#C8F76A" stroke-width="5" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 3: kunde.svg — Person hält Aktentasche**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="110" x2="120" y2="242" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="60" y2="206" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="180" y2="244" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="76" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="164" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <rect x="172" y="244" width="38" height="28" rx="3" fill="none" stroke="#C8F76A" stroke-width="5"/>
  <path d="M 180,244 Q 191,234 202,244" fill="none" stroke="#C8F76A" stroke-width="4" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: berater.svg — Person mit Richtungspfeil von außen**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="108" cy="68" r="40" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="108" y1="108" x2="108" y2="238" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="108" y1="150" x2="46" y2="204" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="108" y1="150" x2="166" y2="204" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="108" y1="238" x2="68" y2="362" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="108" y1="238" x2="148" y2="362" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="226" y1="170" x2="168" y2="170" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <polyline points="180,158 168,170 180,182" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 5: Commit**

```bash
git add brett/public/art-library/fuehrungskraft.svg brett/public/art-library/mitarbeiter.svg brett/public/art-library/kunde.svg brett/public/art-library/berater.svg
git commit -m "feat(brett): SVGs Kategorie rollen (fuehrungskraft, mitarbeiter, kunde, berater)"
```

---

## Task 5: SVGs Abstrakta (6 neue)

**Files:**
- Create: `brett/public/art-library/ziel.svg`
- Create: `brett/public/art-library/hindernis.svg`
- Create: `brett/public/art-library/ressource.svg`
- Create: `brett/public/art-library/tabu.svg`
- Create: `brett/public/art-library/geheimnis.svg`
- Create: `brett/public/art-library/tod.svg`

- [ ] **Step 1: ziel.svg — Zielscheibe mit Fadenkreuz**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="200" r="100" fill="none" stroke="#C8F76A" stroke-width="6"/>
  <circle cx="120" cy="200" r="64" fill="none" stroke="#C8F76A" stroke-width="6"/>
  <circle cx="120" cy="200" r="28" fill="none" stroke="#C8F76A" stroke-width="6"/>
  <line x1="120" y1="88" x2="120" y2="160" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="240" x2="120" y2="312" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="8"   y1="200" x2="80"  y2="200" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="160" y1="200" x2="232" y2="200" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: hindernis.svg — Warndreieck mit Ausrufezeichen**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <polygon points="120,48 218,340 22,340" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linejoin="round"/>
  <line x1="120" y1="142" x2="120" y2="268" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
  <circle cx="120" cy="306" r="9" fill="#C8F76A"/>
</svg>
```

- [ ] **Step 3: ressource.svg — Blitz / Energiepfeil**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <polyline points="152,30 88,208 138,208 88,370" fill="none" stroke="#C8F76A" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 4: tabu.svg — Durchgestrichener Kreis**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="200" r="106" fill="none" stroke="#C8F76A" stroke-width="8"/>
  <line x1="45" y1="125" x2="195" y2="275" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 5: geheimnis.svg — Schloss**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <rect x="52" y="196" width="136" height="118" rx="12" fill="none" stroke="#C8F76A" stroke-width="7"/>
  <path d="M 80,196 L 80,144 Q 80,84 120,84 Q 160,84 160,144 L 160,196" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <circle cx="120" cy="244" r="16" fill="none" stroke="#C8F76A" stroke-width="5"/>
  <line x1="120" y1="260" x2="120" y2="290" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: tod.svg — Stundenglas**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <line x1="52" y1="58"  x2="188" y2="58"  stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="52" y1="342" x2="188" y2="342" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="52"  y1="58"  x2="120" y2="200" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="188" y1="58"  x2="120" y2="200" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="52"  y1="342" x2="120" y2="200" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="188" y1="342" x2="120" y2="200" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <circle cx="100" cy="312" r="7" fill="#C8F76A"/>
  <circle cx="120" cy="322" r="7" fill="#C8F76A"/>
  <circle cx="140" cy="312" r="7" fill="#C8F76A"/>
</svg>
```

- [ ] **Step 7: Commit**

```bash
git add brett/public/art-library/ziel.svg brett/public/art-library/hindernis.svg brett/public/art-library/ressource.svg brett/public/art-library/tabu.svg brett/public/art-library/geheimnis.svg brett/public/art-library/tod.svg
git commit -m "feat(brett): SVGs Kategorie abstrakta (ziel, hindernis, ressource, tabu, geheimnis, tod)"
```

---

## Task 6: SVGs Symbole (6 neue)

**Files:**
- Create: `brett/public/art-library/herz.svg`
- Create: `brett/public/art-library/stern.svg`
- Create: `brett/public/art-library/kreuz.svg`
- Create: `brett/public/art-library/schild.svg`
- Create: `brett/public/art-library/anker.svg`
- Create: `brett/public/art-library/pfeil.svg`

- [ ] **Step 1: herz.svg**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <path d="M 120,330 C 55,278 16,236 16,168 Q 16,108 68,108 Q 100,108 120,138 Q 140,108 172,108 Q 224,108 224,168 C 224,236 185,278 120,330 Z" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: stern.svg — 5-zackiger Stern (Polygon)**

Berechnung: Mittelpunkt (120,190), Außenradius R=110, Innenradius r=44.
Außenpunkte (Winkel -90°, -18°, 54°, 126°, 198°):
- (-90°): 120, 80
- (-18°): 224.6, 156.0 → zu weit; R=100: 215, 159
- mit R=100: 120,90 / 215,159 / 179,281 / 61,281 / 25,159
- mit r=40: 143,167 / 158,212 / 120,240 / 82,212 / 97,167

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <polygon points="120,90 143,167 215,159 158,212 179,281 120,240 61,281 82,212 25,159 97,167" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 3: kreuz.svg — gleicharmiges Kreuz**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <line x1="120" y1="60"  x2="120" y2="340" stroke="#C8F76A" stroke-width="30" stroke-linecap="round"/>
  <line x1="20"  y1="200" x2="220" y2="200" stroke="#C8F76A" stroke-width="30" stroke-linecap="round"/>
</svg>
```

Hinweis: stroke-width="30" erzeugt ein dickes, klar sichtbares Kreuz das als Figur-Silhouette funktioniert. Kein fill.

- [ ] **Step 4: schild.svg — klassische Schildsilhouette**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <path d="M 120,370 C 50,320 20,270 20,190 L 20,90 L 120,60 L 220,90 L 220,190 C 220,270 190,320 120,370 Z" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 5: anker.svg**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="90" r="34" fill="none" stroke="#C8F76A" stroke-width="7"/>
  <line x1="120" y1="124" x2="120" y2="340" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="60"  y1="146" x2="180" y2="146" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <path d="M 40,260 Q 40,340 120,340 Q 200,340 200,260" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: pfeil.svg — großer Richtungspfeil nach oben**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <polyline points="40,220 120,60 200,220" fill="none" stroke="#C8F76A" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="120" y1="60" x2="120" y2="360" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 7: Commit**

```bash
git add brett/public/art-library/herz.svg brett/public/art-library/stern.svg brett/public/art-library/kreuz.svg brett/public/art-library/schild.svg brett/public/art-library/anker.svg brett/public/art-library/pfeil.svg
git commit -m "feat(brett): SVGs Kategorie symbole (herz, stern, kreuz, schild, anker, pfeil)"
```

---

## Task 7: SVGs Räume (4 neue)

**Files:**
- Create: `brett/public/art-library/mauer.svg`
- Create: `brett/public/art-library/bruecke.svg`
- Create: `brett/public/art-library/tuer.svg`
- Create: `brett/public/art-library/schwelle.svg`

- [ ] **Step 1: mauer.svg — Backsteinmauer (3 Reihen)**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <rect x="14" y="60"  width="212" height="56" rx="2" fill="none" stroke="#C8F76A" stroke-width="6"/>
  <rect x="14" y="172" width="212" height="56" rx="2" fill="none" stroke="#C8F76A" stroke-width="6"/>
  <rect x="14" y="284" width="212" height="56" rx="2" fill="none" stroke="#C8F76A" stroke-width="6"/>
  <line x1="120" y1="60"  x2="120" y2="116" stroke="#C8F76A" stroke-width="5"/>
  <line x1="66"  y1="172" x2="66"  y2="228" stroke="#C8F76A" stroke-width="5"/>
  <line x1="174" y1="172" x2="174" y2="228" stroke="#C8F76A" stroke-width="5"/>
  <line x1="120" y1="284" x2="120" y2="340" stroke="#C8F76A" stroke-width="5"/>
</svg>
```

- [ ] **Step 2: bruecke.svg — Bogenbrücke**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <path d="M 20,280 Q 120,80 220,280" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="20"  y1="280" x2="20"  y2="360" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="220" y1="280" x2="220" y2="360" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="20"  y1="360" x2="220" y2="360" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="80"  y1="200" x2="80"  y2="360" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="166" x2="120" y2="360" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="160" y1="200" x2="160" y2="360" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: tuer.svg — Tür mit Türrahmen und Knauf**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <rect x="52" y="52" width="136" height="296" rx="6" fill="none" stroke="#C8F76A" stroke-width="7"/>
  <rect x="66" y="66" width="108" height="268" rx="4" fill="none" stroke="#C8F76A" stroke-width="5"/>
  <circle cx="156" cy="210" r="10" fill="none" stroke="#C8F76A" stroke-width="5"/>
</svg>
```

- [ ] **Step 4: schwelle.svg — horizontale Linie mit Stufe**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <line x1="16"  y1="260" x2="100" y2="260" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
  <line x1="100" y1="260" x2="100" y2="200" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
  <line x1="100" y1="200" x2="140" y2="200" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
  <line x1="140" y1="200" x2="140" y2="140" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
  <line x1="140" y1="140" x2="224" y2="140" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 5: Commit**

```bash
git add brett/public/art-library/mauer.svg brett/public/art-library/bruecke.svg brett/public/art-library/tuer.svg brett/public/art-library/schwelle.svg
git commit -m "feat(brett): SVGs Kategorie raeume (mauer, bruecke, tuer, schwelle)"
```

---

## Task 8: SVGs Natur (4 neue)

**Files:**
- Create: `brett/public/art-library/baum.svg`
- Create: `brett/public/art-library/fels.svg`
- Create: `brett/public/art-library/fluss.svg`
- Create: `brett/public/art-library/wurzel.svg`

- [ ] **Step 1: baum.svg — Laubbaum**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="140" r="90" fill="none" stroke="#C8F76A" stroke-width="7"/>
  <line x1="120" y1="230" x2="120" y2="380" stroke="#C8F76A" stroke-width="10" stroke-linecap="round"/>
  <line x1="84" y1="310" x2="60" y2="340" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="156" y1="310" x2="180" y2="340" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: fels.svg — rundlicher Felsbrocken**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <path d="M 30,320 Q 20,240 60,180 Q 90,120 120,110 Q 160,100 190,150 Q 224,210 218,300 Q 210,360 120,370 Q 40,370 30,320 Z" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 80,180 Q 110,160 140,180" fill="none" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <path d="M 160,220 Q 190,200 200,230" fill="none" stroke="#C8F76A" stroke-width="4" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: fluss.svg — gewellte horizontale Linien**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <path d="M 10,140 Q 50,110 90,140 Q 130,170 170,140 Q 210,110 230,130" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <path d="M 10,200 Q 50,170 90,200 Q 130,230 170,200 Q 210,170 230,190" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <path d="M 10,260 Q 50,230 90,260 Q 130,290 170,260 Q 210,230 230,250" fill="none" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: wurzel.svg — verästeltes Wurzelsystem nach unten**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <line x1="120" y1="40"  x2="120" y2="160" stroke="#C8F76A" stroke-width="8" stroke-linecap="round"/>
  <line x1="120" y1="160" x2="60"  y2="240" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="120" y1="160" x2="180" y2="240" stroke="#C8F76A" stroke-width="7" stroke-linecap="round"/>
  <line x1="120" y1="160" x2="120" y2="260" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="60"  y1="240" x2="24"  y2="330" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="60"  y1="240" x2="80"  y2="340" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="180" y1="240" x2="216" y2="330" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="180" y1="240" x2="160" y2="340" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="260" x2="100" y2="360" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="260" x2="140" y2="360" stroke="#C8F76A" stroke-width="5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 5: Commit**

```bash
git add brett/public/art-library/baum.svg brett/public/art-library/fels.svg brett/public/art-library/fluss.svg brett/public/art-library/wurzel.svg
git commit -m "feat(brett): SVGs Kategorie natur (baum, fels, fluss, wurzel)"
```

---

## Task 9: Toolbar CSS & HTML

**Files:**
- Modify: `brett/public/index.html` (CSS-Block ca. Zeile 1–236, Toolbar-HTML Zeilen 237–289)

Ziel: `<select id="constellation-type">` + Trennlinie + `<div id="category-tabs">` + Trennlinie vor `<div id="figure-buttons">`. Label `<span class="tlabel">Figur</span>` entfernen.

- [ ] **Step 1: CSS-Stil für #constellation-type und .cat-tab in `<style>` einfügen**

Im `<style>`-Block, nach der bestehenden Regel für `.figure-btn` (oder am Ende des style-Blocks), einfügen:

```css
#constellation-type {
  background: #0f2040;
  border: 1px solid #0f3460;
  color: #c0a0ff;
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}
#constellation-type:focus {
  border-color: #7a4acd;
}
#category-tabs {
  display: flex;
  gap: 4px;
}
.cat-tab {
  padding: 3px 9px;
  border-radius: 4px;
  background: #0f2040;
  border: 1px solid #0f3460;
  color: #888;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
  line-height: 1.6;
}
.cat-tab:hover { border-color: #2c4d80; color: #ccc; }
.cat-tab.active { background: #1a4a8a; border-color: #4a90d9; color: #fff; }
```

- [ ] **Step 2: Toolbar-HTML umstrukturieren**

Den Block von Zeile 237–241 (bis einschließlich `<div id="figure-buttons">...`) ersetzen:

Alter Code (exakt):
```html
  <span class="tlabel">Figur</span>

  <div id="figure-buttons" style="display:flex;gap:6px;"></div>

  <div class="sep"></div>
```

Neuer Code:
```html
  <select id="constellation-type">
    <option value="">— frei —</option>
    <option value="familie">👨‍👩‍👧 Familienaufstellung</option>
    <option value="organisation">🏢 Organisationsaufstellung</option>
    <option value="tetralemma">◇ Tetralemma</option>
    <option value="inneres-team">🧠 Inneres Team</option>
  </select>

  <div class="sep"></div>
  <div id="category-tabs"></div>

  <div class="sep"></div>
  <div id="figure-buttons" style="display:flex;gap:6px;"></div>

  <div class="sep"></div>
```

- [ ] **Step 3: `#ctrl-ball-hint` unter dem Canvas einfügen**

Nach `<div id="canvas-container">...</div>` (Zeile ~296), vor dem nächsten `<div`:

```html
<div id="ctrl-ball-hint" style="font-size:11px;color:#555;text-align:center;padding:4px 0;user-select:none;">
  Klick auf Brett → Steuerkugel erscheint &nbsp;|&nbsp; Kugel ziehen: Brett drehen &nbsp;|&nbsp; Figur ziehen: verschieben &nbsp;|&nbsp; Doppelklick: Beschriftung
</div>
```

- [ ] **Step 4: Validierung (visuell) — Brett im Browser öffnen**

```bash
# Im brett/-Verzeichnis: Node-Server starten falls nicht läuft
cd /home/gekko/Bachelorprojekt/brett && node server.js &
# Browser: http://localhost:<port> — Toolbar sollte Dropdown + Tabs-Platzhalter zeigen
```

Falls `task brett:build` nötig: nur wenn der Server neu gebaut werden muss.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): Toolbar — Typ-Dropdown, Kategorie-Tabs-Placeholder, ctrl-ball-hint"
```

---

## Task 10: JavaScript — bootArtLibrary() + renderTabContent()

**Files:**
- Modify: `brett/public/index.html` (Funktion `bootArtLibrary` Zeilen 641–684)

Ziel: Für manifest.version "2" werden Kategorie-Tabs dynamisch gebaut; `renderTabContent(categoryId)` filtert und rendert die Figur-Buttons.

- [ ] **Step 1: Gesamte `bootArtLibrary`-Funktion ersetzen**

Alten Block (Zeilen 641–684, von `async function bootArtLibrary() {` bis zur schließenden `}`) komplett ersetzen mit:

```js
const CAT_LABELS = {
  personen:  '👤 Personen',
  rollen:    '🏢 Rollen',
  abstrakta: '◆ Abstrakta',
  symbole:   '♥ Symbole',
  raeume:    '🚪 Räume',
  natur:     '🌿 Natur',
};
let activeCategoryId = 'personen';

function renderTabContent(categoryId) {
  activeCategoryId = categoryId;
  const tabs = document.querySelectorAll('.cat-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.cat === categoryId));
  const container = document.getElementById('figure-buttons');
  while (container.firstChild) container.removeChild(container.firstChild);
  if (!ART_MANIFEST) return;
  for (const a of ART_MANIFEST.assets) {
    if (a.category !== categoryId) continue;
    if (!characterIds.has(a.id)) continue;
    const btn = document.createElement('button');
    btn.className = 'figure-btn';
    btn.dataset.type = a.id;
    btn.title = a.label || a.id;
    btn.setAttribute('aria-label', a.label || a.id);
    const artSpan = document.createElement('span');
    artSpan.className = 'figure-art';
    btn.appendChild(artSpan);
    const svgUrl = '/art-library/' + a.files.figurine;
    fetch(svgUrl).then(r => r.text()).then(svgText => {
      const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      artSpan.appendChild(document.importNode(parsed.documentElement, true));
    });
    btn.addEventListener('click', () => {
      const x = (Math.random()-0.5)*(BW-4);
      const z = (Math.random()-0.5)*(BD-4);
      const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
      send({ type: 'add', fig: figToJSON(fig) });
      selectFigure(fig);
      openLabelModal(fig);
    });
    container.appendChild(btn);
  }
}

async function bootArtLibrary() {
  try {
    const r = await fetch('/art-library/manifest.json');
    if (!r.ok) throw new Error('no manifest');
    ART_MANIFEST = await r.json();
    for (const a of ART_MANIFEST.assets) {
      if (a.kind === 'character') characterIds.add(a.id);
    }
    await Promise.all([...characterIds].map(loadCharacterTexture));
    console.log('[art] loaded', characterIds.size, 'characters');

    if (ART_MANIFEST.version === '2') {
      const seenCats = [];
      for (const a of ART_MANIFEST.assets) {
        if (a.category && !seenCats.includes(a.category)) seenCats.push(a.category);
      }
      const tabContainer = document.getElementById('category-tabs');
      for (const cat of seenCats) {
        const btn = document.createElement('button');
        btn.className = 'cat-tab' + (cat === 'personen' ? ' active' : '');
        btn.dataset.cat = cat;
        btn.textContent = CAT_LABELS[cat] || cat;
        btn.addEventListener('click', () => renderTabContent(cat));
        tabContainer.appendChild(btn);
      }
      renderTabContent('personen');
    } else {
      // Legacy v1: alle Buttons flat rendern
      const container = document.getElementById('figure-buttons');
      for (const a of ART_MANIFEST.assets) {
        if (!characterIds.has(a.id)) continue;
        const btn = document.createElement('button');
        btn.className = 'figure-btn';
        btn.dataset.type = a.id;
        btn.title = a.label || a.id;
        btn.setAttribute('aria-label', a.label || a.id);
        const artSpan = document.createElement('span');
        artSpan.className = 'figure-art';
        btn.appendChild(artSpan);
        const svgText = await fetch('/art-library/' + a.files.figurine).then(r => r.text());
        const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        artSpan.appendChild(document.importNode(parsed.documentElement, true));
        btn.addEventListener('click', () => {
          const x = (Math.random()-0.5)*(BW-4);
          const z = (Math.random()-0.5)*(BD-4);
          const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
          send({ type: 'add', fig: figToJSON(fig) });
          selectFigure(fig);
          openLabelModal(fig);
        });
        container.appendChild(btn);
      }
    }
  } catch (e) {
    console.warn('[art] manifest unavailable, using legacy shapes', e.message);
    ART_MANIFEST = null;
  } finally {
    window.__ART_READY__ = true;
    window.characterIds = characterIds;
  }
}
```

- [ ] **Step 2: Browser-Test**

Brett laden → Tabs sollen erscheinen, Klick auf Tab → Figur-Buttons wechseln.
Figur-Button klicken → Figur erscheint auf Brett.

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): bootArtLibrary v2 — Kategorie-Tabs + renderTabContent"
```

---

## Task 11: JavaScript — Typ-Dropdown + Save/Load constellationType

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: `isAnyModalOpen()` Hilfsfunktion hinzufügen**

Direkt nach der Deklaration von `const modal = document.getElementById('label-modal');` (Zeile ~1195) einfügen:

```js
function isAnyModalOpen() {
  return modal.classList.contains('visible') ||
         saveModal.style.display === 'flex' ||
         loadModal.style.display === 'flex';
}
```

- [ ] **Step 2: Existing modal check im mousedown ersetzen**

Zeile ~1260: `if (modal.classList.contains('visible')) return;`

Ersetzen mit:
```js
if (isAnyModalOpen()) return;
```

- [ ] **Step 3: Typ-Dropdown — Tab-Fokus-Logik**

Nach `bootArtLibrary();` (Zeile ~684), folgende Event-Listener einfügen:

```js
document.getElementById('constellation-type').addEventListener('change', function() {
  const tabMap = {
    familie:        'personen',
    organisation:   'rollen',
    tetralemma:     'abstrakta',
    'inneres-team': 'personen',
  };
  const target = tabMap[this.value];
  if (target) renderTabContent(target);
});
```

- [ ] **Step 4: Save — constellationType in state aufnehmen**

Zeile ~1077: `state: { figures: figures.map(figToJSON) }`

Ersetzen mit:
```js
state: {
  figures: figures.map(figToJSON),
  constellationType: document.getElementById('constellation-type').value || undefined,
},
```

- [ ] **Step 5: Load — constellationType wiederherstellen**

In `loadSnapshot()` (Zeile ~1168), nach `applySnapshot(figs);` einfügen:

```js
  if (snap.state && snap.state.constellationType !== undefined) {
    const sel = document.getElementById('constellation-type');
    sel.value = snap.state.constellationType;
    sel.dispatchEvent(new Event('change'));
  }
```

- [ ] **Step 6: Browser-Test**

1. Typ "Familienaufstellung" wählen → Tab "Personen" wird aktiv.
2. Typ "Tetralemma" wählen → Tab "Abstrakta" wird aktiv.
3. Figuren platzieren, Speichern, Brett leeren, Laden → constellationType + Figuren werden wiederhergestellt.

- [ ] **Step 7: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): Typ-Dropdown Tab-Fokus + constellationType in Snapshot"
```

---

## Task 12: JavaScript — Kugelsteuerung (ctrlBall) Port

**Files:**
- Modify: `brett/public/index.html`

Grundlage: ctrlBall-Code aus brett-v2.html (Zeilen 643–1004).
Anpassungen gegenüber brett-v2.html:
- `BW()` und `BD()` als Funktionen → `BW` und `BD` als Konstanten
- `isAnyModalOpen()` steht nun als Funktion bereit (Task 11 Step 1)
- Board-Position in `showCtrlBall` direkt als World-Koordinaten (kein `*.3` Faktor)
- Fade-In: Opacity-Animation in der bestehenden `animate()`-Schleife

- [ ] **Step 1: State-Variablen einfügen**

Nach `let selectedFigure = null;` (Zeile ~688) einfügen:

```js
let ctrlBall = null, ctrlBallActive = false, ctrlBallDrag = false;
let ctrlBallStart = { x: 0, y: 0, theta: 0, phi: 0 };
let ctrlBallShowTime = 0;
```

- [ ] **Step 2: `showCtrlBall`, `hideCtrlBall`, `pickBall` nach den State-Variablen einfügen**

```js
function showCtrlBall(wx, wz) {
  if (ctrlBall) scene.remove(ctrlBall);
  ctrlBall = new THREE.Group();

  const sphereGeo = new THREE.SphereGeometry(1.8, 24, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xffd84a, transparent: true, opacity: 0, roughness: 0.3, metalness: 0.6,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  ctrlBall.add(sphere);

  const ringGeo = new THREE.TorusGeometry(2.4, 0.18, 8, 32);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0, roughness: 0.4, metalness: 0.2,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ctrlBall.add(ring);

  ctrlBall.position.set(wx, 3.0, wz);
  scene.add(ctrlBall);
  ctrlBallActive = true;
  ctrlBallDrag = false;
  ctrlBallShowTime = Date.now();
}

function hideCtrlBall() {
  if (ctrlBall) { scene.remove(ctrlBall); ctrlBall = null; }
  ctrlBallActive = false;
  ctrlBallDrag = false;
}

function pickBall(ndc) {
  if (!ctrlBall) return false;
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(ctrlBall, true).length > 0;
}
```

- [ ] **Step 3: Fade-In-Animation in `animate()` einfügen**

In der `animate()`-Funktion, vor `renderer.render(scene, camera);`, einfügen:

```js
  if (ctrlBall && ctrlBallActive) {
    const t = Math.min(1, (Date.now() - ctrlBallShowTime) / 150);
    ctrlBall.children.forEach((c, i) => {
      if (c.material) c.material.opacity = t * (i === 0 ? 0.72 : 0.9);
    });
  }
```

- [ ] **Step 4: mousedown — ctrlBall-Logik für LMB**

Im `mousedown`-Handler, den bestehenden `if (e.button === 0)` Block (Zeilen ~1279–1292) ersetzen:

```js
  if (e.button === 0) {
    const ndc = getNDC(e);
    if (ctrlBallActive && pickBall(ndc)) {
      ctrlBallDrag = true;
      ctrlBallStart.x = e.clientX; ctrlBallStart.y = e.clientY;
      ctrlBallStart.theta = orbit.theta; ctrlBallStart.phi = orbit.phi;
      return;
    }
    const fig = pickFigure(ndc);
    if (fig) {
      if (ctrlBallActive) hideCtrlBall();
      const now = Date.now();
      if (lastClick.fig === fig && now-lastClick.time < 380) { openLabelModal(fig); lastClick.fig = null; return; }
      lastClick = { fig, time: now };
      selectFigure(fig);
      drag = { on: true, fig };
    } else {
      selectFigure(null); lastClick.fig = null;
      const bpos = pickBoard(ndc);
      if (bpos) {
        if (ctrlBallActive) hideCtrlBall();
        else showCtrlBall(bpos.x, bpos.z);
      }
    }
  }
```

- [ ] **Step 5: mousemove — ctrlBallDrag-Branch + Cursor einfügen**

Im `mousemove`-Handler, ganz am Anfang (vor dem `if (rotFig)` Check), einfügen:

```js
  if (ctrlBallDrag) {
    const dx = e.clientX - ctrlBallStart.x;
    const dy = e.clientY - ctrlBallStart.y;
    orbit.theta = ctrlBallStart.theta - dx * 0.012;
    orbit.phi = Math.max(0.12, Math.min(Math.PI / 2.02, ctrlBallStart.phi + dy * 0.01));
    updateCamera();
    if (ctrlBall) { ctrlBall.rotation.y = -dx * 0.04; ctrlBall.rotation.x = dy * 0.04; }
    return;
  }
```

Am Ende des `mousemove`-Handlers (nach allen bestehenden Branches), Cursor-Logik einfügen:

```js
  if (ctrlBallActive && pickBall(getNDC(e))) {
    canvas.style.cursor = 'grab';
  } else if (!drag.on && !rmbOn && !panOn) {
    canvas.style.cursor = '';
  }
```

- [ ] **Step 6: mouseup — ctrlBallDrag zurücksetzen**

Im `mouseup`-Handler, am Anfang nach `if (e.button === 0)` oder generell einfügen (wo rotFig/drag/rmbOn zurückgesetzt werden):

```js
  if (ctrlBallDrag) {
    ctrlBallDrag = false;
    if (ctrlBall) { ctrlBall.rotation.y = 0; ctrlBall.rotation.x = 0; }
    canvas.style.cursor = ctrlBallActive ? 'grab' : '';
    return;
  }
```

- [ ] **Step 7: Touch-Events — ctrlBall**

Im `touchstart`-Handler, zu Beginn des LMB-äquivalenten Touch-Blocks:

```js
  if (ctrlBallActive && pickBall(getNDC(touches[0]))) {
    ctrlBallDrag = true;
    ctrlBallStart.x = touches[0].clientX; ctrlBallStart.y = touches[0].clientY;
    ctrlBallStart.theta = orbit.theta; ctrlBallStart.phi = orbit.phi;
    e.preventDefault(); return;
  }
```

Im `touchmove`-Handler, zu Beginn:

```js
  if (ctrlBallDrag && e.touches.length === 1) {
    const dx = e.touches[0].clientX - ctrlBallStart.x;
    const dy = e.touches[0].clientY - ctrlBallStart.y;
    orbit.theta = ctrlBallStart.theta - dx * 0.012;
    orbit.phi = Math.max(0.12, Math.min(Math.PI / 2.02, ctrlBallStart.phi + dy * 0.01));
    updateCamera();
    if (ctrlBall) { ctrlBall.rotation.y = -dx * 0.04; ctrlBall.rotation.x = dy * 0.04; }
    e.preventDefault(); return;
  }
```

Im `touchend`-Handler, zu Beginn:

```js
  if (ctrlBallDrag) {
    ctrlBallDrag = false;
    if (ctrlBall) { ctrlBall.rotation.y = 0; ctrlBall.rotation.x = 0; }
  }
```

- [ ] **Step 8: Browser-Test Kugelsteuerung**

1. Auf leeres Brett klicken → goldene halbtransparente Kugel erscheint (Fade-In ~150ms).
2. Kugel ziehen → Brett rotiert/kippt.
3. Auf leeres Brett klicken (Kugel sichtbar) → Kugel verschwindet.
4. Figur anklicken (Kugel sichtbar) → Kugel verschwindet, Figur wird ausgewählt.
5. RMB-Drag noch funktionsfähig.

- [ ] **Step 9: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): Kugelsteuerung (ctrlBall) port aus brett-v2.html"
```

---

## Task 13: Cleanup + Verify + PR

**Files:**
- Delete: `brett/public/brett-v2.html`

- [ ] **Step 1: brett-v2.html löschen**

```bash
git rm brett/public/brett-v2.html
```

- [ ] **Step 2: Vollständiger Browser-Test Golden Path**

Prüfliste:
1. Brett lädt ohne Konsolenfehler
2. Typ-Dropdown zeigt 5 Optionen
3. 6 Kategorie-Tabs sichtbar; Tab "Personen" aktiv beim Laden
4. Alle Figuren in der richtigen Kategorie (Tab wechseln → Buttons ändern sich)
5. Figur platzieren, beschriften, skalieren, drehen, löschen
6. Aufstellungstyp "Familienaufstellung" → Tab "Personen" aktiv
7. Aufstellungstyp "Tetralemma" → Tab "Abstrakta" aktiv
8. Speichern mit Name → Laden → Brett identisch wiederhergestellt (inkl. Typ)
9. Kugel erscheint auf Board-Klick, dreht Brett beim Ziehen
10. WebSocket-Sync (falls zweiter Tab geöffnet): Figuren syncen

- [ ] **Step 3: task test:all**

```bash
cd /home/gekko/Bachelorprojekt && task test:all
```

Expected: PASS (alle offline Tests)

- [ ] **Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore(brett): brett-v2.html entfernt (ctrlBall vollständig in index.html)"
```

- [ ] **Step 5: PR erstellen**

```bash
gh pr create \
  --title "feat(brett): Aufstellungstypen, erweiterte Elemente & Kugelsteuerung" \
  --body "$(cat <<'EOF'
## Summary
- Typ-Dropdown in der Toolbar (Familienaufstellung, Organisationsaufstellung, Tetralemma, Inneres Team); setzt automatisch den passenden Kategorie-Tab
- 29 neue SVG-Figurinen in 6 Kategorien (Personen, Rollen, Abstrakta, Symbole, Räume, Natur); manifest.json auf v2 angehoben
- Kugelsteuerung (ctrlBall) aus brett-v2.html portiert: Klick auf leeres Brett → goldene Steuerkugel; Ziehen rotiert/kippt den Orbit
- brett-v2.html gelöscht

## Test plan
- [x] task test:all
- [x] Manueller Browser-Test: Tabs, Typ-Dropdown, Figuren platzieren, Snapshot speichern/laden, Kugelsteuerung

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Post-Merge Deploy (nach CI grün + Merge)**

```bash
task feature:brett
```

Verify: `https://brett.mentolder.de` + `https://brett.korczewski.de` — Tabs und Kugel testen.

---

## Self-Review

**Spec-Abdeckung:**
- ✅ Feature 1 Aufstellungstypen: Task 9 (HTML/CSS) + Task 11 (JS-Logik + Save/Load)
- ✅ Feature 2 Kategorie-Tabs: Task 9 (HTML) + Task 10 (bootArtLibrary + renderTabContent)
- ✅ Feature 2 29 neue SVGs: Tasks 3–8
- ✅ Feature 2 manifest.json v2: Task 2
- ✅ Feature 3 Kugelsteuerung: Task 12
- ✅ Cleanup brett-v2.html: Task 13
- ✅ constellationType im Snapshot: Task 11 Steps 4+5
- ✅ Tab-Fokus bei Typ-Wechsel: Task 11 Step 3
- ✅ ctrl-ball-hint div: Task 9 Step 3

**Placeholder-Scan:** Keine TBDs oder "fill in"-Muster.

**Typ-Konsistenz:** `renderTabContent` in Task 10 definiert, aufgerufen in Task 11 Step 3 — Name identisch. `ctrlBall`, `ctrlBallActive`, `ctrlBallDrag`, `ctrlBallStart` in Task 12 Step 1 deklariert, überall konsistent verwendet. `isAnyModalOpen()` in Task 11 Step 1 definiert, in Step 2 verwendet.
