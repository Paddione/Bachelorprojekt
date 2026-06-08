# Spec: coaching-demo-ready

**Datum:** 2026-06-08  
**Branch:** feature/coaching-demo-ready  
**Ticket:** null (wird nach Plan-Erstellung gesetzt)

## Ziel

Drei gezielte Verbesserungen machen die App demo-tauglich als Coaching-Tool für einen nicht-technischen Coach (Gekko), der live eine Systembrett-Sitzung mit einem Klienten (Patrick) durchführt.

**Demo-Szenario:** Gekko loggt sich auf mentolder.de ein, legt eine Beziehungsdynamik-Sitzung an, öffnet das Brett-Board, platziert Figuren mit Emotionen und navigiert sicher durch die erste Sitzung ohne externe Hilfe.

---

## Feature 1 — Demo-Template: Beziehungsdynamik (DB-geseedet)

### Problem
Beim Erstellen einer Brett-Session muss der Coach heute alle Coaching-Schritte manuell eintippen. Im Demo-Kontext führt das zu einem peinlichen Leerlauf.

### Lösung

**Neues DB-Schema** (`website/src/db/migrations/`): Tabelle `brett.coaching_templates`

```sql
CREATE TABLE brett.coaching_templates (
  id          TEXT PRIMARY KEY,
  brand       TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL,   -- string[]
  is_system   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

**Seed-Datei** (`website/src/db/seeds/brett-templates.ts`): Ein System-Template für `mentolder`:

```
Name: "Beziehungsdynamik — Familiensystem"
Steps:
1. "Welche Personen gehören zu deinem System? Benenne jede Figur."
2. "Platziere dich selbst. Wo stehst du in diesem System?"
3. "Platziere die anderen Personen. Wie nah oder weit sind sie zu dir?"
4. "Welche Verbindungen bestehen? Ziehe Linien zwischen den Figuren."
5. "Welche Figur zieht deine Aufmerksamkeit am stärksten an?"
6. "Was würde sich verschieben, wenn du eine Position veränderst?"
7. "Was nimmst du aus dieser Konstellation mit?"
```

**Website-Integration:**
- Neuer API-Endpunkt: `GET /api/brett/templates?brand=mentolder` → gibt alle aktiven Templates zurück
- Brett-Server-Endpunkt: `GET /api/templates` → proxied vom Website-Server ODER direkt aus der DB (Brett hat eigenen DB-Zugang via `DATABASE_URL`)
- Bestehende Brett-Lobby: `templateId` aus `state.settings` → beim Laden der Lobby automatisch Template-Schritte in die Coaching-Steps-Textarea einsetzen, sofern die Textarea noch leer ist
- Website Admin Session-Erstellung: Dropdown "Brett-Template" zeigt alle `brett.coaching_templates` für die Brand

**Datenfluss:**
```
Admin erstellt Session (templateId=X) 
  → Brett-Session-Code enthält templateId 
  → Lobby lädt, templateId ist in state.settings 
  → Lobby fetcht GET /api/templates/:id 
  → steps[] füllt Coaching-Steps-Textarea
