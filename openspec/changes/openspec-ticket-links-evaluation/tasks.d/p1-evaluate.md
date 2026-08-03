# Partial p1 — Bewertungsverfahren ausfuehren

## Scope

Das deterministische Bewertungsverfahren auf alle 41 `.ticket`-losen OpenSpec-Changes
anwenden und das Bewertungsprotokoll `evaluation.md` schreiben. Abschluss je Change:
archiviert oder mit begruendetem Vermerk als offen belassen.

## Task List

### 1. Eingabeliste uebernehmen

- [ ] **1.1** Die 41 Changes aus der Ticket-Beschreibung von T002573 als Eingabeliste
      uebernehmen (`ls openspec/changes/` abgleichen, `archive/` ausschliessen).
- [ ] **1.2** Je Change Schritt 2–5 des Bewertungsverfahrens ausfuehren (siehe Index,
      Abschnitt "Bewertungsverfahren"):
      1. `.ticket`-Existenz pruefen (`[[ -f openspec/changes/<slug>/.ticket ]]`).
      2. Archiv-Gegenstueck pruefen (`ls -d openspec/changes/archive/*<slug>`).
      3. Referenzierte Tickets extrahieren (`grep -rhoE 'T[0-9]{6}'`).
      4. Ticket-Status pruefen (`tickets.tickets.status`).
      5. tasks.md-Status als Zusatzsignal.
- [ ] **1.3** Ergebnis je Change in `evaluation.md` protokollieren:
      `archiviert` oder `offen` + Begruendung (referenzierte Tickets + Status bzw.
      Archiv-Gegenstueck).

### 2. Archivierung ausfuehren

- [ ] **2.1** Fuer alle als `abgeschlossen` klassifizierten Changes:
      `bash scripts/openspec.sh archive <slug> [--create-new]`.
      Vor jedem Lauf die Ziel-SSOT-Existenz pruefen (`ls openspec/specs/<cap>.md`):
      `--create-new` NUR bei fehlender Parent-SSOT (Mishap-Bundles).
- [ ] **2.2** Fuer die 2 obsoleten Duplikate (`brain-ingest-pruefen`, `release-notes-erden`):
      Live-Verzeichnis per `git rm -r` entfernen, KEIN `openspec.sh archive`
      (Doppel-Archiv-Guard T002428).
- [ ] **2.3** Nach jedem Archiv: `task freshness:regenerate` und
      `website/src/data/openspec-status.json` stagen.
- [ ] **2.4** Abschlusskommentar am Ticket T002573 mit je-Change-Ergebnis
      (`bash scripts/ticket.sh add-comment --id T002573 --body "..."`).

## Verify

- `bash scripts/openspec.sh validate` ist gruen (Exit 0).
- `evaluation.md` listet alle 41 Changes mit Ergebnis + Begruendung.
