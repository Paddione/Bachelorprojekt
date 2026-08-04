---
ticket_id: T002626
plan_ref: openspec/changes/e3-sdlc-tickets-lokal/tasks.md
status: active
date: 2026-08-04
---

# Design: E3 SDLC-Isolation — tickets-Schema lokal-primaer + GitHub-Poller

## Kontext

ADR-006 Etappe 3 (Epic T002623). E2 hat die lokale Laufzeit gebaut — Console, DB, bge, Auth laufen im `mentolder-dev`-Cluster. **Die Datenhoheit liegt aber noch bei fleet** (`shared-db` auf Hetzner, `tickets`-Schema in der `website`-DB).

Diese Etappe verlagert das `tickets`-Schema in die lokale DB und stellt den CI-Rueckkanal her (Pull-Modell).

### Entscheidungen

**D1 — Vollstaendige Migration, kein Split-Modell.**
Das `tickets`-Schema wird vollstaendig in die lokale DB migriert. Auf fleet bleibt ein `readonly`-Archiv (E4 entfernt spaeter die SDLC-Routen aus dem Prod-Image — der write-path ist dann vollstaendig lokal). Grund: FK-Kanten nach `public.*` und `bachelorprojekt.*` sind minimal (tickets-Schema ist self-contained), und ein Split-Modell wurde die Komplexitaet unnötig erhoehen.

**D2 — GitHub-Poller (Pull-Modell).**
GitHub kann den Dev-Host nicht erreichen. Der Poller holt aktiv von GitHub und schreibt lokal. `babysit-prs.sh` und `auto-close-merged.sh` arbeiten bereits so — der Poller generalisiert dieses Muster.

**D3 — Outbox-Tabelle fuer Kunden-Bugmeldungen.**
Bugmeldungen von der Website in die lokale DB kriegen einen Schreibpfad: `public.bug_report_outbox` (nach dem Muster `public.systemtest_failure_outbox`). Der Poller liest sie ein.

**D4 — Backup-Pflicht.**
Die SDLC-Daten sind Bestandteil der Bachelorarbeit. Datenverlust auf einer Heim-Workstation ist nicht hinnehmbar. Ziel: `pg_dump` + `restic` auf S3-kompatiblen Storage (Filen/Backblaze).

### DoD

- Ein Factory-Tick laeuft vollstaendig ohne Verbindung zur Hetzner-DB
- Kein CI-Ereignis geht verloren, waehrend die Workstation aus ist
- `tickets`-Schema lokal, fleet-DB bereinigt
