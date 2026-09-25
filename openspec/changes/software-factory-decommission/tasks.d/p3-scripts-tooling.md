---
title: "p3 — Remove factory scripts, VDA factory wrappers, and taskfiles"
ticket_id: T900399
domains: [scripts, repo-hygiene]
status: active
---

# p3 — Remove factory scripts, VDA factory wrappers, and taskfiles

Files: `Taskfile.yml`, `taskfiles/Taskfile.agents.yml`, `scripts/ticket.sh` (target_files dieses Partials; disjunkt zu p1, p2, p4, p5).

## Task 3.1: Taskfile-Bereinigung

1. In `Taskfile.yml`:
   - `factory:` Include (`taskfile: ./taskfiles/Taskfile.factory.yml`) entfernen.
   - Task `db:migrate` als Primärtask für Datenbankmigrationen definieren (ruft `scripts/migrate-db.mjs` auf).
   - Task `factory:migrate` als delegierenden Alias zu `db:migrate` beibehalten.
   - Tasks `test:factory` sowie `test:unit:factory-*` entfernen.
   - In `task test:changed` die Erkennung von `scripts/factory/` und `RUN_FACTORY` entfernen.
2. In `taskfiles/Taskfile.agents.yml`:
   - Tasks `factory-mcp:*` (start, stop, status, build, install, uninstall, service-status) entfernen.
   - Bereinigung von Meta-Tasks (`agents:up`, `agents:mcp:install`, `agents:mcp:uninstall`).
3. Datei `taskfiles/Taskfile.factory.yml` löschen.

## Task 3.2: Skripte und VDA-Wrapper löschen

1. Löschen des gesamten Verzeichnisses `scripts/factory/`.
2. Löschen der VDA-Factory-Skripte:
   - `scripts/vda/factory.sh`
   - `scripts/vda/factory-prep.sh`
   - `scripts/vda/factory/`
   - `scripts/factory-task-packet.sh`
   - `scripts/factory-mcp-node/`
   - `scripts/finetune/collect_factory_traces.py`
   - `scripts/llm/measure-factory-context.mjs`
3. Bereinigen von `scripts/ticket.sh`:
   - Subcommand `factory-control` und Hilfsfunktionen entfernen.
