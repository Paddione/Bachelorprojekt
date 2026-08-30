# Proposal: backend-switch-exclusive-gpu

## Why

Auf der lokalen RTX 5070 Ti (16,3 GB) kann immer nur **ein** Inferenz-Backend geladen sein.
FreeToken (`:1919`) belegt im Betrieb ~15,5 GB; LM Studio (`:1234`) braucht für das
Vision-Modell ~14,7 GB. Beide gleichzeitig ist ausgeschlossen, und die Trennung ist keine
Feinheit: FreeToken kann über HTTP **grundsätzlich kein Vision**
(`freetoken/server/generation.py:240` weist jeden Nicht-Text-Part bedingungslos ab), LM Studio
liefert es (`type: "vlm"`, Vision-Test 4/4 Merkmale korrekt am 2026-08-30).

OpenDesign-Workflows brauchen genau diese zweite Fähigkeit. Heute heißt das: von Hand
FreeToken stoppen, LM Studio laden, arbeiten, zurückschalten — und dabei die exakte
Startkonfiguration der Engine im Kopf behalten. Das ist fehleranfällig an einer Stelle, die
teuer ist: **wird die Engine falsch neu gestartet, läuft sie mit anderen Flags weiter, ohne
dass es auffällt.**

Der Wechsel soll deshalb ein Vorgang sein, nicht eine Handvoll Handgriffe.

## What Changes

Ein Umschalt-Werkzeug mit zwei Richtungen, das ausschließlich verifizierte Schnittstellen
benutzt:

**`to-gemma`** — vor dem Wechsel den opencode-Arbeitsstand sichern:

1. opencode-API-Port ermitteln (Listener des `opencode.exe`-Prozesses; der Port ist dynamisch
   vergeben, aktuell `59443`).
2. `GET /api/session/active` — welche Session gerade arbeitet.
3. Den laufenden Request **abwarten**, nicht abbrechen (Operator-Entscheidung).
   `POST /api/session/{id}/interrupt` bleibt der Notausgang nach Timeout.
4. `POST /api/session/{id}/compact` — Kontext kompaktieren.
5. `opencode export <id>` — JSON-Dump nach `.workdir/session-dumps/`.
6. `GET :1900/engine/status` **plus die echte Prozess-Kommandozeile** sichern.
7. `POST :1900/engine/stop` — liefert `drainComplete` und einen Accounting-Receipt.
8. `lms load` des Vision-Modells.

**`to-freetoken`** — zurück, wenn OpenDesign fertig meldet: `lms unload`,
`POST :1900/engine/start` mit den in Schritt 6 gesicherten Argumenten, warten bis
`/health` `maintenance=serving` meldet.

Dazu: `.workdir/` als zentrales Dump-Verzeichnis anlegen und **in `.gitignore` eintragen**.

## Warum nicht der naheliegende Weg

Zwei Abkürzungen sehen richtig aus und sind es nicht — beide am 2026-08-30 gemessen:

- **`restart-freetoken.ps1 -Stop` greift nicht.** Es sucht `ft.exe` mit `serve` in der
  Kommandozeile. Eine von der FreeToken-Desktop-App gestartete Engine läuft aber als
  `python.exe -m freetoken.cli serve` **unter** einem `ft.exe daemon`. Das Skript meldete
  „gestoppt", während 15,5 GB VRAM belegt blieben. Der Stop muss über `:1900/engine/stop`
  laufen.
- **`restart-freetoken.ps1` startet nicht identisch neu.** Die laufende Engine trägt
  `--expert-load parallel`, `--moe-cpu-threads 8` und
  `--cors-origins tauri://localhost,http://tauri.localhost,http://localhost:1420`, die das
  Skript nicht setzt. Ohne Sicherung der echten Kommandozeile kehrt eine *andere* Engine
  zurück — mit stiller Änderung von Durchsatz und Desktop-App-Anbindung.

## Was dieses Werkzeug ausdrücklich NICHT ist

**Es rettet keinen Kontext, weil keiner verloren geht.** opencode-Sessions liegen lokal und
überleben jeden Engine-Neustart; beim nächsten Aufruf geht der Verlauf erneut an das dann
laufende Backend. Verloren geht allein der Radix-Prefix-Cache im Server — das kostet
Prefill-Zeit, keinen Inhalt.

Der Dump ist damit **Backup und Nachvollziehbarkeit**, nicht Wiederherstellung. `opencode
import` erzeugt eine *neue* Session und setzt die alte nicht fort; die alte braucht das auch
nicht. Diese Abgrenzung gehört in die Dokumentation, weil die Gegenannahme naheliegt und zu
einem deutlich komplexeren Werkzeug führen würde, als das Problem verlangt.

## Risks

- **Das Repo ist public.** Session-Dumps enthalten Gesprächsinhalte. `.workdir/` existiert
  noch nicht und steht nicht in `.gitignore` — der Ignore-Eintrag muss **vor** dem ersten
  Dump stehen, sonst ist der Inhalt mit einem `git add -A` veröffentlicht.
- **Der opencode-API-Port ist dynamisch.** Eine Ermittlung über den Prozess-Listener ist
  fragil, wenn mehrere opencode-Instanzen laufen. Alternative: `opencode serve` auf einem
  festen Port, was aber die bestehende Arbeitsweise ändert.
- **Ein hängender Request blockiert den Wechsel.** Abwarten ist gewollt, braucht aber ein
  Timeout mit definiertem Verhalten — sonst wartet der Wechsel unbegrenzt.
- **Ein abgebrochener Wechsel lässt die GPU leer zurück.** Bricht das Werkzeug zwischen
  `engine/stop` und `lms load` ab, läuft gar nichts mehr. Es braucht einen wiederaufnehmbaren
  Zustand, aus dem sich der Sollzustand herstellen lässt.
