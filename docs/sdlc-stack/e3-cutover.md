# E3-Cutover — tickets-Schema nach lokal

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

### 5. Zugriffspfade prüfen — auf dem Branch, vor dem Merge

Der Default-Kontext ist im Branch bereits auf `k3d-mentolder-dev` gestellt. **Der Cutover wird
deshalb auf dem Branch durchgeführt und erst danach gemergt.**

Der Grund: ab dem Merge trägt `main` einen Default, der einen laufenden lokalen Cluster
voraussetzt. Würde erst gemergt und dann umgezogen, wäre in der Zwischenzeit jeder
Ticket-Befehl im gesamten Repo tot — für die Factory, für `dev-flow-*` und für jede parallele
Session. Diese Reihenfolge vermeidet das Fenster vollständig.

```bash
cd .worktrees/e3-sdlc-tickets-lokal
bash scripts/ticket.sh get --id T002626    # muss aus der LOKALEN DB antworten
```

### 6. Factory wieder starten

```bash
systemctl --user start factory.timer
```

Einen vollständigen Tick abwarten und prüfen, dass er lokal schreibt.

### 7. fleet einfrieren — NICHT in dieser Etappe

Ursprünglich war hier der `REVOKE` vorgesehen, der die fleet-Kopie gegen Schreibzugriffe
sperrt. **Er entfällt** und wandert nach [T002722](../../openspec/changes/) (ADR-006 E4).

Der Grund wurde bei der Umsetzung gemessen: `website/src/lib/projects-db.ts` führt aus dem
**Produktions-Build** `INSERT`, `UPDATE` und `DELETE` auf `tickets.tickets` (`type='project'`)
aus, aufgerufen von `api/portal/projekte.ts`, `portal.astro` und `admin.astro`. Es liegen 41
Projekt-Tickets. Ein Freeze hätte die Projektverwaltung im Kundenportal gebrochen.

Das SQL lässt sich ansehen, ausgeführt wird es nicht:

```bash
task sdlc:sdlc:migrate:freeze -- --dry-run
```

**Konsequenz für den Betrieb bis E4:** die fleet-Kopie bleibt beschreibbar. Ein vergessenes
`TICKET_CTX=fleet` schreibt dort weiter, ohne dass es auffällt — genau der Zustand, den der
Freeze verhindern sollte. Wer auf fleet schreibt, tut das ab jetzt bewusst.

### 8. Sicherung einrichten

```bash
task sdlc:sdlc:backup           # einmal von Hand
task sdlc:sdlc:restore-check    # Nachweis, dass die Sicherung zurückspielbar ist
task sdlc:sdlc:backup:install   # täglicher Timer
```

Der `restore-check` ist kein optionaler Komfort. Ein Backup, das nie zurückgespielt wurde, ist
eine Vermutung.

### 9. Erst jetzt mergen

Wenn Schritt 1–8 durch sind und die Factory nachweislich lokal arbeitet, wird der PR gemergt.
`main` trägt ab diesem Moment den lokalen Default — und der stimmt dann mit der Wirklichkeit
überein.

## Rückweg

Möglich, solange die fleet-Kopie liegt. Da sie in dieser Etappe **nicht** eingefroren wird,
genügt es, den Default zurückzunehmen:

```bash
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

## Was auf fleet zurückbleibt

Die Kopie bleibt vollständig lesbar **und schreibbar** (der Freeze wandert nach E4/T002722).
Zwei Dinge greifen weiterhin aktiv darauf zu:

| Zugriff | Umfang | Status |
|---|---|---|
| `coaching.sessions.ki_config_id` → `tickets.provider_config` | 13 Zeilen | gelöst — Tabelle bleibt bewusst auf fleet |
| `projects-db.ts` → `tickets.tickets` (`type='project'`) | 41 Projekte | **offen — T002722** |

Dazu fünf Fremdschlüssel, die auf die Kopie zeigen und praktisch unbelegt sind
(`inbox_items.bug_ticket_id` 2 Zeilen; `meetings.project_id`, `time_entries.project_id`,
`time_entries.task_id`, `questionnaire_assignments.project_id` je 0).

**Eine Lehre aus dieser Etappe:** Die ursprüngliche Planung stützte sich auf genau diese
FK-Zählung und schloss daraus, die Doppelnutzung von `tickets.tickets` sei folgenlos. Der
reale Nutzungspfad des Kundenportals läuft aber nicht über die Fremdschlüssel, sondern direkt
über die Spalte `type`. Eine Kante zu zählen ist nicht dasselbe, wie eine Nutzung zu messen —
wer das nächste Mal eine Tabelle verlagert, sucht zuerst die schreibenden Aufrufer im Code.