```

---

## Feature 2 — Appearance-Picker: Figur anklicken → Drawer öffnet direkt

### Problem
Der Appearance-Drawer existiert bereits (`brett/src/client/ui/appearance.ts`), ist aber über einen kleinen Button in der UI versteckt. Für einen nicht-technischen Coach ist die Verbindung "Figur = Emotion ändern" nicht intuitiv.

### Lösung

**Direktes Öffnen per Doppelklick auf Figur:**
- In `brett/src/client/scene.ts` oder dem Figur-Click-Handler: Doppelklick auf eine Figur (`dblclick`-Event im Raycaster) → öffnet direkt den Appearance-Drawer für diese Figur, ohne dass der Coach erst den `appearance-btn` finden muss
- Einfacher Klick: weiterhin Figur auswählen (bestehende Logik unverändert)

**Floating Badge bei Figur-Auswahl:**
- Wenn eine Figur ausgewählt ist, erscheint ein kleines `Gesicht + ✏️`-Badge in Screen-Space nahe der Figur (HTML-Overlay, per `Three.js`-Projektion positioniert)
- Badge verschwindet, wenn Selektion aufgehoben wird oder Drawer öffnet
- Badge-Klick → öffnet Appearance-Drawer (identisch zu Doppelklick)

**Kein neuer Drawer nötig** — der bestehende `appearance-drawer` in `appearance.ts` bleibt unverändert. Nur die Einstiegspunkte werden ergänzt.

**Scope-Abgrenzung:**
- Nur für `leiter`-Rolle sichtbar (bestehende `appBtn.disabled = !id`-Logik bleibt erhalten)
- Nur Doppelklick + Badge als neue Einstiegspunkte; bestehender `appearance-btn` bleibt

---

## Feature 3 — Brett-Onboarding-Overlay (Toast-Sequenz, einmalig)

### Problem
Beim ersten Öffnen des Boards steht ein nicht-technischer Coach vor einer leeren 3D-Szene ohne Orientierung.

### Lösung

**Neue Datei:** `brett/src/client/ui/onboarding.ts`

**LocalStorage-Key:** `brett_onboarding_v1` (versioned für künftige Resets)

**Logik:**
- Beim Initialisieren der Brett-Szene (`main.ts`): prüfe `localStorage.getItem('brett_onboarding_v1')`
- Wenn nicht gesetzt: starte Toast-Sequenz nach 1s Delay (Szene muss geladen sein)
- Nur für `leiter`-Rolle (Admin/Coach), nicht für Klienten

**Toast-Sequenz (3 Schritte):**

```
Toast 1 — "Figur hinzufügen"
  Text: "Klicke auf das + Icon, um eine Figur ins Brett zu setzen."
  Highlight: fig-panel-btn (oben links)
  Button: "Weiter →"

Toast 2 — "Emotion wählen"  
  Text: "Doppelklicke eine Figur, um ihr ein Gesicht und Accessory zuzuweisen."
  Highlight: keine (allgemein auf Board-Bereich)
  Button: "Weiter →"

Toast 3 — "Verbindung ziehen"
  Text: "Halte eine Figur gedrückt und ziehe zu einer anderen, um eine Verbindung zu erstellen."
  Highlight: keine (allgemein)
  Button: "Verstanden ✓"
```

**Rendering:**
- Jeder Toast: fixiertes `div` (bottom-center), halbtransparenter Hintergrund, weiße Schrift, max-width 320px
- Non-blocking: Board voll bedienbar während Toasts sichtbar
- "Weiter →" / "Verstanden ✓" → nächster Toast / letzter Toast setzt `localStorage.getItem('brett_onboarding_v1') = '1'` und entfernt alle Toasts aus dem DOM
- Kein Auto-Dismiss — nur per Button

**Kein Dependency auf externe Tour-Library** (Driver.js o.ä.) — plain DOM/CSS.

---

## Technische Constraints

- Brett-Client ist TypeScript + Three.js, kein React/Svelte
- Brett baut via `tsc` → `dist/`, Assets in `public/assets/`
- Website ist Astro + Svelte + PostgreSQL via `pg` Pool
- Migrations laufen via `task db:migrate` (Flyway oder eigenes Script — prüfe `website/src/db/`)
- Demo läuft live auf `mentolder.de`, Branch wird deployed via `task feature:brett`

## Tests

- **Feature 1:** BATS-Test: Seed-Script läuft ohne Fehler; API-Endpunkt gibt Template zurück
- **Feature 2:** Vitest-Test: Appearance-Drawer öffnet sich bei Doppelklick (DOM-Mock)
- **Feature 3:** Vitest-Test: Onboarding-Toast erscheint wenn kein localStorage-Key; erscheint nicht wenn Key gesetzt; setzt Key nach "Verstanden"

## Out of Scope

- Client-Portal / Klient-Login
- Session-Export/PDF-Zusammenfassung
- Mobile-Optimierung
- Template-Editor in Admin-UI (nur Seed, kein CRUD)
