# Proposal: t1224-lockfile-drift

## Why

Die Koexistenz verschiedener Paketmanager im Repository (pnpm für `website` und `mentolder-web`, npm für Root, `brett` und andere Subprojekte) führt ohne strikte Kontrollen zu Lockfile-Drift. Wenn ein Entwickler oder Agent versehentlich `npm install` im `website/`-Verzeichnis ausführt, wird dort eine `package-lock.json` erzeugt. Diese verbleibt oft unbemerkt auf der Festplatte oder wird versehentlich eingecheckt, was zu Verwirrung bei Build-Pipelines und Redundanzen führt.

## What

Wir implementieren einen neuen automatischen Guard im Code-Quality-System (Gate S5: Lockfiles), um unzulässige Lockfiles zu erkennen und zu verbieten.
Die konkreten Schritte umfassen:
1. Bereinigung der aktuellen Git-Historie durch Entfernen von `website/package-lock.json` aus dem Index.
2. Ignorieren von `package-lock.json` in `website/.gitignore`.
3. Einführung des neuen Code-Quality-Gates S5 (`s5-lockfiles.mjs`), das die korrekten Lockfiles per Subprojekt prüft und erzwingt.
4. Definition der Deklarationsregeln in `docs/code-quality/gates.yaml` und Validierung in `validate.mjs`.
5. Unit Tests für das neue Gate in `s5-lockfiles.test.mjs` zur Absicherung.

_Ticket: T001224_
