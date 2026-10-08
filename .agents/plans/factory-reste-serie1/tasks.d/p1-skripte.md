# P1 — Skripte: tote Factory-Kommentare und Meldungstexte bereinigen

Ziel: tote Factory-Prosa in vier Skript-Dateien entfernen. Keine
Verhaltensänderung: nur Kommentare und User-Meldungen; SQL-/REF-Zeilen und
Exit-Codes bleiben identisch.

## Target files
- `scripts/repo-hygiene-precheck.sh` (Ist 184, Budget 616)
- `scripts/vda/ticket/stage-plan.sh` (Ist 178, Budget 622)
- `scripts/lib/ticket-help.sh` (Ist 365, Budget 435)
- `scripts/plan-touched-files.sh` (Ist 116, Budget 684)

## Steps
- [ ] 1. Rot-Stand protokollieren: `git grep -n -i factory --
  scripts/repo-hygiene-precheck.sh scripts/vda/ticket/stage-plan.sh
  scripts/lib/ticket-help.sh scripts/plan-touched-files.sh` — Treffer
  vorhanden, expected: FAIL (Reste vorhanden). Ausgabe in den PR-Body.
- [ ] 2. `scripts/repo-hygiene-precheck.sh`: die drei Kommentar-Zeilen
  (Factory-Lock-Historie, ca. Z. 30/54/136) neutral umformulieren
  (z. B. „frühere Lock-Datei der stillgelegten Factory (per T900399)" oder
  streichen, wo kontextlos). Shell-Syntax danach mit `bash -n` prüfen.
- [ ] 3. `scripts/vda/ticket/stage-plan.sh`: NUR die User-Meldungen
  (ca. Z. 60/69/74/163/172: „Factory greift sofort zu", „Die Factory findet
  sie dann nicht", „factory.timer", `systemctl ... factory.service`) auf
  dev-flow-Begriffe umstellen. TABU: Z. 131–157 (`FACTORY-PLAN-REF`,
  `tickets.factory_phase_events`, `tickets.factory_control`,
  `driver factory|devflow`) — aktive Verträge, bleiben unverändert. Danach
  `bash -n` und `--help`-Smoke.
- [ ] 4. `scripts/lib/ticket-help.sh` (ca. Z. 181 „weckt factory.service")
  und `scripts/plan-touched-files.sh` (ca. Z. 63 Kommentar mit
  `factory.service`-Basename): je Nachweis, ob die Unit noch existiert
  (`systemctl --user status factory.service` / Unit-File-Suche); Meldung
  neutral umformulieren, Verhalten (`|| true`, Exit-Codes) unverändert.
- [ ] 5. Grün-Nachweis: `git grep -I -i factory -- <alle vier Dateien>`
  ist leer; `bash -n` auf allen vier Dateien; relevante BATS-Guards laufen:
  `bats tests/spec/sf-retirement-rest.bats
  tests/spec/decommission/decommission-guard.bats` (müssen grün bleiben).

## Akzeptanz
- Kein `factory`-Treffer (case-insensitiv) mehr in den vier Dateien.
- Guards aus Schritt 5 grün; kein Verhaltensdiff (`git diff` zeigt nur
  Kommentar-/String-Zeilen).
