---
title: Website-DB auf devmesh vollständig initialisieren
domains: [infra, database]
status: active
goal: health-goals-infra-fit
file_locks: []
shared_changes: false
---

# Website-DB Bootstrap

Zweck: Der neue devmesh-DB-Pod initialisiert bisher nur brands, obwohl beide Website-Brands seine website-Datenbank verwenden. Die fehlenden customers/knowledge/polls-Tabellen verursachen reproduzierbar 500 oder 302 statt 404. Die Live-Datenbank wurde nach Backup mit vorhandenen SQL-Skripten repariert. Dieser Fix hält den Bootstrap über Neustarts und frische PVCs stabil.

## File Structure
- dev-local/core/massage-db-dev.yaml: vorhandenes knowledge- und meetings-Schema einbinden, in dieser Reihenfolge initialisieren, Readiness an Erfolg knüpfen.
- tests/py/spec/test_massage_devmesh.py: Startreihenfolge und SQL-Fehlerverhalten des echten Lifecycle-Kommandos prüfen.

## Tasks
- [x] RED: python3 -m pytest tests/py/spec/test_massage_devmesh.py -q → 1 failed (lifecycle fehlt), 1 passed.
- [x] Fresh-Init-Mounts und postStart gegen bestehende PVC hinzufügen.
- [x] GREEN: obiger Test prüft Reihenfolge, Erfolgsmarker und Fehlerpropagation.
- [x] task test:changed, task freshness:check, task workspace:validate.
- [ ] Commit, Push, PR, grüne CI und Squash-Merge, anschließend Live-Recheck der nicht existierenden Ticket-/Umfrage-IDs.

## Umsetzung und Belege
- Issue #7183 enthält Reproducer und PRE=d70ef159b.
- GREEN: gezielter Verhaltenstest 2 passed; Freshness und Workspace-Validate grün vor zusätzlicher Migrationsverdrahtung.
- Contact-Rootcause: inbox_items.brand fehlte trotz Basisschema. Vorhandene SQL-Migrationen error_log und business_memberships atomar angewendet. Sie werden als ConfigMap aus den Originaldateien eingebunden (keine SQL-Kopie).

## Leitplanken
Keine Drops, kein Recreate der PVC, kein Zugriff auf stillgelegte Fleet-Cluster, keine Secret-Werte in Ausgaben. Die bestehende website-schema ConfigMap bleibt SQL-SSOT.
