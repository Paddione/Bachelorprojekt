---
title: "e3-sdlc-tickets-lokal — Implementation Plan"
ticket_id: T002626
domains: [db, infra, scripts, factory, website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002623
depends_on_plans: [T002625]
---

# e3-sdlc-tickets-lokal — Implementation Plan

_Ticket: T002626 (E3) · Epic T002623 (ADR-006) · E2 T002625 gemergt · E4 T002627 folgt_

Verlagert die Datenhoheit ueber die SDLC-Daten auf den Dev-Host und stellt den CI-Rueckkanal
im Pull-Modell her. Entwurf und Messwerte: `design.md`, `intel.json`.

## File Structure

| Datei | Partial | Rolle | S1 |
|---|---|---|---|
| `scripts/sdlc/migrate-tickets.sh` | p1 | neu — Dump/Restore/Freeze | `.sh` / 800, Bestand 315, Budget 485 |
| `scripts/sdlc/backup-tickets.sh` | p1 | neu — taeglicher Dump nach fleet | `.sh` / 800, Bestand 222, Budget 578 |
| `scripts/sdlc/sdlc-backup.service` | p1 | neu | n/a |
| `scripts/sdlc/sdlc-backup.timer` | p1 | neu | n/a |
| `taskfiles/Taskfile.sdlc.yml` | p1 | geaendert — migrate/freeze/backup/restore-check | n/a |
| `docs/sdlc-stack/e3-cutover.md` | p1 | neu — Cutover- und Rollback-Runbook | n/a |
| `scripts/ticket.sh` | p2 | geaendert — Default-Kontext, Namespace | ignore (gates.yaml) |
| `scripts/vda/ticket/_ticket-core.sh` | p2 | geaendert — Default-Kontext | `.sh` / 800, Bestand 181, Budget 619 |
| `scripts/factory/lib.sh` | p2 | geaendert — `FACTORY_CTX` | `.sh` / 800, Bestand 72, Budget 728 |
| `docs/sdlc-stack/README.md` | p2 | geaendert — Betriebshinweise | n/a |
| `scripts/factory/github-poller.sh` | p3 | neu — Merges/PR-Zustand/Checks | `.sh` / 800, Bestand 216, Budget 584 |
| `scripts/factory/sdlc-github-poller.service` | p3 | neu | n/a |
| `scripts/factory/sdlc-github-poller.timer` | p3 | neu | n/a |
| `.github/workflows/post-merge.yml` | p3 | geaendert — Ticket-Schritte entfernen | n/a |
| `tests/spec/sdlc-isolation/e3-tickets-lokal.bats` | p4 | neu | n/a |
| `tests/spec/sdlc-isolation/e3-poller.bats` | p4 | neu | n/a |
| `tests/spec/sdlc-isolation/e3-backup.bats` | p4 | neu | n/a |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-data.md | impl | scripts/sdlc/migrate-tickets.sh, scripts/sdlc/backup-tickets.sh, scripts/sdlc/sdlc-backup.service, scripts/sdlc/sdlc-backup.timer, taskfiles/Taskfile.sdlc.yml, docs/sdlc-stack/e3-cutover.md | |
| p2 | tasks.d/p2-redirect.md | impl | scripts/ticket.sh, scripts/vda/ticket/_ticket-core.sh, scripts/factory/lib.sh, docs/sdlc-stack/README.md | p1 |
| p3 | tasks.d/p3-poller.md | impl | scripts/factory/github-poller.sh, scripts/factory/sdlc-github-poller.service, scripts/factory/sdlc-github-poller.timer, .github/workflows/post-merge.yml | p2 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/sdlc-isolation/e3-tickets-lokal.bats, tests/spec/sdlc-isolation/e3-poller.bats, tests/spec/sdlc-isolation/e3-backup.bats | p3 |

### p1 — data: Migration, fleet-Freeze, Backup

Verlagert den Bestand (36.700 Zeilen, ohne `provider_config`), friert die fleet-Kopie gegen
Schreibzugriffe ein und richtet das Backup nach fleet samt Restore-Nachweis ein.

### p2 — redirect: Zugriffspfade umstellen

Dreht den Default-Kontext an drei Stellen um und korrigiert **zuerst** die
Namespace-Ableitung in `ticket.sh`, die sonst jeden Ticket-Befehl unbrauchbar machen wuerde.

### p3 — poller: GitHub-Poller, danach CI entkernen

Baut den cursor-basierten Poller (Merges, PR-Zustand, Checks) und entfernt **erst nach dessen
Nachweis** die fuenf Ticket-Bloecke aus `post-merge.yml`.

### p4 — tests: BATS-Nachweis

Belegt Umstellung, Cursor-Semantik und Restore ueber Kommandoausgaben statt Quelltext-Greps.

> **Entfallen:** Das urspruengliche p4 (Outbox fuer Kunden-Bugmeldungen) ist gegenstandslos —
> `/api/bug-report` wurde bereits in T002330 (PR #3461) abgebaut. Es gibt keinen produktiven
> Schreibpfad, den man umleiten muesste.

## Reihenfolge ist bindend

p3 entfernt die CI-Ticket-Schritte. Geschieht das, bevor der Poller nachweislich arbeitet,
bleiben Tickets nach dem Merge still offen liegen — ein Fehler, der nicht knallt, sondern erst
Tage spaeter bei einer Durchsicht auffaellt. Ebenso steht die Namespace-Korrektur in p2 vor der
Default-Umstellung: andernfalls ist der Zwischenstand ein Repository, in dem kein einziger
Ticket-Befehl mehr laeuft.

## Verify

Abschliessend, nach p1–p4:

```bash
bash scripts/openspec.sh validate
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation*
task test:changed
task freshness:regenerate && task freshness:check
```

Zusaetzlich die DoD des Tickets, die kein Testrunner abdecken kann:

```bash
# Factory-Tick ohne Verbindung zur Hetzner-DB
sudo wg-quick down wg-fleet && bash scripts/factory/wakeup.sh --once

# Kein CI-Ereignis geht verloren
systemctl --user stop sdlc-github-poller.timer
#   … PR mergen …
systemctl --user start sdlc-github-poller.timer && bash scripts/factory/github-poller.sh --once

# Backup wiederherstellbar
task sdlc:sdlc:backup && task sdlc:sdlc:restore-check
```

Erwartet: der Tick laeuft vollstaendig durch, das Ticket des gemergten PR ist danach
geschlossen, und der Restore meldet uebereinstimmende Zeilenzahlen.

Der Freeze-Nachweis entfaellt — er gehoert jetzt zu T002722.
