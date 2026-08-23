---
title: "p5-tests"
ticket_id: T014553
domains: [test, infra]
status: active
---

# Partial p5 — Tests für Manifest-Hardening (alle GRs)

Sichert die drei Themenblöcke in den bestehenden Spec-Bats ab (keine neuen
Dateien). Stil folgt `tests/spec/rustdesk-server.bats`: `kustomize build` +
grep-Assertions bzw. direkte Datei-Greps für Patch-Dateien. Die Implementierung
kommt aus p1–p4; gegen den Stand davor sind alle neuen Assertions rot.

### Task 1: RED-Assertions in rustdesk-server.bats

**Files:** `tests/spec/rustdesk-server.bats`

Neue Tests im bestehenden Setup-Stil (`REPO_ROOT`/`STACK` aus `setup()`):

- `rustdesk: hbbs pod spec declares runAsNonRoot` — `kustomize build "$STACK"`,
  dann prüfen, dass im hbbs-Deployment-Block `runAsNonRoot: true` und
  `seccompProfile.type: RuntimeDefault` stehen und der Container
  `allowPrivilegeEscalation: false` setzt.
- `rustdesk: hbbr pod spec declares runAsNonRoot` — dieselben Assertions für hbbr.
- `rustdesk: workingDir ist nicht /root` — Build-Output darf kein
  `workingDir: /root` mehr enthalten.
- `rustdesk: README dokumentiert NetPol-Ausnahme` — grep auf `k3d/README.md`
  nach einer Sektion zu hostNetwork/NetworkPolicy mit `${TURN_NODE}`-Verweis.

Rot-Nachweis vor der Implementierung (p1 noch nicht angewendet):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
# expected: FAIL (red — Härtung und README-Sektion existieren noch nicht)
```

### Task 2: Assertions in sessions-server.bats

**Files:** `tests/spec/sessions-server.bats`

Neue Tests:

- `sessions-server: nginx lauscht auf 8080` — grep auf `k3d/sessions-server.yaml`
  nach `listen 8080` (ConfigMap) und `containerPort: 8080`.
- `sessions-server: Service zeigt auf 8080` — `targetPort: 8080` im Service-Block.
- `sessions-server: Container läuft non-root` — `runAsNonRoot: true` und
  `readOnlyRootFilesystem: true` im Deployment-Block.

### Task 3: Assertions in llm-pipeline.bats

**Files:** `tests/spec/llm-pipeline.bats`

Neuer Test:

- `llm-gpu: beide Deployments deklarieren runAsNonRoot` — grep auf
  `k3d/llm-gpu.yaml`: genau zwei Pod-Level-`securityContext`-Blöcke mit
  `runAsNonRoot: true`, und `fsGroup: 101` bleibt je Block erhalten.

### Task 4: Assertions in monitoring-alerts.bats

**Files:** `tests/spec/monitoring-alerts.bats`

Neuer Test:

- `monitoring: limits-patch deckt Hauptcontainer ab` — grep auf
  `prod/monitoring/resource-limits-patch.yaml` nach: `kind: DaemonSet` mit
  `monitoring-prometheus-node-exporter`, Container-Einträgen `grafana-sc-dashboard`,
  `grafana-sc-datasources`, `kube-state-metrics`, `kube-prometheus-stack`, jeweils
  mit `resources:` darunter.

### Task 5: Inventar & Gates

Nach allen Test-Änderungen:

```bash
task test:inventory
```

`components/website/src/data/test-inventory.json` gehört zum Commit dazu, falls
der Lauf sie ändert.
