---
title: Skill-Gap-Konsolidierung
description: 12 identifizierte Skill-Gaps in 5 Arbeitspakete konsolidieren — Sub-Skills zusammenfassen, an bestehende Skills anbinden, neue nur wo nötig
status: active
ticket_id: null
plan_ref: null
domains:
  - skills
  - docs
  - devflow
---

# Skill-Gap-Konsolidierung

## Motivation

Die Skills-Analyse hat 12 Workflows identifiziert, die in AGENTS.md referenziert werden aber kein eigenes Skill-Dokument haben. Diese Gaps einzeln als neue Skills abzubilden erzeugt Wartungslast und Zersplitterung. Stattdessen: Sub-Schritte in übergeordnete Skills integrieren, eng verwandte Gaps zu einem Skill zusammenfassen, und nur fachlich eigenständige Domänen als neue Skills anlegen.

## Konsolidierungsstrategie

### Prinzipien

1. **Sub-Step → Parent**: Ein Task, der nur als Teil eines übergeordneten Workflows existiert, wird als Section in den Parent integriert (z.B. `workspace:post-setup` → Section in `workspace-deploy`)
2. **Attach to existing**: Ein Task, der fachlich zu einem existierenden Skill passt, wird dort als Phase/Section ergänzt (z.B. `secrets:sync` → `secret-rotation`)
3. **New skill only when**: Der Workflow hat eigene Fehlermodi, Voraussetzungen und Entscheidungslogik, die einen separaten Runbook-Eintrag rechtfertigen (z.B. `llm-ops`, `factory-autopilot`)

### Gruppen

| Gruppe | Enthaltene Gaps | Typ | Ziel |
|--------|----------------|-----|------|
| A | workspace:setup, post-setup, admin-users-setup, vaultwarden:seed, talk-setup, recording-setup, transcriber-setup | Zusammenfassen | Neuer Skill `workspace-deploy` |
| B | secrets:sync | Anbinden | Section in `secret-rotation` |
| C | docs:deploy | Anbinden | Section in `fleet-ops` |
| D | openclaw:start/status/logs | Anbinden | Section in `host-node-networking` |
| E | llm:deploy/status/test | Neu | Neuer Skill `llm-ops` |
| F | factory:autopilot:install/status/uninstall | Neu | Neuer Skill `factory-autopilot` |

### Detail: Gruppe A — workspace-deploy (7 Gaps → 1 Skill)

Die Tasks `workspace:setup`, `workspace:post-setup`, `workspace:admin-users-setup`, `workspace:vaultwarden:seed`, `workspace:talk-setup`, `workspace:recording-setup`, `workspace:transcriber-setup` sind alles Sub-Schritte eines einzigen Full-Stack-Deployments.

**Skill-Struktur `workspace-deploy/SKILL.md`**:
- Phase 1: Umbrella — workspace:setup als Einstiegspunkt
- Phase 2: Core — workspace:deploy (Base-Kustomize)
- Phase 3: Office Stack — Collabora + CoTURN
- Phase 4: Post-Setup — post-setup, admin-users, vaultwarden:seed
- Phase 5: Talk — talk-setup inkl. HPB/Signaling
- Phase 6: Recording/Transcriber — recording-setup, transcriber-setup
- Fehlertabelle pro Phase
- Querverweise: fleet-ops (Cross-Brand), cluster-deployment (Initial-Deploy)

**Zugehörige Tickets schließen**: T000770, T000771, T000772, T000773, T000774, T000775, T000776

### Detail: Gruppe B — secrets:sync → secret-rotation

`secrets:sync` ist der letzte Schritt der Secret-Rotation-Pipeline: nach `env:fetch-cert` + `env:seal` werden die SealedSecrets auf den Cluster angewendet.

**Neue Section in `secret-rotation/SKILL.md`**:
- Schritt nach dem Seal: `task secrets:sync`
- Was es tut: kubectl apply der generierten SealedSecret-Ressourcen
- Cross-Brand: secrets:sync gilt für beide Namespaces
- Fehlersuche: SealedSecret wird nicht entschlüsselt (falscher Cert)

**Zugehöriges Ticket schließen**: T000769

### Detail: Gruppe C — docs:deploy → fleet-ops

`docs:deploy` ist bereits in der Promotion-Sektion von `fleet-ops` angerissen. Die bestehende Dokumentation reicht nah an ein vollständiges Runbook — es fehlen nur:
- Explizite Voraussetzungen (build-docs.mjs, Dockerfile)
- Fehlermodi (Build schlägt fehl, Image-Push schlägt fehl, Rollout hängt)
- Verify nach Deploy

