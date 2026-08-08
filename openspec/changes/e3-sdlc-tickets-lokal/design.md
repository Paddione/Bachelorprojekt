---
ticket_id: T002626
plan_ref: openspec/changes/e3-sdlc-tickets-lokal/tasks.md
status: active
date: 2026-08-08
---

# Design: E3 SDLC-Isolation — tickets-Schema lokal-primaer + GitHub-Poller

## Kontext

ADR-006 Etappe 3 (Epic T002623). E2 (T002625, gemergt) hat die lokale Laufzeit gebaut: Cluster
`mentolder-dev` (Kontext `k3d-mentolder-dev`), Overlay `k3d/sdlc-stack/`, Console, lokale
PostgreSQL, bge-Paar, fail-closed Auth. E2 hat dabei ausdruecklich **nichts** migriert (E2-D7) —
die Datenhoheit liegt weiterhin bei fleet.

Diese Etappe verlagert sie. Sie besteht aus drei Vorgaengen, von denen der Datenumzug der
kleinste ist:

1. **Datenumzug** — 36.700 Zeilen, `pg_dump`/`restore`, Sekunden.
2. **Umleitung der Zugriffspfade** — die eigentliche Arbeit, weil die Pfade verstreut sind.
3. **CI-Rueckkanal** — der Poller, weil GitHub den Dev-Host nicht erreicht.

## Ausgangslage, gemessen am 2026-08-08

Alle Zahlen stammen aus der laufenden fleet-Datenbank (`shared-db`, Namespace `workspace`,
DB `website`), nicht aus dem Quelltext.

| Gegenstand | Messwert |
|---|---|
| `tickets`-Schema | 23 Tabellen, ~36.700 Zeilen, davon 2.080 Tickets |
| groesste Tabellen | `ticket_comments` 12.820 · `ticket_activity` 12.193 · `factory_phase_events` 4.976 |
| FK-Kanten aus `tickets.*` heraus | **17** auf `brands`, `customers`, `questionnaire_*`, `test_*` |
| FK-Kanten von aussen nach `tickets.*` | **7** aus `coaching.sessions`, `inbox_items`, `meetings`, `time_entries`, `questionnaire_*` |
| `brands` / `customers` | 2 / 4 Zeilen |

### Die Scaffold-These war falsch

Der urspruengliche Entwurf dieser Etappe begruendete die vollstaendige Migration damit, die
FK-Kanten seien minimal und das `tickets`-Schema self-contained. **Das ist es nicht** — es
haengt an sechs Fremdtabellen und wird von fuenf weiteren referenziert.

Die Schlussfolgerung traegt trotzdem, aber aus einem anderen Grund: die Kanten sind fast
vollstaendig **unbelegt**. Nicht-NULL-Zaehlung:

| Kante | Zeilen |
|---|---|
| `coaching.sessions.ki_config_id` → `tickets.provider_config` | **13** |
| `inbox_items.bug_ticket_id` → `tickets.tickets` | **2** |
| `tickets.tickets.customer_id` → `customers` | 13 |
| `tickets.tickets.assignee_id` → `customers` | 1 |
| `meetings.project_id`, `time_entries.project_id`, `time_entries.task_id`, `questionnaire_assignments.project_id`, `questionnaire_test_status.last_failure_ticket_id` | **0** |
| `tickets.tickets.reporter_id`, alle `source_test_*`, `ticket_comments.author_id`, `ticket_activity.actor_id` | **0** |

Der Unterschied ist nicht akademisch: „self-contained" haette geheissen, man kann das Schema
herausloesen. Tatsaechlich muss man **zwei belegte Kanten einzeln behandeln**, und die
Struktur der uebrigen bleibt als Altlast auf fleet zurueck.

