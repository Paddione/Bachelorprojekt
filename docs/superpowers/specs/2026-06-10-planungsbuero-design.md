# Spec: Planungsbüro / Feature-Backlog für die Software Factory

**Datum:** 2026-06-10
**Branch:** `feature/planungsbuero`
**Status:** Design abgenommen (Brainstorm 2026-06-10)
**Brands:** beide (mentolder + korczewski)

## Problem

`feature-intake` produziert Feature-Ideen, `dev-flow-plan` zieht sie zur Planung heraus —
aber **dazwischen gibt es keinen sichtbaren, kuratierten Ort**. Bereits ausgewählte
(„auserkoren") Features, die noch nicht an der Reihe sind, verschwinden in Chat-Verläufen
oder rohen `triage`-Tickets. Es fehlt eine Bühne zwischen Idee und Plan, die
planungskritische Größen festhält und im Software-Factory-Dashboard sichtbar ist.

## Lösung (Überblick)

Eine neue, voll-interaktive Admin-Ansicht **„Planungsbüro"** vor der bestehenden
Werkshalle. Sie kuratiert Feature-Ideen mit planungskritischen Metadaten +
Definition-of-Ready-Tracking und übergibt den nächsten Kandidaten kontextreich an
`dev-flow-plan` — **nicht** an die autonome Factory.

Erweiterter Lebenszyklus eines Tickets:

```
triage → planning (Büro) → backlog (Laderampe) → in_progress (Halle) → done (Versand)
```

Der Factory-Dispatcher rührt `planning` nicht an (er greift erst ab `status='backlog'`).
Das Büro ist damit sauber von der autonomen Produktion isoliert.

## Entscheidungen (aus dem Brainstorm)

| # | Frage | Entscheidung |
|---|-------|--------------|
| 1 | Modellierung der Vorstufe | **Neuer expliziter Status `planning`** (nicht `triage`-Reuse, kein Flag) |
| 2 | DoR-Darstellung | **Strukturierte JSONB-Checkliste** mit „X/4"-Indikator |
| 3 | Übergang aus dem Büro | **Übergabe an `dev-flow-plan`** (kuratierte Metadaten als Kontext); nicht direkt an Factory |
| 4 | UI-Interaktivität | **Voll-interaktiv** (anlegen, editieren, ranken, DoR togglen, befördern) |
| 5 | Layout | **Eigene Ansicht** `PlanningOffice.svelte` (Tab); Werkshalle unverändert + „N im Büro"-Zähler |

## 1. Datenmodell

Additive Änderungen an `tickets.tickets` (Definition in
`website/src/lib/tickets-db.ts`). Migration muss **idempotent** sein (re-run-safe).

- `status`-CHECK-Constraint um `'planning'` erweitern.
  Neuer gültiger Satz: `triage | planning | backlog | in_progress | in_review | blocked | done | archived`.
- Neue Spalten:
  - `value_prop TEXT` — Kern-Nutzen in einem Satz.
  - `effort TEXT CHECK (effort IN ('klein','mittel','gross'))` — kategorialer Aufwand.
  - `areas TEXT[]` — berührte Bereiche (z.B. `{Brett}`, `{Website}`, `{Infra}`).
  - `depends_on TEXT[]` — Abhängigkeiten als `external_id`-Liste (kein Join-Table; YAGNI).
  - `planning_rank INTEGER` — manuelle Reihenfolge in der Warteschlange (0 = oben).
  - `readiness JSONB` — Definition-of-Ready-Checkliste, siehe unten.

### Definition of Ready (`readiness` JSONB)

Feste 4er-Checkliste mit Booleans:

```json
{
  "spec_skizziert": false,
  "offene_fragen_geklaert": false,
  "abhaengigkeiten_klar": false,
  "aufwand_geschaetzt": false
}
```

- Indikator „X/4" in der Karte.
- „Als nächstes planen" ist erst bei **4/4** freigeschaltet (Admin-Override möglich).
- Fehlende/leere `readiness` zählt als 0/4.

### Kompatibilität mit bestehenden Consumern

Bestehende Factory-Queries filtern **explizit** (`status='backlog'`, `status='done'`,
`status IN ('in_progress','in_review')`) — das neue `planning` taucht dort nicht
fälschlich auf. Zu prüfen: kein Consumer nutzt `status NOT IN (...)`, der `planning`
implizit einschließen würde. Die Admin-Ticket-Liste darf `planning`-Items zeigen.

## 2. Backend / API

Neues Modul `website/src/lib/planning-office.ts` (analog `factory-floor.ts`) +
Routen unter `website/src/pages/api/planning-office/`. Alle Routen **`isAdmin()`-gated**.

- `GET /api/planning-office`
  → gerankte Liste aller `type='feature' AND status='planning'` mit allen Feldern
  (`external_id, title, value_prop, priority, effort, areas, depends_on, planning_rank,
  readiness, created_at, updated_at`), sortiert nach `planning_rank ASC, created_at ASC`.
- `POST /api/planning-office`
  → neue Idee anlegen (`status='planning'`, `type='feature'`), Felder aus Body.
- `PATCH /api/planning-office/[extId]`
  → einzelne Felder editieren: Metadaten, `planning_rank` (▲▼), `readiness` (DoR-Toggle).
- `POST /api/planning-office/[extId]/promote`
  → „Als nächstes planen", siehe §4.

Validierung: `effort`-Enum, `areas`/`depends_on` als String-Arrays, `readiness` als
Objekt mit den vier bekannten Keys. Unbekannte Keys verwerfen.

## 3. CLI (`scripts/ticket.sh`)

Erweiterungen für Symmetrie + `feature-intake`-Seeding (alle offline-/DB-gated,
über `_pgpod()` wie bestehende Subcommands):

- `create` akzeptiert `--status planning` (bereits via generischem `--status` möglich;
  sicherstellen, dass `planning` die Validierung passiert).
- `plan-meta set --id <ext> [--value-prop ..] [--effort ..] [--areas a,b]
  [--depends-on T-1,T-2] [--rank N] [--readiness key=true,..]` — setzt die neuen Felder.
- `plan-meta get --id <ext>` — gibt die Büro-Metadaten als JSON zurück.

So legt der Brainstorm-Modus von `feature-intake` Tickets direkt büro-fertig an.

## 4. Übergang „Als nächstes planen" (promote)

`dev-flow-plan` ist ein **interaktiver Skill** — der Button kann keinen autonomen Lauf
starten. Stattdessen bereitet `promote` die Übergabe vor:

1. Setzt `planning_rank = 0` (oben) und ein sichtbares Badge **„📌 Nächster Plan-Kandidat"**
   (z.B. via `readiness`-Begleitfeld oder Ticket-Marker; Implementierung im Plan zu wählen).
2. Assembliert die kuratierten Metadaten (Kern-Nutzen, Bereiche, `depends_on`, Aufwand,
   Priorität, Titel) zu einem **fertigen `dev-flow-plan`-Kontextblock** und legt ihn als
   Ticket-Kommentar/Injection ab (`ticket_comments` / `inject`-Mechanik).
3. Ein Mensch/Agent startet `dev-flow-plan`; dieses liest den Block als
   `<active-plans>`-artigen Kontext.

Das Ticket bleibt `status='planning'`, bis der Plan gestaged ist; danach flippt der
bestehende `enqueue`-Pfad es auf `status='backlog'` (→ Laderampe → Factory).
**Spur „In Planung"** = `planning`-Items mit 📌-Badge.

Voraussetzung für promote: DoR = 4/4 oder expliziter Admin-Override.

## 5. Frontend

Neue Komponente `website/src/components/PlanningOffice.svelte` + Einbindung als
eigene Ansicht/Tab (neben der Werkshalle/`FactoryFloor.svelte`).

- **Layout:** gerankte Karten-Liste (links) + Detail-Editor (rechts, Slide-in).
- **Karte:** Titel, Aufwand-Badge, Bereich-Chips, DoR „X/4", ▲▼-Rang-Buttons,
  Promote-Button (disabled < 4/4 ohne Override).
- **Editor:** alle Felder editierbar; DoR-Checkboxen; `depends_on`-Picker
  (Auswahl aus vorhandenen `external_id`s); „+ Neue Idee anlegen"-Form.
- **Styling:** Tailwind v4 + Brand-CSS, konsistent mit `FactoryFloor.svelte`
  (gold/emerald/amber Akzente). Eigene `data-testid`-Selektoren
  (`office-list`, `office-card`, `office-dor`, `office-rank-up/down`, `office-promote`,
  `office-add-form`, `office-editor`, …).
- **Werkshalle:** unverändert, erhält nur einen kleinen **„N im Büro"**-Zähler im
  Leitstand (Link zur Büro-Ansicht).

## 6. Seeding

- `feature-intake` legt künftig im Brainstorm-Modus Ideen mit `status=planning` +
  Büro-Metadaten an (statt rohem `triage`).
- **5 Erst-Insassen** als initiale Büro-Einträge:
  1. `[Brett]` Board-Templates — Aufwand mittel
  2. `[Brett]` Figuren-Gesten / Animationen — Aufwand groß
  3. `[Website]` Newsletter-Vorlagen-Bibliothek — Aufwand mittel
  4. `[Website]` Bild-Upload im HTML-Editor — Aufwand mittel
  5. `[Infra]` Auto-Deploy bei Merge — Aufwand groß

## 7. Testing

- **BATS** (offline-safe): neue/erweiterte `ticket.sh`-Subcommands (`plan-meta set/get`,
  `create --status planning`), Migration-Idempotenz. In `task test:all` einhängen.
- **Playwright**: PlanningOffice-CRUD (anlegen, editieren), Rang ▲▼, DoR-Toggle,
  promote-Gate (disabled < 4/4). Passendes Playwright-Projekt im Plan zuweisen.
- `website/src/data/test-inventory.json` regenerieren (CI-Gate).

## Nicht-Ziele (YAGNI)

- Keine autonome Factory-Übergabe aus dem Büro (Option B/C aus Frage 3 verworfen).
- Kein Drag-&-Drop-Ranking in v1 (▲▼-Buttons genügen).
- Keine Join-Tabelle für Abhängigkeiten (Array reicht).
- Kein Multi-User-Realtime-Sync (Standard-Fetch/Reload wie restliches Dashboard).

## Berührte Bereiche

- `website/src/lib/tickets-db.ts` (Schema/Migration)
- `website/src/lib/planning-office.ts` (neu)
- `website/src/pages/api/planning-office/*` (neu)
- `website/src/components/PlanningOffice.svelte` (neu) + Ansicht/Tab-Einbindung
- `website/src/components/FactoryFloor.svelte` (Zähler)
- `scripts/ticket.sh` (`plan-meta`)
- `.claude/skills/feature-intake/SKILL.md` (Seeding mit `status=planning`)
- Tests: BATS + Playwright + `test-inventory.json`