**Neue Section in `fleet-ops/SKILL.md`**: "Docs Deploy Runbook"

**Zugehöriges Ticket schließen**: T000766

### Detail: Gruppe D — openclaw:ops → host-node-networking

`host-node-networking/SKILL.md` hat bereits Phase 4 "WSL OpenClaw Gateway Operations". Diese deckt install/configure ab, aber nicht die Betriebs-Tasks start/status/logs/backup/restore/wipe.

**Erweiterung Phase 4 in `host-node-networking/SKILL.md`**:
- Schritt 4.1: Setup & Startup (bestehend)
- Schritt 4.2: Betrieb — start, status, logs
- Schritt 4.3: Backup, Restore & Wipe (bestehend, erweitern)
- Schritt 4.4: Troubleshooting — Connection Refused, 503, WireGuard-Tunnel prüfen

**Zugehöriges Ticket schließen**: T000767

### Detail: Gruppe E — Neue Skill `llm-ops`

LLM-Operationen sind fachlich eigenständig: GPU-Worker-Anbindung, Modell-Management, Inferenz-Tests, Ollama/ComfyUI-Lifecycle. Kein existierender Skill deckt diese Domäne ab.

**Neue Skill `llm-ops/SKILL.md`**:
- Phase 1: Cluster-Topologie — GPU-Worker (10.10.0.3), WireGuard-Anbindung
- Phase 2: Deployment — llm:deploy (Ollama, ComfyUI)
- Phase 3: Status — llm:status (Pod-Health, GPU-Auslastung, Modell-Status)
- Phase 4: Testing — llm:test (Prompt → Response, Latenz)
- Phase 5: Modell-Management — Download, Update, Versionierung
- Troubleshooting: OOM, GPU Memory, CUDA-Version, Modell lädt nicht
- Querverweise: host-node-networking (WireGuard), secret-rotation (API-Keys)

**Zugehöriges Ticket schließen**: T000765

### Detail: Gruppe F — Neue Skill `factory-autopilot`

Der Factory Autopilot hat einen eigenen Lifecycle (systemd units, timer), eigene Konfiguration und eigene Fehlermodi. Nichts Vergleichbares existiert.

**Neue Skill `factory-autopilot/SKILL.md`**:
- Phase 1: Architektur — factory.service, factory.timer, wakeup.sh, dispatcher.js
- Phase 2: Installation — factory:autopilot:install
- Phase 3: Status — factory:autopilot:status (Timer, Service, letzter Tick, Queue)
- Phase 4: Deinstallation — factory:autopilot:uninstall
- Phase 5: Konfiguration — FACTORY_IDLE_RETICK_ENABLED, FACTORY_DAILY_DEPLOY_CAP
- Phase 6: Fehlersuche — Autopilot zieht keine Tickets, Timer läuft nicht, Service hängt
- Troubleshooting: journalctl, systemctl status, Queue-Inspektion
- Querverweise: operations-management (Incidents), dev-flow-execute (Factory-Integration)

**Zugehöriges Ticket schließen**: T000768

## Nicht-Konsolidierung (Begründung)

- **`llm-ops` und `factory-autopilot` bleiben getrennt**: Unterschiedliche Domänen (GPU/ML vs Automation/Scheduling), verschiedene Fehlermodi, verschiedene Zielgruppen. Ein gemeinsamer Skill würde zu lang und unübersichtlich.
- **`workspace-deploy` fasst 7 Gaps zusammen**: Weil alle Sub-Schritte derselben Umbrella-Operation sind und typischerweise nacheinander (oder als Batch) ausgeführt werden. Ein getrenntes Skill pro Sub-Step wäre Overhead.
- **`secrets:sync` wird nicht eigenständig**: Es ist buchstäblich der letzte Befehl in der Secret-Rotation-Kette. Als eigenständiger Skill ohne den Rest der Rotation wäre es zu dünn.

## Abhängigkeiten

- workspace-deploy: Setzt existierendes cluster-deployment voraus (Cluster muss stehen)
- llm-ops: Setzt GPU-Worker-Provisionierung (host-node-networking) voraus
- factory-autopilot: Setzt funktionierenden Cluster + DB voraus
- Alle Anbindungen: Keine neuen Abhängigkeiten — erweitern nur existierende Skills

## Qualitätskriterien

- Jeder neue/erweiterte Skill hat: Mishap-Tracking-Block, Related-Skills-Tabelle, Post-Execution-Schritt
- `task test:all` bleibt grün nach jeder Änderung
- AGENTS.md wird aktualisiert falls Routing-Tabelle neue Skills erwähnt
- Die 12 Ticket-Beschreibungen werden beim Schließen auf den Skill-Pfad verlinkt