Bemerkenswert dabei: `meetings.project_id`, `time_entries.project_id`/`task_id` und
`questionnaire_assignments.project_id` benutzen `tickets.tickets` als **Projekt- und
Aufgabenverzeichnis fuer Geschaeftsdaten**. Die Annahme „`tickets.*` ist die SDLC-Domaene"
stimmt auf der Schema-Ebene nicht; sie stimmt nur, solange diese Spalten leer bleiben.

## Entscheidungen

### D1 — Vollstaendige Migration, aber `provider_config` bleibt auf fleet

Das `tickets`-Schema zieht vollstaendig in die lokale DB. **Ausgenommen ist
`tickets.provider_config`**: daran haengt `coaching.sessions.ki_config_id` mit 13 Zeilen, und
Coaching bleibt laut ADR-006 ausdruecklich auf fleet. Die Tabelle ist Konfiguration, keine
SDLC-Historie — sie zu verlagern wuerde einer Geschaeftsfunktion die referentielle Integritaet
nehmen, ohne dass die Factory etwas gewinnt.

Der lokale Stack legt seine **eigene** `provider_config` an (gleiche Struktur, getrennter
Inhalt). Der Preis ist bekannt und wird bewusst getragen: LLM-Provider-Konfiguration existiert
danach an zwei Orten und kann auseinanderlaufen. Das Runbook haelt fest, dass die lokale die
Factory steuert und die fleet-Kopie ausschliesslich Coaching bedient.

### D2 — Cutover als Big-Bang, fleet danach schreibgeschuetzt

Ablauf in einem Fenster: Factory anhalten → `pg_dump` des `tickets`-Schemas (ohne
`provider_config`) → Restore in die lokale DB → Default-Kontext umstellen → Factory starten.
Bei 36.700 Zeilen ist das ein Vorgang von Sekunden; ein Dual-Write-Uebergang waere Aufwand
ohne Gegenwert.

Danach wird die fleet-Kopie **stillgelegt**: `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN
SCHEMA tickets FROM website`, mit Ausnahme von `provider_config`. Ohne diesen Schritt schreibt
ein vergessenes `TICKET_CTX=fleet` weiter in die tote Kopie und niemand merkt es — genau die
Klasse stiller Drift, die dieses Repo wiederholt getroffen hat (T002619, T002563). Nach dem
REVOKE scheitert ein solcher Zugriff laut.

`SELECT` bleibt erlaubt: die Historie bleibt lesbar, und E4 entscheidet spaeter, worueber sie
erreichbar bleibt.

### D3 — GitHub-Poller (Pull-Modell), cursor-basiert

GitHub kann den Dev-Host nicht erreichen. Ein lokaler Poller holt aktiv und schreibt lokal:

| Gegenstand | Ziel | Ersetzt |
|---|---|---|
| gemergte PRs | Ticket-Closure | die Ticket-Schritte in `post-merge.yml` |
| PR-Zustand | `tickets.pr_events` | — |
| Check-Laeufe | `tickets.pr_events` | — |

`tickets.pr_events` existiert bereits und ist leer — die Zieltabelle war vorgesehen, wurde aber
nie befuellt.

**Cursor-Disziplin:** Der Cursor rueckt erst **nach** erfolgreichem lokalem Schreiben vor.
Damit ist die Verarbeitung at-least-once, weshalb jeder Schreibvorgang idempotent sein muss
(`ON CONFLICT` auf PR-Nummer bzw. Ticket-Status). Die umgekehrte Reihenfolge — Cursor zuerst —
verliert genau die Ereignisse, die die DoD schuetzen soll.

**Waehrend die Workstation aus ist**, ist GitHub der Puffer. Beim Wiederanlauf holt der Poller
ab Cursor nach. Deshalb braucht es fuer CI-Ereignisse **keine** Outbox: GitHub haelt den
Zustand ohnehin vor.

`scripts/factory/auto-close-merged.sh` und `babysit-prs.sh` arbeiten bereits nach diesem
Muster; der Poller generalisiert es und wird zur einzigen Stelle, die GitHub-Zustand in die
lokale DB traegt.

