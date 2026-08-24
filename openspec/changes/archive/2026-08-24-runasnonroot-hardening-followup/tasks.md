---
title: "runasnonroot-hardening-followup — Implementation Plan"
ticket_id: T015293
domains: [infra, security]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# runasnonroot-hardening-followup — Implementation Plan

_Ticket: T015293 · SA-GR-06 Rest-Scope (7 Deployments, 5 hardened / 5 Ausnahmen)_

## File Structure

```
k3d/coturn-stack/janus.yaml                       # modified: pod-level + container securityContext
k3d/default/claude-code-mcp-monolith-deploy.yaml  # modified: pod-sc gefüllt; kubernetes-Container gescoped; 4 Ausnahme-Marker
k3d/dev-stack/brett-dev.yaml                      # modified: pod-level + container securityContext (brett.yaml-Muster)
k3d/dev-stack/sish.yaml                           # modified: Ausnahme-Marker
k3d/dev-stack/website-dev.yaml                    # modified: pod-level + container securityContext
k3d/staging-stack/website-staging.yaml            # modified: pod-level + container securityContext
k3d/mentolder-web.yaml                            # modified: Ausnahme-Marker
tests/spec/security.bats                          # modified: Guard-Sektion run-as-non-root baseline
```

## Tasks

### 1. RED — Guard-Sektion in tests/spec/security.bats schreiben und scheitern sehen

Ergänze am Ende von `tests/spec/security.bats` eine Sektion
`run-as-non-root baseline (T015293)` mit einem python3+yaml-Test
(Verfügbarkeits-Guard `command -v python3` inklusive), der über alle 7
Manifeste iteriert und assertiert:

1. **Gehardenede Einheiten** tragen pod-level `securityContext.runAsNonRoot:
   true` + `seccompProfile.type: RuntimeDefault`, ihre genannten Container
   zusätzlich `runAsNonRoot: true`, `runAsUser: 1000`,
   `allowPrivilegeEscalation: false`:
   - janus (`k3d/coturn-stack/janus.yaml`, Container `janus`)
   - claude-code-mcp-monolith (`k3d/default/claude-code-mcp-monolith-deploy.yaml`, Container `kubernetes`)
   - brett-dev (`k3d/dev-stack/brett-dev.yaml`, Container `brett`; hier zusätzlich `readOnlyRootFilesystem: true` und `capabilities.drop == ["ALL"]`)
   - website-dev (`k3d/dev-stack/website-dev.yaml`, Container `website`)
   - website-staging (`k3d/staging-stack/website-staging.yaml`, Container `website`)
2. **Ausnahmen** haben in ihrem Container-Abschnitt (Zeilen des
   Container-Blocks) einen Kommentar beginnend mit
   `# runAsNonRoot-Ausnahme:`:
   - monolith postgres, playwright, github, Init github-binary
   - sish (`k3d/dev-stack/sish.yaml`)
   - mentolder-web (`k3d/mentolder-web.yaml`)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security.bats
# expected: FAIL (red — Manifeste haben weder sc noch Marker)
```

### 2. GREEN — Gehardenede Deployments absichern

Für janus, monolith/kubernetes, brett-dev, website-dev, website-staging:

```yaml
# pod-level (spec.securityContext):
securityContext:
  runAsNonRoot: true
  seccompProfile:
    type: RuntimeDefault
# container-level:
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
```

Sonderfälle:
- **brett-dev**: container-level vollständig nach k3d/brett.yaml:32-39
  übernehmen (`readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`);
  pod-level wie dort.
- **monolith**: das leere pod-level `securityContext: {}` füllen; nur der
  Container `kubernetes` bekommt den container-level Block.
- **janus**: `hostNetwork: true` und Ports unangetastet lassen.

### 3. GREEN — Ausnahmen dokumentieren

Jeder der 5 Ausnahme-Container erhält die Ausnahme mit dem Marker
`# runAsNonRoot-Ausnahme: <grund — siehe design.md D2>`:
- sish, mentolder-web: Kommentar direkt im Container-Block (YAML)
- monolith postgres/playwright/github(+Init): das Manifest ist ein reiner
  JSON-Export ohne Kommentar-Möglichkeit → Pod-Template-Annotation
  `runasnonroot-exceptions.t015293/security` mit dem selben Marker-Text;
  der Guard akzeptiert beide Varianten

### 4. Kontingenz janus

Schlägt der janus-Pod nach Rollout fehl (CreateContainerConfigError /
CrashLoop durch Runtime-Writes z.B. /var/run/janus): container-level Block
zurücknehmen und statt dessen den Ausnahme-Marker setzen (design.md D6).
Der Guard-Test bleibt grün — die Delta-Spec verlangt genau diese Alternative.

```bash
task workspace:validate
# expected: Kustomize dry-run grün
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Guard-Sektion ergänzen, gegen Ausgangsstand scheitern lassen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security.bats
# expected: FAIL (red)
```

- [ ] **Fix-Step (GREEN).** Manifeste harden + Marker setzen; Test muss passieren.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
