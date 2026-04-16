# Infrastructure Drift Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all stale references to Prometheus/Grafana (removed from architecture) and the deleted Mattermost dialog-submit.ts endpoint across Taskfile, CLAUDE.md, docs, k3d manifests, and ArgoCD config.

**Architecture:** Pure cleanup — no new functionality. Each task is an isolated edit/delete to a specific file or set of related files. No tests needed (no logic), but `task workspace:validate` should pass after k3d manifest changes.

**Tech Stack:** YAML (Taskfile, k3s manifests), Markdown (docs), bash validation

---

## Files to Modify

| File | Change |
|------|--------|
| `Taskfile.yml` | Remove `namespaces:create`, `observability:install`, `workspace:monitoring`, `workspace:monitoring:all-prods`, `observability:remove` tasks |
| `CLAUDE.md` | Remove `task workspace:monitoring` line from Post-Deploy Setup |
| `docs/architecture.md` | Remove `MCP_GRAF`, `MCP_PROM` nodes, edges, click handlers, and class assignment |
| `docs/services.md` | Remove mcp-grafana and mcp-prometheus rows from MCP table |
| `docs/requirements.md` | Update NFA-06 to remove Prometheus+Grafana references |
| `k3d/network-policies.yaml` | Remove `allow-monitoring-ingress` NetworkPolicy block |
| `argocd/project.yaml` | Remove `- namespace: monitoring` entry |
| `k3d/docs-content/architecture.md` | Mirror same changes as `docs/architecture.md` |
| `k3d/docs-content/services.md` | Mirror same changes as `docs/services.md` |
| `k3d/docs-content/requirements.md` | Mirror same changes as `docs/requirements.md` |

---

### Task 1: Remove dead monitoring tasks from Taskfile.yml

**Files:**
- Modify: `Taskfile.yml`

These tasks reference the deleted `grafana/dsgvo-compliance-dashboard.json` file and a removed Prometheus+Grafana stack. Running them would fail at runtime.

- [ ] **Step 1: Remove the `namespaces:create` task block** (creates the monitoring namespace — no longer needed)

In `Taskfile.yml`, remove this entire block (approximately lines 61–73):

```yaml
  # ─────────────────────────────────────────────
  # Namespace Management
  # ─────────────────────────────────────────────
  namespaces:create:
    desc: Create monitoring namespace with PSS labels
    cmds:
      - |
        kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
        kubectl label namespace monitoring \
          pod-security.kubernetes.io/enforce=baseline \
          pod-security.kubernetes.io/warn=restricted \
          --overwrite
      - echo "✓ monitoring namespace ready"
```

- [ ] **Step 2: Remove the `observability:install`, `workspace:monitoring`, `workspace:monitoring:all-prods`, and `observability:remove` task blocks**

Remove this entire section (approximately lines 75–140, the full observability section including the section comment):

```yaml
  # ─────────────────────────────────────────────
  # Observability (required for NFA-02 compliance)
  # ─────────────────────────────────────────────
  observability:install:
    ...
  workspace:monitoring:
    ...
  workspace:monitoring:all-prods:
    ...
  observability:remove:
    ...
```

Keep `workspace:dsgvo-check` — it runs a separate compliance script and is unrelated to Prometheus/Grafana.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "chore: remove dead Prometheus/Grafana Taskfile tasks"
```

---

### Task 2: Remove `task workspace:monitoring` from CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove the stale line**

In `CLAUDE.md` under `### Post-Deploy Setup`, remove this line:

```
task workspace:monitoring        # Install Prometheus + Grafana + DSGVO dashboard (NFA-02)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: remove stale monitoring task from CLAUDE.md"
```

---

### Task 3: Remove MCP_GRAF and MCP_PROM from docs/architecture.md

**Files:**
- Modify: `docs/architecture.md`

Four locations in the Mermaid diagram need to change.

- [ ] **Step 1: Remove node definitions** (lines ~55–56 in the `ai` subgraph)

Remove these two lines:
```
            MCP_GRAF["MCP Grafana"]
            MCP_PROM["MCP Prometheus"]
```

- [ ] **Step 2: Remove edges** (lines ~111–112 in the AI/MCP section)

Remove these two lines:
```
    OC --> MCP_GRAF
    OC --> MCP_PROM
```

- [ ] **Step 3: Remove click handlers** (lines ~144–145)

Remove these two lines:
```
    click MCP_GRAF "#/services?id=claude-code-ki-assistent" "MCP Grafana: Zugriff auf Grafana Dashboards und Metriken."
    click MCP_PROM "#/services?id=claude-code-ki-assistent" "MCP Prometheus: Direkte PromQL-Abfragen fuer Cluster-Metriken."
```

- [ ] **Step 4: Remove from class assignment** (line ~157)

Change:
```
    class OC,MCP_K8S,MCP_PG,MCP_BR,MCP_GRAF,MCP_PROM,WHISPER,EMB ai_style
```
To:
```
    class OC,MCP_K8S,MCP_PG,MCP_BR,WHISPER,EMB ai_style
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: remove MCP Grafana/Prometheus nodes from architecture diagram"
```

---

### Task 4: Remove stale MCP rows from docs/services.md

**Files:**
- Modify: `docs/services.md`

- [ ] **Step 1: Remove the two stale table rows** (lines ~97–98)

Remove:
```
| `claude-code-mcp-grafana.yaml` | mcp-grafana | Grafana Dashboards und Metriken |
| `claude-code-mcp-prometheus.yaml` | mcp-prometheus | PromQL-Abfragen, Cluster-Metriken |
```

- [ ] **Step 2: Commit**

```bash
git add docs/services.md
git commit -m "docs: remove mcp-grafana and mcp-prometheus from services table"
```

