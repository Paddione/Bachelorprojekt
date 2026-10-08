---
page: files-search
ticket: T901046
status: complete
actions:
  - find-file
  - live-grep
  - buffers
  - recent-files
  - related-open
---

## Voraussetzungen

- Picker `snacks.picker` geladen (p2-Entscheid).
- `fd` auf PATH (sonst dokumentierter Fallback: snacks file finder ohne
  fd, grep via `rg`).

## Geordnete Schritte

1. **find-file**: Datei im Buffer-Git-Root finden (cwd = aktueller Buffer-Root).
2. **live-grep**: Repo-weit suchen (cwd = Buffer-Root).
3. **buffers**: Offene Buffer waehlen.
4. **recent-files**: Zuletzt geoeffnete Dateien waehlen.
5. **related-open**: Datei aus dem Projektumfeld oeffnen.

Jede Aktion nutzt `core.gitroot` (unbenannte Buffer und Dateien ausserhalb
Git melden klar statt zu raten).

## Erwartetes Ergebnis

Alle fuenf Aktionen vorhanden und registriert; Auswahl fokussiert, Enter
fuehrt bestaetigt aus; geoeffnete Datei liegt unter dem Buffer-Root.

## Troubleshooting

- **Leere Trefferliste**: Buffer-Root pruefen (`find-file` ausserhalb Git
  meldet "no project").
- **fd fehlt**: `executable()`-Probe faellt automatisch auf den
  Standard zurueck; `fd` installieren behebt es dauerhaft.

## Recovery

Keine: Suchen veraendert nichts.
