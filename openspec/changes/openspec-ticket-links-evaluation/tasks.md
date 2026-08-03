---
title: "OpenSpec: Changes ohne .ticket-Link bewerten — Implementation Plan"
ticket_id: T002573
domains: [openspec, scripts]
status: plan_staged
---

# OpenSpec: Changes ohne .ticket-Link bewerten — Implementation Plan

_Ticket: T002573_ — type=chore, priority=niedrig, severity=trivial, effort=mittel.

## Ziel

Die 41 OpenSpec-Change-Verzeichnisse unter `openspec/changes/`, die keinen `.ticket`-Link
tragen, bewerten und abschliessen. Abschlussstatus ist maschinell nicht direkt bestimmbar
(kein `.ticket`-Guard), daher definiert dieser Plan ein **deterministisches Bewertungsverfahren**
und wendet es auf alle 41 Changes an. Ergebnis je Change: **archiviert** oder **mit begruendetem
Vermerk als offen belassen** (AC3 aus T002569).

## Ausgangslage (erhoben 2026-08-03)

- 41 Changes ohne `.ticket`-Datei unter `openspec/changes/` (Liste unten, aus T002569 ausgegliedert).
- **Alle 41 referenzieren in ihrem Inhalt (proposal.md/tasks.md/design.md) mindestens ein Ticket.**
  Die referenzierten Tickets sind **ausnahmslos `done` oder `archived`** (DB-Abfrage 2026-08-03,
  `tickets.tickets.status`). Es handelt sich also um reinen **Vollzugs-Rueckstau**: die Arbeit ist
  erledigt, nur der Archivierungsschritt wurde nie ausgefuehrt.
- 2 Changes (`brain-ingest-pruefen`, `release-notes-erden`) haben bereits ein **Archiv-Gegenstueck**
  unter `openspec/changes/archive/<slug>/` (Legacy-Layout ohne Datumspraefix) — sie sind **obsolete
  Duplikate**: das Live-Verzeichnis muss entfernt, nicht erneut archiviert werden.
- `scripts/openspec-status-map.sh` skippt Changes ohne `.ticket` bereits (kein Website-Pollut).
- `scripts/openspec.sh archive` ueberspringt den Ticket-Status-Guard, wenn keine `.ticket`-Datei
  existiert (Zeile 222: `[[ -f "$dir/.ticket" ]]`) — Archivierung ist also ohne Ticket moeglich.

## Bewertungsverfahren (deterministisch, je Change)

Fuer jeden der 41 Changes in Reihenfolge:

1. **`.ticket`-Existenz pruefen** — `[[ -f openspec/changes/<slug>/.ticket ]]`. Existiert eine,
   ist der Change NICHT Teil dieses Tickets (aus T002569 ausgegliedert) → ueberspringen.
2. **Archiv-Gegenstueck pruefen** — `ls -d openspec/changes/archive/*<slug> 2>/dev/null`.
   Existiert eines (Legacy-Layout `archive/<slug>/`), ist der Change ein **obsoletes Duplikat**:
   Live-Verzeichnis entfernen (`git rm -r`), KEIN `openspec.sh archive` (wuerde Doppel-Archiv
   erzeugen). Vermerk im Abschlusskommentar.
3. **Referenzierte Tickets extrahieren** — `grep -rhoE 'T[0-9]{6}' openspec/changes/<slug>/`.
   Leere Menge → Change ist **offen** (kein Ticket-Bezug, Abschluss nicht belegbar) → mit
   begruendetem Vermerk belassen.
4. **Ticket-Status pruefen** — alle referenzierten Tickets via `tickets.tickets.status` abfragen.
   - Alle `done`/`archived` → Change ist **abgeschlossen** → archivieren.
   - Mindestens ein Ticket nicht-terminal → Change ist **offen** → mit Vermerk belassen.
5. **tasks.md-Status als Zusatzsignal** — `status:`-Frontmatter. `completed` bestaetigt
   Abschluss; `active`/`planning`/`staged`/`plan_staged`/fehlend ist kein Widerspruch, wenn
   Schritt 4 alle Tickets terminal liefert (Frontmatter ist haeufig stale).
6. **Archivieren** — `bash scripts/openspec.sh archive <slug> [--create-new]`.
   - `--create-new` NUR wenn das Delta auf eine **nicht existierende** Parent-SSOT-Spec zielt
     (Mishap-Bundles ohne Parent, z.B. `capability.md`, `health-goals.md`, `mishap-bundle.md`).
     Ohne das Flag bricht `_merge_delta` mit "Target ... does not exist" ab.
   - Nach jedem Archiv-Lauf: `task freshness:regenerate` + `website/src/data/openspec-status.json`
     stagen (Konvention aus plan-archive-steps.md Schritt 4).