---

### Task 5: Update NFA-06 in docs/requirements.md

**Files:**
- Modify: `docs/requirements.md`

NFA-06 currently lists Prometheus+Grafana as a requirement and has test criteria that can never pass (T2, T3 check Prometheus/Grafana endpoints). Update to reflect actual architecture.

- [ ] **Step 1: Update the NFA-06 row**

Find (line ~69):
```
| NFA-06 | Wartbarkeit | Gesamtes System als Kubernetes-Container betrieben. Updates via Rolling-Deployment. Konfiguration versioniert (GitOps). Monitoring via Prometheus + Grafana. | 1) Alle Services via docker compose up/down steuerbar<br>2) Konfiguration vollständig in Git versioniert<br>3) Monitoring via Prometheus + Grafana<br>4) Log-Aggregation verfügbar | T1: kubectl rollout restart → Rolling Update ohne Fehler<br>T2: Prometheus Metriken erreichbar<br>T3: Grafana Dashboard erreichbar |
```

Replace with:
```
| NFA-06 | Wartbarkeit | Gesamtes System als Kubernetes-Container betrieben. Updates via Rolling-Deployment. Konfiguration versioniert (GitOps). Kubernetes-native Health-Monitoring via Liveness/Readiness-Probes und kubectl logs. | 1) Alle Services via kubectl / Kustomize steuerbar<br>2) Konfiguration vollständig in Git versioniert (GitOps)<br>3) Liveness- und Readiness-Probes für alle Deployments konfiguriert<br>4) Log-Zugriff via kubectl logs verfügbar | T1: kubectl rollout restart → Rolling Update ohne Fehler<br>T2: Liveness-Probes für alle Deployments konfiguriert<br>T3: kubectl logs → Logs für alle Services erreichbar |
```

- [ ] **Step 2: Commit**

```bash
git add docs/requirements.md
git commit -m "docs: update NFA-06 to reflect Kubernetes-native monitoring (no Prometheus/Grafana)"
```

---

### Task 6: Remove allow-monitoring-ingress NetworkPolicy from k3d/network-policies.yaml

**Files:**
- Modify: `k3d/network-policies.yaml`

- [ ] **Step 1: Remove the NetworkPolicy block** (lines ~108–122)

Remove this entire block including the comment:
```yaml
---
# Prometheus-Scraping aus monitoring-Namespace erlauben
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-monitoring-ingress
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: monitoring
```

- [ ] **Step 2: Validate manifests**

```bash
task workspace:validate
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add k3d/network-policies.yaml
git commit -m "chore: remove allow-monitoring-ingress NetworkPolicy (monitoring namespace removed)"
```

---

### Task 7: Remove monitoring namespace from argocd/project.yaml

**Files:**
- Modify: `argocd/project.yaml`

- [ ] **Step 1: Remove the monitoring namespace entry** (lines ~25–26)

Remove:
```yaml
    - namespace: monitoring
      server: "*"
```

- [ ] **Step 2: Commit**

```bash
git add argocd/project.yaml
git commit -m "chore: remove monitoring namespace from ArgoCD project whitelist"
```

---

### Task 8: Sync k3d/docs-content mirror files

**Files:**
- Modify: `k3d/docs-content/architecture.md`
- Modify: `k3d/docs-content/services.md`
- Modify: `k3d/docs-content/requirements.md`

`k3d/docs-content/` mirrors `docs/` for the in-cluster Docsify site. Apply the exact same changes from Tasks 3–5.

- [ ] **Step 1: Apply architecture.md changes**

Same four edits as Task 3 (node definitions, edges, click handlers, class assignment) to `k3d/docs-content/architecture.md`. The file has identical content at the same line numbers.

- [ ] **Step 2: Apply services.md changes**

Same edit as Task 4 to `k3d/docs-content/services.md` — remove the mcp-grafana and mcp-prometheus table rows.

Note: `k3d/docs-content/services.md` has the rows at lines ~448–449 inside a different table (MCP capabilities table). Remove:
```
| mcp-grafana | mcp-grafana | Dashboards, Panels, Annotationen lesen | Dashboard-Erstellung |
| mcp-prometheus | mcp-prometheus | PromQL-Abfragen, Metriken, Alerts lesen | Konfigurationsaenderungen |
```

- [ ] **Step 3: Apply requirements.md changes**

Same edit as Task 5 to `k3d/docs-content/requirements.md` — update the NFA-06 row.

- [ ] **Step 4: Commit**

```bash
git add k3d/docs-content/architecture.md k3d/docs-content/services.md k3d/docs-content/requirements.md
git commit -m "docs: sync k3d/docs-content with Prometheus/Grafana removal and NFA-06 update"
```

---

### Task 9: Final validation

- [ ] **Step 1: Validate Kubernetes manifests**

```bash
task workspace:validate
```

Expected: No errors.

- [ ] **Step 2: Verify no remaining Prometheus/Grafana references in active files**

```bash
grep -r "prometheus\|grafana\|MCP_GRAF\|MCP_PROM\|monitoring namespace\|allow-monitoring" \
  Taskfile.yml CLAUDE.md docs/ k3d/docs-content/ k3d/network-policies.yaml argocd/project.yaml \
  --include="*.yaml" --include="*.md" --include="*.yml" -i -l
```

Expected: No files listed (all stale references removed). Files like `k3d/claude-code-mcp-grafana.yaml` and `k3d/claude-code-mcp-prometheus.yaml` may still exist as disabled manifests (`replicas: 0`) — those are intentionally kept as disabled/dormant resources and don't need removal unless the user wants full cleanup.

- [ ] **Step 3: Commit (if any fixups needed)**

```bash
git add -p
git commit -m "chore: fixup remaining stale references"
```
