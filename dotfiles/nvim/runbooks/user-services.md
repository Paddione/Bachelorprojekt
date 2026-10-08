---
page: user-services
ticket: T901058
status: complete
actions:
  - service-list
  - service-start
  - service-stop
  - service-restart
  - unit-open
---

## Voraussetzungen

- systemd-User-Session (`systemctl --user` funktioniert).
- Windows: Aufruf via WSL-Distribution (siehe Modulkopf).

## Geordnete Schritte

1. **service-list**: Units alphabetisch listen (Autostart-State sichtbar;
   K11-Sortierung ohne hart codierte Namen).
2. **service-start**: Unit auswaehlen — Start nur nach expliziter Auswahl
   (Aktionsmodell-Dialog).
3. **service-stop**: Unit auswaehlen — Stopp nur nach Auswahl.
4. **service-restart**: Unit auswaehlen — Restart nur nach Auswahl.
5. **unit-open**: Unit auswaehlen — installierte Unit-Datei oeffnen
   (nach Speichern: `daemon-reload`, Restart separat).

## Erwartetes Ergebnis

Alle Starts bestaetigt; keine hart codierte Sortierung; Unit-Edit mit
klarem Reload-Hinweis.

## Troubleshooting

- **Unit nicht gefunden**: `list-unit-files` vs. laufende Units
  unterscheiden (`systemctl --user list-units`).
- **Berechtigung**: User-Units brauchen kein sudo.

## Recovery

Unit stoppen (`service-stop`); Autostart zuruecksetzen
(`systemctl --user disable <unit>`).
