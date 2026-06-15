---
title: Gap Consolidation — Skills-Gaps schließen
description: 12 Skill-Gaps in 6 Arbeitspaketen konsolidieren — Sub-Skills zusammenfassen, an bestehende Skills anbinden, neue Skills nur wo nötig
status: active
ticket_id: null
plan_ref: null
domains: [website, infra, db, ops, security]
  - skills
  - docs
  - devflow
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

## Gap Consolidation Plan

### Ziel

12 identifizierte Skill-Gaps (T000765–T000776) in 6 Arbeitspakete konsolidieren:
- 7 Gaps → 1 neuen Skill `workspace-deploy` (Gruppe A)
- 3 Gaps → an bestehende Skills anbinden (Gruppen B, C, D)
- 2 Gaps → eigenständige neue Skills (Gruppen E, F)

### Arbeitspakete

---

#### AP 1: workspace-deploy Skill erstellen (T000770–T000776)

**Aufwand**: mittel (3–5 Dateien)
**Enthaltene Tickets**: T000770, T000771, T000772, T000773, T000774, T000775, T000776

**Steps**:

1. Verzeichnis anlegen: `.claude/skills/workspace-deploy/`
2. `SKILL.md` schreiben mit Phasen:
   - Phase 1: Umbrella — workspace:setup als Einstiegspunkt, Reihenfolge der Sub-Steps
   - Phase 2: Core Deploy — workspace:deploy (Base-Kustomize)
   - Phase 3: Office Stack — Collabora via workspace:office:deploy, CoTURN via workspace:coturn:deploy
   - Phase 4: Post-Setup — workspace:post-setup, workspace:admin-users-setup, workspace:vaultwarden:seed
   - Phase 5: Talk — workspace:talk-setup inkl. HPB/Signaling-Konfiguration
   - Phase 6: Recording/Transcriber — workspace:recording-setup, workspace:transcriber-setup
   - Fehlertabelle pro Phase: typische Symptome und Fixes
   - Post-Execution: Mishap Report, Related Skills
3. `.claude/skills/OVERVIEW.md` updaten — Eintrag in Tabelle + Mermaid-Graph
4. Ticket-Kommentare an T000770–T000776 mit Verweis auf neuen Skill

**Verify**: `cat .claude/skills/workspace-deploy/SKILL.md | head -5` + `task test:all`

---

#### AP 2: secrets:sync → secret-rotation anbinden (T000769)

**Aufwand**: klein (1 Datei editieren)
**Enthaltene Tickets**: T000769

**Steps**:

1. `secret-rotation/SKILL.md` lesen
2. Nach dem letzten Seal-Schritt eine Section "Secrets Sync" einfügen:
   - `task secrets:sync` als letzter Schritt der Rotation
   - Wirkung: kubectl apply der SealedSecrets auf den Cluster
   - Cross-Brand-Hinweis: Beide Namespaces (workspace, workspace-korczewski)
   - Troubleshooting: SealedSecret wird nicht entschlüsselt (Controller-Cert-Prüfung)
3. Related-Skills-Tabelle in `secret-rotation/SKILL.md` prüfen (keine Änderung nötig)
4. Ticket T000769 schließen mit Verweis auf neue Section

**Verify**: `task test:all`

---

#### AP 3: docs:deploy → fleet-ops anbinden (T000766)

**Aufwand**: klein (1 Datei editieren)
**Enthaltene Tickets**: T000766

**Steps**:

1. `fleet-ops/SKILL.md` lesen — Promotion-Sektion als Basis
2. Neue Section "Docs Deploy Runbook" einfügen:
   - Build: `node scripts/build-docs.mjs` regeneriert `k3d/docs-content-built/`
   - Docker: `docker build -f scripts/docs.Dockerfile .` → ghcr push
   - Deploy: `task docs:deploy` — rollout ohne Dev-Stage
   - Verify: rollout status, Pod-Logs, curl docs.<domain>
   - Fehlermodi: Build-Error, Image-Push-Error, Rollout-Timeout
3. Ticket T000766 schließen mit Verweis auf neue Section

**Verify**: `task test:all`

---

#### AP 4: openclaw:ops → host-node-networking anbinden (T000767)

**Aufwand**: klein (1 Datei editieren)
**Enthaltene Tickets**: T000767

**Steps**:

1. `host-node-networking/SKILL.md` lesen — Phase 4 als Basis
2. Phase 4 erweitern:
   - Schritt 4.1: Setup & Startup (bestehend)
   - Schritt 4.2: Betrieb — `task openclaw:start`, `task openclaw:status` (Prüfung Daemon + WireGuard-Tunnel + GPU-Worker 10.10.0.3), `task openclaw:logs` (journalctl / Log-Pfad)
   - Schritt 4.3: Backup/Restore/Wipe — bestehende Befehle, Fehlermodi ergänzen
   - Schritt 4.4: Troubleshooting — Connection Refused (WireGuard tot?), 503 (Ollama läuft nicht?), GPU nicht erreichbar