7. **Vermerk** — je Change ein Abschlusskommentar am Ticket (archiviert / offen + Begruendung).

## File Structure

```
openspec/changes/openspec-ticket-links-evaluation/
  tasks.md                     <- dieser Plan (Index)
  evaluation.md                <- Bewertungsprotokoll: je Change Ergebnis + Begruendung
tests/spec/openspec-ticket-links-evaluation.bats   <- STRUCT2-Failing-Test (siehe p2)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-evaluate.md | impl | `openspec/changes/openspec-ticket-links-evaluation/evaluation.md` | |
| p2 | tasks.d/p2-tests.md | tests | `tests/spec/openspec-ticket-links-evaluation.bats` | p1 |

### p1 — evaluate: Bewertungsverfahren ausfuehren

**Rolle:** impl — wendet das Bewertungsverfahren auf alle 41 Changes an und schreibt das
Bewertungsprotokoll `evaluation.md`.

1. Die 41 Changes aus der Ticket-Beschreibung als Eingabeliste uebernehmen.
2. Fuer jeden Change die Schritte 1–5 des Bewertungsverfahrens ausfuehren (`.ticket`-Check,
   Archiv-Gegenstueck, Ticket-Extraktion, Ticket-Status, tasks.md-Status).
3. Ergebnis je Change in `evaluation.md` protokollieren: `archiviert` oder `offen` + Begruendung
   (referenzierte Tickets + Status, oder Archiv-Gegenstueck).
4. Fuer alle als `abgeschlossen` klassifizierten Changes: `bash scripts/openspec.sh archive <slug>`
   (mit `--create-new` wo noetig) ausfuehren.
5. Fuer die 2 obsoleten Duplikate (`brain-ingest-pruefen`, `release-notes-erden`): Live-Verzeichnis
   per `git rm -r` entfernen (KEIN `openspec.sh archive`).
6. Nach jedem Archiv: `task freshness:regenerate` und `website/src/data/openspec-status.json` stagen.
7. Abschlusskommentar am Ticket T002573 mit je-Change-Ergebnis.

**Verify:** `bash scripts/openspec.sh validate` ist gruen; `evaluation.md` listet alle 41 Changes.

### p2 — tests: Failing-Test, dass kein `.ticket`-loser Change verbleibt

**Rolle:** tests — schreibt den STRUCT2-Failing-Test.

1. Bats-Test `tests/spec/openspec-ticket-links-evaluation.bats` anlegen.
2. Test 1: Fuer jeden Change unter `openspec/changes/` (ausser `archive/`) existiert eine
   `.ticket`-Datei ODER der Change ist in `evaluation.md` als `offen` mit Begruendung vermerkt.
   → Erwartet: FAIL solange noch unarchivierte `.ticket`-lose Changes ohne Vermerk existieren.
3. Test 2: `evaluation.md` deckt alle 41 Changes aus der Ticket-Beschreibung ab (kein Change
   fehlt im Protokoll).
4. Test 3: `bash scripts/openspec.sh validate` liefert Exit 0 (kein Change ohne `specs/`-Delta).

**Verify:** `bats tests/spec/openspec-ticket-links-evaluation.bats` — Test 1 schlaegt vor der
Archivierung fehl (erwartet FAIL), nach Abschluss von p1 ist er gruen.

## Verify (final)

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/openspec-ticket-links-evaluation/tasks.md
```

## Risiken

- **`--create-new`-Fehlklassifikation:** Ein Delta auf eine existierende SSOT mit `--create-new`
  erzeugt eine ueberfluessige Komponente; ohne das Flag auf eine fehlende SSOT bricht der Lauf ab.
  Vor jedem Archiv-Lauf die Ziel-SSOT-Existenz pruefen (`ls openspec/specs/<cap>.md`).
- **Doppel-Archiv:** `openspec.sh archive` verweigert, wenn `archive/<datum>-<slug>` existiert
  (T002428-Guard). Die 2 obsoleten Duplikate muessen per `git rm` entfernt, nicht archiviert werden.
- **SSOT-Mutation:** Archivieren merged Deltas in `openspec/specs/`. Nur im Worktree ausfuehren,
  nie im Hauptcheckout (T002567-Falle). Ergebnis ueber PR mit gruener CI.
- **Freshness:** `website/src/data/openspec-status.json` muss in denselben Commit wie die
  Archivierung (plan-archive-steps.md Schritt 4), sonst meldet CI stale.
