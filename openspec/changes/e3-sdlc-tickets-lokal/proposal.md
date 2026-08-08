# Proposal: e3-sdlc-tickets-lokal

## Why

ADR-006 Etappe 3 (Ticket T002626, Epic T002623). E2 (T002625, gemergt) hat die lokale Laufzeit
gebaut — Cluster `mentolder-dev`, Overlay `k3d/sdlc-stack/`, Console, PostgreSQL, bge-Paar,
fail-closed Auth — und dabei ausdruecklich nichts migriert (E2-D7). Die Datenhoheit liegt
weiterhin bei fleet: das `tickets`-Schema (23 Tabellen, ~36.700 Zeilen, 2.080 Tickets) steht in
der `website`-DB auf `shared-db` im Namespace `workspace`.

Solange das so bleibt, ist die Isolation unvollstaendig. Jeder Factory-Tick, jede
Ticket-Operation und jede Cockpit-Abfrage braucht den WireGuard-Tunnel und einen laufenden
Hetzner-Cluster; ein Ausfall der Produktion legt die Entwicklung mit still. Genau das soll
ADR-006 aufloesen.

Die urspruengliche Annahme dieser Etappe — das `tickets`-Schema sei self-contained — haelt der
Messung nicht stand: es haengt mit 17 FK-Kanten an sechs Fremdtabellen und wird von sieben
Kanten aus `coaching`, `inbox_items`, `meetings`, `time_entries` und `questionnaire_*`
referenziert. Die vollstaendige Migration bleibt trotzdem der richtige Weg, weil diese Kanten
bis auf zwei unbelegt sind — aber die beiden belegten brauchen je eine eigene Antwort statt
einer pauschalen.

## What

**Die Datenhoheit ueber die SDLC-Daten liegt lokal, und der CI-Rueckkanal steht** (DoD):

1. **Migration:** Das `tickets`-Schema zieht per `pg_dump`/`restore` in die lokale DB.
   Ausgenommen `tickets.provider_config` — daran haengt `coaching.sessions` (13 Zeilen), und
   Coaching bleibt laut ADR-006 auf fleet. Der lokale Stack legt eine eigene an.
2. **Cutover:** Big-Bang in einem Fenster (Factory anhalten, dump/restore, Default umstellen,
   Factory starten). Danach wird die fleet-Kopie per `REVOKE INSERT/UPDATE/DELETE`
   schreibgeschuetzt, damit ein vergessenes `TICKET_CTX=fleet` laut scheitert statt still zu
   divergieren. `SELECT` bleibt erlaubt.
3. **Umleitung:** Der Default-Kontext wird in `scripts/ticket.sh`,
   `scripts/vda/ticket/_ticket-core.sh` und `scripts/factory/lib.sh` auf lokal gestellt; die
   uebrigen Aufrufer erben ihn, `ticket-mcp-go` ebenfalls (duenner Wrapper um `ticket.sh`).
   Dazu die Korrektur der Namespace-Umbiegung in `ticket.sh` (Z. 69–75), die bei `k3d-*` faelsch-
   lich auf `workspace-dev` zeigt, waehrend E2 nach `workspace` deployt hat.
4. **Poller:** `scripts/factory/github-poller.sh` holt gemergte PRs, PR-Zustand und Check-Laeufe
   von GitHub und schreibt sie lokal (`tickets.pr_events`, Ticket-Closure). Cursor-basiert, der
   Cursor rueckt erst nach erfolgreichem Schreiben vor; alle Schreibvorgaenge idempotent.
   Laeuft als systemd-User-Timer neben der Factory.
5. **CI entkernen:** `post-merge.yml` verliert seine fuenf Ticket-Schritte — ihre Wirkung stellt
   der Poller her. **Erst nachdem** der Poller nachgewiesen ist.
6. **Outbox:** `public.bug_report_outbox` auf fleet nach dem Muster von
   `systemtest_failure_outbox`; die Website schreibt Kunden-Bugmeldungen dorthin, der Poller
   liest sie ein und erzeugt das Ticket lokal.
7. **Backup:** Taeglicher `pg_dump` der lokalen DB nach fleet, mit Restore-Test als
   DoD-Bestandteil.

**Nicht in dieser Etappe:** SDLC-Routen aus dem Prod-Image (E4/T002627), Modell-Registry
(E6/T002629), Umzug von `dev.mentolder.de` und `terminal-sidekick` (in E2-D6 bewusst belassen).

## Impact

**Neue Dateien:**
- `scripts/sdlc/migrate-tickets.sh` — Dump/Restore + fleet-REVOKE, idempotent, mit `--dry-run`
- `scripts/sdlc/backup-tickets.sh` — taeglicher Dump nach fleet
- `scripts/factory/github-poller.sh` — Merges, PR-Zustand, Checks
- `scripts/factory/sdlc-github-poller.service` / `.timer`
- `scripts/sdlc/sdlc-backup.service` / `.timer`
- `website/src/lib/sdlc/inbox/bug-outbox.ts` + `bug-outbox.test.ts`
- `migrations/<datum>-bug-report-outbox.sql`
- `tests/spec/sdlc-isolation/e3-tickets-lokal.bats`, `e3-poller.bats`, `e3-backup.bats`
- `docs/sdlc-stack/e3-cutover.md` — Cutover- und Rollback-Runbook

**Geaenderte Dateien:**
- `scripts/ticket.sh` — Default-Kontext, Namespace-Umbiegung
- `scripts/vda/ticket/_ticket-core.sh` — Default-Kontext
- `scripts/factory/lib.sh` — `FACTORY_CTX`-Default
- `.github/workflows/post-merge.yml` — Ticket-Schritte entfernen
- `website/src/lib/messaging-db.ts` — Bugmeldung in die Outbox statt direkt ins Ticket
- `taskfiles/Taskfile.sdlc.yml` — Migrations-, Backup- und Poller-Tasks
- `docs/sdlc-stack/README.md` — zwei `provider_config`-Instanzen, Verfuegbarkeitserwartung

**Risiken:** hoch. Nicht wegen der Migration — 36.700 Zeilen sind in Sekunden kopiert — sondern
wegen der Reihenfolge. Ein entkerntes `post-merge.yml` ohne funktionierenden Poller laesst
Tickets nach dem Merge still offen liegen; der Fehler faellt erst Tage spaeter auf. Zweitens
setzt jede Ticket-Operation ab jetzt einen laufenden lokalen Cluster voraus — die bewusste
Konsequenz von ADR-006, aber ein spuerbarer Betriebsunterschied. Der Rollback bleibt moeglich,
solange die eingefrorene fleet-Kopie liegt, und wird mit steigender Laufzeit teurer.

_Referenzen: Epic T002623 (ADR-006) · E1 T002624 (gemergt) · E2 T002625 (gemergt) ·_
_E4 T002627 (folgt, setzt diese Etappe voraus) · Parent-Slug der Delta-Spec: `sdlc-isolation`_
