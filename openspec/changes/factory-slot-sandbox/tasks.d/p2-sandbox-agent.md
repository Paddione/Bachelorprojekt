# Partial p2 — Sandbox Agent (Stufe 2)

## Scope

`sandbox-run.sh` Upgrade zum Agent-Wrapper, neues Docker-Image für Agent-Sessions,
`pipeline.mjs` Integration, egress-allowlist Enforcement.

## Pre-Condition

p1 muss abgeschlossen sein (Slot-Mapping steht).

## Task List

### 1. scripts/factory/sandbox-agent.Dockerfile — Neues Image

- [ ] **1.1** Base `node:22-bookworm`, installiere `go-task curl git jq`
- [ ] **1.2** Globale Installation von `@anthropic-ai/claude-code` und `opencode`
- [ ] **1.3** Non-root User (UID 1000)
- [ ] **1.4** `WORKDIR /work`

### 2. scripts/factory/sandbox-run.sh — Agent-Mode

- [ ] **2.1** `--agent` Flag: langlebiger Container statt Einmal-Command
- [ ] **2.2** `--slot N` Flag: Pipeline-Slot für Naming und Isolation
- [ ] **2.3** Container-Naming: `factory-agent-slot-{N}-{ticket}`
- [ ] **2.4** Netzwerk: `factory-sandbox-slot-{N}` mit `docker network create`
- [ ] **2.5** egress_allowlist() per iptables im Container enforcen (`--cap-add=NET_ADMIN`)
- [ ] **2.6** Mounts: `/work` (Worktree), `/tmp` (dediziertes TMPDIR pro Slot)
- [ ] **2.7** cgroups: `--cpus=2 --memory=4g`
- [ ] **2.8** Fallback: Wenn Docker nicht verfügbar, direkter Host-Prozess mit Warnung

### 3. scripts/factory/pipeline.mjs — Sandbox-Integration

- [ ] **3.1** `PIPELINE_SLOT` aus `slots.sh slot-id <ticket>` lesen
- [ ] **3.2** Agent-Aufruf durch `sandbox-run.sh --agent --slot N` wrappen
- [ ] **3.3** `X-Slot-ID` Header in Agent-Config setzen (via Env `LLM_SLOT_ID`)

### 4. scripts/factory/sandbox.Dockerfile — Update

- [ ] **4.1** Non-root User hinzufügen (Konsistenz mit sandbox-agent)

## Verification

```bash
# Agent-Mode testen (mit dummy command)
FACTORY_SANDBOX=docker bash scripts/factory/sandbox-run.sh \
  --agent /tmp/test-worktree --slot 1 -- echo "agent running in slot 1"

# Container prüfen
docker ps --filter name=factory-agent-slot-1
docker inspect factory-agent-slot-1 | jq '.[0].HostConfig.CpusetCpus'
```