3. Ticket T000767 schließen mit Verweis auf erweiterte Phase

**Verify**: `task test:all`

---

#### AP 5: llm-ops Skill erstellen (T000765)

**Aufwand**: mittel (2 Dateien)
**Enthaltene Tickets**: T000765

**Steps**:

1. Verzeichnis anlegen: `.claude/skills/llm-ops/`
2. `SKILL.md` schreiben mit Phasen:
   - Phase 1: Topologie — GPU-Worker (10.10.0.3), WireGuard-Tunnel, Ollama/ComfyUI
   - Phase 2: Deploy — `task llm:deploy ENV=<env>` (Helm/Kustomize, Image-Versionierung)
   - Phase 3: Status — `task llm:status ENV=<env>` (Pod-Health via kubectl, GPU-Auslastung via nvidia-smi, Modell-Status via Ollama-API)
   - Phase 4: Testing — `task llm:test ENV=<env>` (Prompt → Response, Latenzmessung, Modell-Specific-Tests)
   - Phase 5: Modell-Management — Download (ollama pull), Update, Versionierung, Speicherplatz
   - Troubleshooting: OOM (Pod-Limits erhöhen), GPU Memory (nvidia-smi, Pod evicted), CUDA-Version mismatch, Modell lädt nicht (ollama list/logs), WireGuard tot
   - Related Skills: host-node-networking, secret-rotation, cluster-deployment
3. `.claude/skills/OVERVIEW.md` updaten — Eintrag in Tabelle
4. AGENTS.md Routing-Tabelle prüfen (llm:* ist bereits gelistet)
5. Ticket T000765 schließen

**Verify**: `task test:all`

---

#### AP 6: factory-autopilot Skill erstellen (T000768)

**Aufwand**: mittel (2 Dateien)
**Enthaltene Tickets**: T000768

**Steps**:

1. Verzeichnis anlegen: `.claude/skills/factory-autopilot/`
2. `SKILL.md` schreiben mit Phasen:
   - Phase 1: Architektur — factory.service (oneshot), factory.timer (OnUnitInactiveSec), wakeup.sh (flock, git-crypt, claude --workflow dispatcher.js), dispatcher.js (schedule → check → launch pipeline.js)
   - Phase 2: Install — `task factory:autopilot:install` (systemd-Units symlinken, daemon-reload, enable + start timer)
   - Phase 3: Status — `task factory:autopilot:status` (systemctl status, timer next elapse, letzter Tick via journalctl, Queue-Status via DB-Query)
   - Phase 4: Uninstall — `task factory:autopilot:uninstall` (stop + disable timer/service, remove symlinks)
   - Phase 5: Konfiguration — `FACTORY_IDLE_RETICK_ENABLED`, `FACTORY_DAILY_DEPLOY_CAP`, `FACTORY_TICK_LOCK`
   - Phase 6: Fehlersuche — Autopilot tickt nicht (Timer läuft? timer next elapse?), Factory zieht keine Tickets (Queue leer? Kill-Switch aktiv? Tages-Cap erreicht?), Pipeline crashed (journalctl -u factory.service --since "5 min ago")
   - Related Skills: operations-management, dev-flow-execute
3. `.claude/skills/OVERVIEW.md` updaten — Eintrag in Tabelle
4. AGENTS.md Routing-Tabelle prüfen (factory:autopilot:* ist bereits gelistet)
5. Ticket T000768 schließen

**Verify**: `task test:all`

---

### Abschluss: Cross-Cutting

Nach allen 6 APs:

1. **AGENTS.md Routing-Tabelle prüfen**: Neue Skills erwähnen falls Routing-Signale fehlen
2. **Freshness**: `task freshness:regenerate && task freshness:check`
3. **Gesamt-Test**: `task test:all`
4. **Tickets schließen**: Alle 12 Tickets auf status=done setzen mit Kommentar "Geschlossen via gap-consolidation — siehe Skill-Dokument"
5. **OVERVIEW.md-Sync**: Mermaid-Graph updaten falls neue Skills aufgenommen wurden

### Nicht-Ziele

- Keine Änderung an existierenden Tasks oder Taskfile
- Kein Refactoring der AGENTS.md Routing-Tabelle (nur ggf. Ergänzung)
- Keine Änderung an Test-Specs (nur neue Skill-Dokumente)
