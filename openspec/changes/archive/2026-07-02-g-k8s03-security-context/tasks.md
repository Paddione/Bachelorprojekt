---
title: "G-K8S03: Deployments securityContext ergänzen (3→0)"
ticket_id: T001295
domains: ["infra","security","k8s"]
status: plan_staged
---

# g-k8s03-security-context — Implementation Plan

## File Structure

| Status   | File                                  | Reason                                                                 |
|----------|---------------------------------------|------------------------------------------------------------------------|
| Geändert | `k3d/livekit.yaml`                    | Container-level securityContext für `livekit-egress` Deployment        |
| Geändert | `k3d/sealed-secrets-controller.yaml`  | Container-level securityContext für `sealed-secrets-controller`        |
| Geändert | `k3d/sessions-server.yaml`            | Container-level securityContext für `sessions-server` Deployment       |

## Task 0: Baseline messen (RED)

Bestätigung des Ist-Zustands, bevor irgendeine Datei angefasst wird.

- [ ] Measure-Command ausführen:
  ```bash
  python3 -c "
  import yaml, glob
  D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']
  print([x['metadata']['name'] for x in D if not x['spec']['template']['spec'].get('securityContext') and not all(c.get('securityContext') for c in x['spec']['template']['spec']['containers'])])
  "
  ```
  expected: FAIL (aktueller Wert: `['sessions-server', 'livekit-egress', 'sealed-secrets-controller']` — 3 Deployments ohne securityContext; Target: leere Liste `[]`)

## Task 1: securityContext für `sessions-server` ergänzen

Das `sessions-server`-Deployment verwendet `nginx:1.27-alpine`. Der nginx-Master-Prozess bindet Port 80 als root; `runAsNonRoot: true` würde den Start verhindern. Das Minimum ist daher `allowPrivilegeEscalation: false` auf Container-Ebene.

- [ ] In `k3d/sessions-server.yaml` im Container `nginx` (unter `spec.template.spec.containers[0]`) einen `securityContext`-Block ergänzen:
  ```yaml
          securityContext:
            allowPrivilegeEscalation: false
  ```
  Einfügen direkt nach dem `resources:`-Block und vor `volumeMounts:`, auf derselben Einrückungsebene wie `name`.

## Task 2: securityContext für `livekit-egress` ergänzen

Das `livekit-egress`-Deployment startet Chromium und Xvfb als root für Medienaufnahmen. `runAsNonRoot: true` würde den Pod-Start brechen. `allowPrivilegeEscalation: false` ist kompatibel und schließt den wichtigsten Eskalationspfad.

- [ ] In `k3d/livekit.yaml` das `livekit-egress`-Deployment lokalisieren (Name: `livekit-egress`, ab circa Zeile 438).
- [ ] Im Container `egress` (unter `spec.template.spec.containers[0]`) einen `securityContext`-Block ergänzen:
  ```yaml
          securityContext:
            allowPrivilegeEscalation: false
  ```
  Einfügen nach dem `resources:`-Block und vor `volumeMounts:`, auf derselben Einrückungsebene wie `name`.

## Task 3: securityContext für `sealed-secrets-controller` ergänzen

Das `bitnami/sealed-secrets-controller:0.27.3`-Image ist für UID 1001 (non-root) ausgelegt und unterstützt die vollständige minimale Härtung. Dieser Deployment-Controller hält den privaten RSA-Schlüssel für alle SealedSecrets — volle Härtung hat hier die höchste Priorität.

- [ ] In `k3d/sealed-secrets-controller.yaml` im Container `sealed-secrets-controller` (unter `spec.template.spec.containers[0]`) einen `securityContext`-Block ergänzen:
  ```yaml
        securityContext:
          runAsNonRoot: true
          allowPrivilegeEscalation: false
          capabilities:
            drop:
              - ALL
  ```
  Einfügen nach dem `resources:`-Block, auf derselben Einrückungsebene wie `name`.

## Task 4: Measure-Command erneut ausführen (GREEN)

Sicherstellen, dass alle drei Deployments jetzt aus der Ausgabe verschwunden sind.

- [ ] Measure-Command wiederholen:
  ```bash
  python3 -c "
  import yaml, glob
  D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']
  print([x['metadata']['name'] for x in D if not x['spec']['template']['spec'].get('securityContext') and not all(c.get('securityContext') for c in x['spec']['template']['spec']['containers'])])
  "
  ```
  Erwartetes Ergebnis: `[]` (leere Liste)

## Task 5 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-K8S03` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
