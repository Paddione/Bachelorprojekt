---
title: "p1-data — Migration, fleet-Freeze, Backup"
ticket_id: T002626
domains: [db, infra, scripts]
status: active
---

# p1-data — Migration, fleet-Freeze, Backup

Verlagert den Datenbestand und sichert ihn ab. Dieses Partial fasst nichts an, was auf die
Daten zugreift — die Umleitung der Zugriffspfade ist p2. Danach liegen die Daten lokal, die
fleet-Kopie ist schreibgeschuetzt, und ein wiederherstellbares Backup existiert.

## File Structure

| Datei | Rolle | S1-Budget |
|---|---|---|
| `scripts/sdlc/migrate-tickets.sh` | neu — Dump/Restore + REVOKE, idempotent, `--dry-run` | `.sh` / 800, Budget 800 |
| `scripts/sdlc/backup-tickets.sh` | neu — taeglicher Dump nach fleet | `.sh` / 800, Budget 800 |
| `systemd/sdlc-backup.service` | neu — Backup-Unit | n/a |
| `systemd/sdlc-backup.timer` | neu — taeglicher Trigger | n/a |
| `Taskfile.sdlc.yml` | geaendert — `migrate`, `freeze`, `backup`, `restore-check` | n/a |
| `docs/sdlc-stack/e3-cutover.md` | neu — Cutover- und Rollback-Runbook | n/a |

## Aufgaben

### 1. Vorbedingung pruefen, bevor irgendetwas kopiert wird

Der lokale Cluster war zum Planungszeitpunkt nicht erreichbar (Docker-Daemon aus, R5). Das
Skript beginnt deshalb mit einem harten Vorbedingungs-Check und bricht ab, wenn er nicht
erfuellt ist — eine halb gelaufene Migration ist schlimmer als eine, die gar nicht startet.

Geprueft wird: Kontext `k3d-mentolder-dev` existiert, ein `shared-db`-Pod in `workspace` ist
`Running`, die `website`-DB antwortet, und das `tickets`-Schema ist dort **leer oder nicht
vorhanden**. Ein bereits befuelltes lokales Schema fuehrt zum Abbruch mit Hinweis auf
`--force`, statt bestehende Zeilen zu ueberschreiben.

### 2. `scripts/sdlc/migrate-tickets.sh` schreiben

Vier Unterbefehle, jeder einzeln aufrufbar und wiederholbar:

- `dump` — `pg_dump` des `tickets`-Schemas aus fleet, **ohne** `provider_config` (D1), in eine
  Datei mit Zeitstempel. Zaehlt vorher die Zeilen pro Tabelle und legt die Zaehlung neben den
  Dump.
- `restore` — spielt den Dump in die lokale DB ein und vergleicht anschliessend die Zeilenzahlen
  gegen die mitgelieferte Zaehlung. Abweichung → Exit ungleich 0.
- `seed-provider-config` — legt lokal eine eigene `tickets.provider_config` an (Struktur aus
  fleet, Inhalt der aktiven Factory-Provider). Getrennt vom Restore, weil es bewusst **keine**
  Kopie ist.
- `freeze` — `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tickets FROM website` auf
  fleet, danach `GRANT` derselben Rechte zurueck auf `provider_config` (D2). `SELECT` bleibt
  unangetastet.

`--dry-run` gibt bei jedem Unterbefehl das auszufuehrende SQL aus, ohne es zu senden.

### 3. Cutover-Runbook schreiben

`docs/sdlc-stack/e3-cutover.md` haelt die Reihenfolge fest, in der ein Mensch den Umzug
durchfuehrt: Factory anhalten → `dump` → `restore` → `seed-provider-config` → (p2:
Default umstellen) → Factory starten → `freeze`.

Das `freeze` steht bewusst **hinter** dem Neustart der Factory: solange nicht bewiesen ist,
dass der lokale Betrieb laeuft, bleibt der Rueckweg offen. Das Runbook beschreibt diesen
Rueckweg ausdruecklich und sagt dazu, dass sein Preis mit der Laufzeit steigt, weil lokal
entstandene Zeilen nachgezogen werden muessten.

### 4. Backup einrichten

`scripts/sdlc/backup-tickets.sh` erzeugt einen `pg_dump` der lokalen DB und legt ihn auf fleet
ab. Alte Staende werden nach Aufbewahrungsfrist entfernt — die Frist steht als Konstante im
Kopf des Skripts, nicht verstreut im Code.

`systemd/sdlc-backup.timer` triggert taeglich; die Unit laeuft als **User**-Unit, wie die
Factory, damit sie dieselbe Verfuegbarkeitserwartung teilt.

### 5. Restore nachweisen

`Taskfile.sdlc.yml` bekommt `sdlc:restore-check`: spielt den juengsten Dump in eine
Wegwerf-Datenbank ein und vergleicht die Zeilenzahlen. Das ist kein optionaler Komfort —
ein Backup ohne durchgefuehrten Restore ist eine Vermutung (D6).

## Verifikation dieses Partials

```bash
bash scripts/sdlc/migrate-tickets.sh dump --dry-run
bash scripts/sdlc/migrate-tickets.sh freeze --dry-run
task sdlc:restore-check
```

Erwartet: die Dry-Runs geben vollstaendiges SQL aus und senden nichts; `restore-check` meldet
uebereinstimmende Zeilenzahlen.
