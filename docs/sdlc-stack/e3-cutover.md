# E3-Cutover — tickets-Schema nach lokal, fleet einfrieren

**Ticket:** T002626 · **ADR:** [ADR-006](../adr/ADR-006-sdlc-isolation-dev-host.md) Etappe 3
**Entwurf:** `openspec/changes/e3-sdlc-tickets-lokal/design.md`

Dieser Vorgang verlagert die Datenhoheit über die SDLC-Daten von fleet auf den Dev-Host.
Er ist **kein Skriptlauf**, sondern eine Abfolge einzeln nachprüfbarer Schritte. Jeder liefert
seinen Nachweis selbst; keiner wird blind an den nächsten gereicht.

## Vorbedingungen

| Bedingung | Prüfung |
|---|---|
| Docker läuft | `docker info` |
| Lokaler Cluster steht | `task sdlc:sdlc:cluster:status` |
| SDLC-Stack deployt | `task sdlc:sdlc:status` — `shared-db` und `sdlc-console` sind `Running` |
| fleet erreichbar | `kubectl --context fleet get pods -n workspace -l app=shared-db` |
| Lokales `tickets`-Schema leer | `task sdlc:sdlc:migrate:preflight` |

Der Preflight bricht ab, wenn das lokale Schema bereits Zeilen enthält. Das ist Absicht: ein
Restore über einen vorhandenen Bestand vermischt zwei Stände, ohne dass es auffällt. Wer das
bewusst will, setzt `--force`.

## Reihenfolge

Die Reihenfolge ist bindend. Sie ist so gewählt, dass der Rückweg bis zum letzten Schritt
offen bleibt.

### 1. Factory anhalten

```bash
systemctl --user stop factory.timer
systemctl --user stop factory.service   # falls ein Tick gerade läuft
```

Solange die Factory läuft, schreibt sie in die fleet-Datenbank. Ein Dump währenddessen wäre
schon beim Einspielen veraltet.

### 2. Dump ziehen

```bash
task sdlc:sdlc:migrate:dump
```

Erzeugt `tmp/sdlc-migration/tickets-<stamp>.sql` und daneben `.counts` — die Zeilenzählung je
Tabelle, erhoben **vor** dem Dump. Sie ist der Maßstab für Schritt 3; eine später erhobene
Zählung der Quelle könnte bereits abweichen.

`tickets.provider_config` ist ausgenommen (siehe [Warum provider_config bleibt](#warum-provider_config-auf-fleet-bleibt)).

### 3. Restore und Vergleich

```bash
task sdlc:sdlc:migrate:restore
```

Spielt den jüngsten Dump ein und vergleicht anschließend jede Tabelle gegen die mitgelieferte
Zählung. **Bei Abweichung bricht der Befehl ab** — ein fehlerfreier `psql`-Lauf beweist nur,
dass kein Statement geworfen hat, nicht dass der Bestand vollständig ist.

### 4. Lokale provider_config anlegen

```bash
task sdlc:sdlc:migrate:seed-provider-config
```

Legt die Tabelle mit der Struktur aus fleet an, **ohne** Inhalt zu kopieren. Die lokale Instanz
steuert die Factory; die fleet-Instanz bedient Coaching. Sie sind bewusst unabhängig.

Danach die aktiven Factory-Provider eintragen — welche das sind, steht in der fleet-Kopie:

```bash
kubectl exec -i "$(kubectl --context fleet get pod -n workspace -l app=shared-db -o name | head -1)" \
  -n workspace --context fleet -c postgres -- \
  psql -U website -d website -c "SELECT * FROM tickets.provider_config"
```

### 5. Zugriffspfade umstellen

Der Default-Kontext dreht sich mit dem Merge dieses Branches um (p2). Nach dem Merge:

```bash
git -C ~/Bachelorprojekt pull
bash scripts/ticket.sh get --id T002626    # muss aus der LOKALEN DB antworten
```

### 6. Factory wieder starten

```bash
systemctl --user start factory.timer
```

Einen vollständigen Tick abwarten und prüfen, dass er lokal schreibt.

### 7. Erst jetzt: fleet einfrieren

```bash
task sdlc:sdlc:migrate:freeze -- --dry-run   # SQL ansehen
task sdlc:sdlc:migrate:freeze
```

Das Einfrieren steht bewusst **hinter** dem Neustart der Factory: solange nicht belegt ist,
dass der lokale Betrieb trägt, bleibt der Rückweg offen.

Nachweis:

```bash
kubectl exec -i "$(kubectl --context fleet get pod -n workspace -l app=shared-db -o name | head -1)" \
  -n workspace --context fleet -c postgres -- \
  psql -U website -d website -c \
  "INSERT INTO tickets.tickets (type,brand,title) VALUES ('chore','mentolder','freeze-probe')"
```

Erwartet: `ERROR: permission denied for table tickets`.

### 8. Sicherung einrichten

```bash
task sdlc:sdlc:backup           # einmal von Hand
task sdlc:sdlc:restore-check    # Nachweis, dass die Sicherung zurückspielbar ist
task sdlc:sdlc:backup:install   # täglicher Timer
```

Der `restore-check` ist kein optionaler Komfort. Ein Backup, das nie zurückgespielt wurde, ist
eine Vermutung.

## Rückweg

Möglich, solange die eingefrorene fleet-Kopie liegt:

```bash
kubectl exec -i "$(kubectl --context fleet get pod -n workspace -l app=shared-db -o name | head -1)" \
  -n workspace --context fleet -c postgres -- \
  psql -U website -d website -c \
  "GRANT INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA tickets TO website"
export TICKET_CTX=fleet   # bzw. die Default-Änderung aus p2 zurücknehmen
```

**Der Preis des Rückwegs steigt mit der Laufzeit.** Alles, was lokal seit dem Cutover entstanden
ist — Tickets, Kommentare, Phase-Events, Pläne —, müsste von Hand nachgezogen werden. Nach
Stunden ist das überschaubar, nach Tagen nicht mehr. Wer zurück will, entscheidet das früh.

## Warum provider_config auf fleet bleibt

`coaching.sessions.ki_config_id` verweist mit 13 Zeilen auf `tickets.provider_config`, und
Coaching bleibt laut ADR-006 auf fleet. Die Tabelle ist Konfiguration, keine SDLC-Historie:
sie mitzunehmen nähme einer Geschäftsfunktion die referentielle Integrität, ohne dass die
Factory etwas gewönne.

Der Preis ist bekannt und wird getragen: LLM-Provider-Konfiguration existiert danach an zwei
Orten und kann auseinanderlaufen. **Zuständigkeit:** die lokale Instanz steuert die Factory,
die fleet-Instanz bedient ausschließlich Coaching. Wer eine ändert, ändert nicht die andere.

## Was auf fleet als Altlast zurückbleibt

Fünf Fremdschlüssel zeigen weiter auf die eingefrorene Kopie:

| Spalte | belegte Zeilen |
|---|---|
| `inbox_items.bug_ticket_id` | 2 |
| `meetings.project_id` | 0 |
| `time_entries.project_id` | 0 |
| `time_entries.task_id` | 0 |
| `questionnaire_assignments.project_id` | 0 |

Bei diesem Belegungsgrad folgenlos. Bemerkenswert ist aber, wofür sie stehen: `tickets.tickets`
wurde strukturell auch als Projekt- und Aufgabenverzeichnis für Geschäftsdaten angelegt. Ein
künftiges Geschäftsfeature, das `project_id` benutzen will, hinge damit an totem Bestand — das
ist dann zu lösen, nicht hier.
