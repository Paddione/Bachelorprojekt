---
title: Cockpit Ticket Fullscreen — Spec/Lastenheft-Übersicht & Fortschritts-Flagging
slug: cockpit-fullscreen-overview
ticket_id: T000953
plan_ref: null
status: spec
date: 2026-06-20
authors: [paddione]
---

# Cockpit Ticket Fullscreen — Spec/Lastenheft-Übersicht & Fortschritts-Flagging

## Problem

Die Vollansicht eines Tickets (`/admin/tickets/[id]`) zeigt zwar viele Felder, aber:

1. **Falsches Label** — Die Anforderungsliste heißt immer "Lastenheft", egal ob das Ticket
   noch im Pflichtenheft-Modus (unlocked, Entwurf) ist oder bereits verriegelt (Lastenheft,
   KI-bereit). Der Lock-State aus `readiness.lastenheft_locked` wird in der Fullscreen-View
   überhaupt nicht angezeigt.

2. **Fehlende "Noch zu erledigen"-Signale** — Es gibt keine aggregierte Sicht darauf,
   welche Spec-Sektionen noch leer/unfertig sind. Nutzer müssen alle Panels manuell
   absuchen um herauszufinden, was noch fehlt.

3. **Falsche Reihenfolge** — Die aktuelle Sektion-Reihenfolge ist historisch gewachsen und
   spiegelt nicht die logische Spec-Struktur wider. Ein Spec hat eine natürliche Ordnung:
   Problem → Nutzen → Anforderungen → Readiness → Plan → Implementierungsstand.

4. **Schwache Visualisierung des Projekt-States** — Container-Tickets (Feature/Project) haben
   Rollup-Metriken, DOR-Scores, Plan, Children. Diese hängen unverbunden nebeneinander statt
   ein kohärentes Bild des Projektzustands zu zeichnen.

## Ziel (Why)

Die Vollansicht soll die **einzige Anlaufstelle** für den vollständigen Projektzustand eines
Tickets sein — ohne Rätselraten, ohne Suchen. Wer die Seite öffnet, sieht sofort:

- Welche Spec-Informationen vorhanden sind (Beschreibung, Value Prop, Anforderungen, Plan)
- Was noch aussteht (Ampel-Indikator pro Sektion)
- Ob das Ticket implementierungsbereit ist (DOR komplett, Lastenheft verriegelt, Plan vorhanden)
- Wo sich das Projekt im Lifecycle befindet (Entwurf → Lastenheft → Plan → In Progress → Done)

---

## Lösung: Drei Änderungspakete

### Paket 1 — Dynamisches Pflichtenheft/Lastenheft-Label

**ContainerDorPanel.svelte** bekommt `lastenheftLocked: boolean` als neues Prop.

- **Unlocked**: Heading = "Pflichtenheft", Badge = "✏ Entwurf" (amber)
- **Locked**: Heading = "Lastenheft", Badge = "🔒 verriegelt · KI-bereit" (green)
- Wenn `requirementsList.length === 0`: Zeige "⚠ Keine Anforderungen erfasst" in amber
  (statt gar nichts zu rendern)

`ContainerDor` Interface in `container-detail.ts` bekommt `lastenheftLocked: boolean`.
`getContainerDor()` liest `isLastenheftLocked(readiness)` aus dem already-imported Helper.

### Paket 2 — TicketSpecProgress: "Noch zu erledigen"

Neues Svelte-Component `website/src/components/admin/TicketSpecProgress.svelte`.

Zeigt eine kompakte Fortschritts-Checkliste mit Ampel-Logik:

| Eintrag | Quell-Feld | Grün wenn | Amber wenn |
|---------|-----------|-----------|-----------|
| Beschreibung | `ticket.description` | ≥ 1 Zeichen | leer |
| Value Prop | `dor.valueProp` | ≥ 1 Zeichen | leer |
| Anforderungen erfasst | `dor.requirementsList.length` | ≥ 1 | 0 |
| Lastenheft verriegelt | `dor.lastenheftLocked` | `true` | `false` |
| Spec skizziert | `dor.readiness.spec_skizziert` | `true` | `false` |
| Offene Fragen geklärt | `dor.readiness.offene_fragen_geklaert` | `true` | `false` |
| Abhängigkeiten klar | `dor.readiness.abhaengigkeiten_klar` | `true` | `false` |
| Aufwand geschätzt | `dor.readiness.aufwand_geschaetzt` | `true` | `false` |
| Plan vorhanden | `containerPlan !== null` | `true` | `false` |
| PR erstellt | `containerPlan?.prNumber !== null` | `true` | `false` |

