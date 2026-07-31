# Proposal: k9-stil-datenbank

## Why

Die Modelle (Agenten, LLM-Panels) brauchen eine Gestaltungsquelle: fertige,
abgeschlossene Arbeit soll als **Geschmacks- und Farbbeispiel** zurückfließen,
statt als Einzelstück liegenzubleiben (E14). Heute gibt es nur das feste
Token-System (E11, K1) — aber keine Sammlung, aus der ein Modell lernen kann,
wie im Projekt gestaltet wird.

K9 liefert die **Stil-Datenbank**: eine kuratierte, versionskontrollierte
Sammlung geernteter Komponenten mit Beleg-Ausschnitten, die Modelle als
Inspirationsquelle abfragen. Das Kit selbst bleibt E20-strikt — die Datenbank
ist Inspirationsquelle, kein direkt anwendbares Theme.

## What

1. **Datenebene**: Repo-Dateien unter `.lavish/styles/` — eine JSON-Datei pro
   Eintrag (Komponente/Beispiel) nach einem strukturierten Schema:
   `id`, `name`, `zweck` (deutsch), `herkunft` (Projekt + Datei),
   `beleg_ausschnitt` (Code/HTML), `token_bezuege` (nur `--lv-*`/`--color-*`),
   `tags`. Versionskontrolliert, diffbar, per PR beitragbar.
2. **Beitragspfad (D14)**: Ein Eintrag kommt nur mit allen drei Dingen ins
   Kit: Beleg-Ausschnitt, ausschließlich Token-Bezüge, Verzeichniseintrag mit
   Zweck und Herkunftsprojekt. Ein Index (`styles/index.json`) listet alle
   Einträge.
3. **Abfrage für Modelle**: Adapter-Methode `data.styles()` im K2-Adapter +
   Daemon-Route `GET /api/cockpit/styles` — konsistent mit dem bestehenden
   Adapter-Vertrag, kein direkter `fetch()` in Panels.

_Ticket: T002468_