### D4 — `post-merge.yml` verliert seine Ticket-Schritte

Der Workflow setzt heute an fuenf Stellen `TICKET_CTX=fleet` und schreibt Ticket-Status
(`awaiting_deploy`, `done`, `devflow-post-merge-ticket-closure.sh`). Nach dem Umzug erreicht
CI die lokale DB nicht mehr. Die Schritte entfallen ersatzlos — ihre Wirkung stellt D3 her.

Das ist der Punkt, an dem diese Etappe am ehesten still fehlschlaegt: entfernt man die Schritte,
ohne dass der Poller die Closure zuverlaessig ableitet, bleiben Tickets nach dem Merge offen
liegen und niemand bemerkt es sofort. Deshalb ist die Reihenfolge im Plan bindend — **Poller
zuerst nachweisen, dann CI entkernen**, nicht umgekehrt.

### D5 — Outbox nur fuer das, was GitHub nicht weiss

Kunden-Bugmeldungen entstehen in `inbox_items` auf fleet und erzeugen heute direkt ein Ticket
(`messaging-db.ts` → `transition.ts`). Nach dem Umzug gibt es dort kein `tickets.tickets` mehr.

Neue Tabelle `public.bug_report_outbox` auf fleet nach dem Muster von
`public.systemtest_failure_outbox` (etabliert, getestet, mit Retry-Semantik). Die Website
schreibt dorthin; der Poller liest sie ueber denselben `kubectl exec`-Weg, den `ticket.sh`
heute nutzt, erzeugt das Ticket lokal und markiert die Zeile.

### D6 — Backup nach fleet

Lokaler Timer, taeglich: `pg_dump` des lokalen `tickets`-Schemas, Ablage auf fleet. fleet laeuft
ohnehin durchgehend, liegt geografisch getrennt, und der Weg dorthin ist etabliert — kein neues
Konto, keine neuen Credentials, kein zusaetzliches Werkzeug. Bei dieser Groesse genuegt eine
taegliche Vollsicherung; Inkrementierung und Deduplizierung waeren Aufwand ohne Nutzen.

**Der Restore-Test gehoert in die DoD.** Ein Backup, das nie zurueckgespielt wurde, ist eine
Vermutung, keine Sicherung.

### D7 — Namespace-Auflaufstelle in `ticket.sh` korrigieren

`scripts/ticket.sh` (Z. 69–75) biegt bei `TICKET_CTX=k3d-*` den Namespace automatisch von
`workspace` auf `workspace-dev` um. E2 hat den SDLC-Stack aber nach `workspace` deployt. Ohne
Korrektur findet `_pgpod` keinen Pod und **jeder** Ticket-Befehl bricht mit „no shared-db pod
found" ab.

Die Umbiegung stammt aus der Zeit des alten `workspace-dev`-Stacks auf fleet und ist fuer den
SDLC-Cluster schlicht falsch. Sie wird auf den tatsaechlichen Namespace des Ziel-Clusters
gestuetzt statt auf ein Namensmuster des Kontexts.

## Umstellungspunkte

Gemessen, nicht geschaetzt:

| Pfad | Heute | Nach E3 |
|---|---|---|
| `scripts/vda/ticket/_ticket-core.sh:7` | `${TICKET_CTX:-fleet}` | Default lokal |
| `scripts/ticket.sh:23` | `${TICKET_CTX:-fleet}` | Default lokal |
| `scripts/factory/lib.sh` | `FACTORY_CTX` | Default lokal |
| `ticket-attach.sh`, `mishap-categorize.sh`, `batch-gap-analysis.sh`, `readiness-audit.sh` | je `${TICKET_CTX:-fleet}` | erben den Default |
| `ticket-mcp-go` | duenner Wrapper um `ticket.sh` | **erbt automatisch** |
| SDLC-Console | `SESSIONS_DATABASE_URL` → lokal | **bereits lokal** (E2) |
| `post-merge.yml` (5 Stellen) | schreibt nach fleet | Ticket-Schritte entfallen (D4) |