- Zeile: `✓` (grün) oder `○` (amber/muted) + Label + optionaler Hinweistext
- Header: `Fertig: X/10` mit kleiner Fortschrittsleiste
- Kompakt, max. 2 Spalten auf großem Viewport
- Nur für Container-Tickets (`type in ['project','feature']`)

### Paket 3 — Sektion-Reihenfolge in [id].astro

Neue logische Reihenfolge der Main-Column (links):

```
1. Beschreibung           ← wie bisher (aber mit ⚠ "Noch leer"-Hinweis wenn leer)
2. TicketSpecProgress     ← NEU: "Noch zu erledigen"-Checkliste (nur Container)
3. ContainerDorPanel      ← jetzt MIT dynamischem Pflichtenheft/Lastenheft-Label
4. TicketPlanPanel        ← wie bisher
5. ContainerChildrenList  ← wie bisher
6. GrillingStepper        ← nach hinten geschoben (Meta-Infos, nicht Spec-Infos)
7. Verknüpfungen          ← wie bisher
8. Verlauf                ← wie bisher
9. Anhänge                ← wie bisher
```

`ProjectQuestionnairesPanel` bleibt hinter GrillingStepper (nur für project-type).

---

## Nicht im Scope

- Kein Editieren der Anforderungen in der Fullscreen-View (bleibt im Planning Office)
- Kein Lock/Unlock-Toggle in der Fullscreen (bleibt im Planning Office)
- Keine Änderungen an der API-Whitelist oder Datenbankschema
- Keine Änderungen am Drawer (TicketDrawer.svelte)
- Keine Änderungen am Cockpit-Board selbst

---

## Daten-Flow

```
[id].astro
  ├── getContainerDor() → ContainerDor { ..., lastenheftLocked: boolean }  ← NEU
  └── containerPlan: TicketPlan | null

ContainerDorPanel.svelte
  └── Props: dor (ContainerDor incl. lastenheftLocked)
  └── Zeigt: Pflichtenheft oder Lastenheft (label dynamisch), Lock-Badge

TicketSpecProgress.svelte (NEU)
  └── Props: ticket, dor (ContainerDor), hasPlan: boolean, hasPr: boolean
  └── Zeigt: Fortschritts-Checkliste
```

---

## Acceptance-Kriterien

1. **AC-1**: Ticket mit `lastenheft_locked = false` → Panel zeigt "Pflichtenheft" + "✏ Entwurf" Badge
2. **AC-2**: Ticket mit `lastenheft_locked = true` → Panel zeigt "Lastenheft" + "🔒 verriegelt · KI-bereit" Badge
3. **AC-3**: Ticket ohne Anforderungen → Panel zeigt "⚠ Keine Anforderungen erfasst" (amber), kein leer-leeres Panel
4. **AC-4**: TicketSpecProgress zeigt korrekte Grün/Amber-Zustände für alle 10 Einträge
5. **AC-5**: Sektion-Reihenfolge folgt Spec-Logik (Beschreibung → Progress → DOR → Plan → Children → Grilling → Links → Timeline → Anhänge)
6. **AC-6**: Kein TypeScript-Fehler, keine S1-Ratchet-Verletzung
7. **AC-7**: Nur für Container-Tickets (`type in ['project','feature']`); non-container sieht kein `TicketSpecProgress` und kein DOR-Panel

---

## Technische Constraints

- S1-Budget: `[id].astro` ist nicht gebaselined — Netto-Änderung muss zeilenneutral oder kleiner sein (Umsortierung, kein Aufblasen)
- `ContainerDorPanel.svelte`: derzeit 42 Zeilen — bleibt unter 80 Zeilen nach Änderung
- `TicketSpecProgress.svelte`: neu, ~60 Zeilen Ziel
- `container-detail.ts`: +1 Feld-Import, +2 Zeilen → zeilenneutral

---

## Verwandte Tickets / Kontext

- T000950: Cockpit Rollup/Vollansicht (View-Fix, Vorläufer)
- PlanningOfficeDetail.svelte: hat bereits vollständiges Lock-UI — **nicht duplizieren**
- `lastenheft.ts`: Pure helpers, bereits vorhanden — importieren, nicht re-implementieren