Dass `ticket-mcp-go` nur ein Wrapper ist, spart einen eigenen Umstellungspunkt: der MCP-Server
folgt der Default-Aenderung, ohne dass sein Go-Code angefasst wird.

## Zielstruktur

```
scripts/sdlc/
  migrate-tickets.sh        Dump/Restore + fleet-REVOKE (idempotent, mit --dry-run)
  backup-tickets.sh         taeglicher pg_dump → fleet
scripts/factory/
  github-poller.sh          Merges + PR-Zustand + Checks, cursor-basiert
scripts/sdlc/
  sdlc-backup.{service,timer}       systemd-User-Units (Repo-Konvention: Unit neben Skript)
scripts/factory/
  sdlc-github-poller.{service,timer}
website/src/lib/sdlc/inbox/
  bug-outbox.ts             Schreibpfad in public.bug_report_outbox
  bug-outbox.test.ts        Vitest
tests/spec/sdlc-isolation/
  e3-tickets-lokal.bats     Umstellungspunkte + Cutover-Anker
  e3-poller.bats            Cursor-Semantik, Idempotenz
  e3-backup.bats            Restore-Nachweis
```

## DoD-Zuordnung

| DoD (Ticket) | Nachweis |
|---|---|
| Factory-Tick ohne Verbindung zur Hetzner-DB | `wg-quick down wg-fleet`, danach vollstaendiger Tick gruen |
| Kein CI-Ereignis geht verloren | Poller anhalten, PR mergen, Poller starten → Ticket geschlossen |
| `tickets`-Schema lokal | Zeilenzahlen lokal == fleet (ohne `provider_config`) |
| fleet bereinigt | Schreibversuch auf `tickets.tickets` scheitert; `SELECT` funktioniert |
| Backup wiederherstellbar | Dump in Wegwerf-DB einspielen, Zeilenzahlen vergleichen |

## Risiken und Trade-offs

- **Die gefaehrlichste Stelle ist D4**, nicht die Migration. Ein entkerntes `post-merge.yml`
  ohne funktionierenden Poller laesst Tickets nach dem Merge still offen. Reihenfolge im Plan
  ist deshalb bindend.
- **Zwei `provider_config`-Instanzen** koennen auseinanderlaufen (D1). Bewusst getragen,
  dokumentiert im Runbook.
- **Die Altlast auf fleet:** `meetings.project_id` und die uebrigen leeren FKs zeigen danach auf
  eingefrorenen Bestand. Folgenlos bei 0 Zeilen, aber ein kuenftiges Geschaeftsfeature, das
  `project_id` benutzen will, haengt an toten Daten. Gehoert dokumentiert, nicht geloest.
- **Rollback** ist moeglich, solange die fleet-Kopie liegt (REVOKE zuruecknehmen, Default
  zuruecksetzen). Sein Preis steigt mit der Laufzeit, weil lokal entstandene Zeilen nachgezogen
  werden muessten. Das Runbook sagt das ausdruecklich.
- **Verfuegbarkeit:** Ticket-Operationen setzen ab jetzt einen laufenden lokalen Cluster voraus.
  Das ist die bewusste Konsequenz von ADR-006, nicht ein Nebeneffekt dieser Etappe.

## Abgrenzung

- **E2 (T002625):** liefert Cluster, Console, lokale DB — diese Etappe fuellt sie.
- **E4 (T002627):** SDLC-Routen aus dem Prod-Image; entscheidet, worueber die Historie
  erreichbar bleibt. Setzt diese Etappe voraus.
- **Nicht hier:** Umzug von `dev.mentolder.de` und `terminal-sidekick` (E2-D6, bewusst
  belassen), Modell-Registry (E6).
