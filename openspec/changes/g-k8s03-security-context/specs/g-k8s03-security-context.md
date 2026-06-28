# g-k8s03-security-context

## Purpose

Alle Kubernetes-Deployments im `k3d/`-Basis-Layer müssen mindestens einen nicht-leeren `securityContext` auf Pod- oder Container-Ebene tragen, sodass kein Container ohne explizite Privilege-Constraints in den Cluster deployt wird. Diese Anforderung schützt vor Privilege-Escalation-Angriffen, bei denen ein kompromittierter Prozess über setuid-Binaries oder uneingeschränkte Linux-Capabilities Zugriff auf den Host-Kernel erlangt.

## ADDED Requirements

### Requirement: Der Measure-Command `python3 -c "import yaml

The system SHALL der Measure-Command `python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print([x['metadata']['name'] for x in D if not x['spec']['template']['spec'].get('securityContext') and not all(c.get('securityContext') for c in x['spec']['template']['spec']['containers'])])"` muss reproduzierbar aus dem Repository-Root ausführbar sein und eine Python-Liste zurückliefern.
- REQ-2: Das `livekit-egress`-Deployment in `k3d/livekit.yaml` muss auf Container-Ebene einen `securityContext` mit mindestens `allowPrivilegeEscalation: false` besitzen.
- REQ-3: Das `sealed-secrets-controller`-Deployment in `k3d/sealed-secrets-controller.yaml` muss auf Container-Ebene einen `securityContext` mit `runAsNonRoot: true`, `allowPrivilegeEscalation: false` und `capabilities.drop: [ALL]` besitzen.
- REQ-4: Das `sessions-server`-Deployment in `k3d/sessions-server.yaml` muss auf Container-Ebene einen `securityContext` mit mindestens `allowPrivilegeEscalation: false` besitzen.
- REQ-5: Alle bestehenden 31 Deployments, die bereits einen gültigen `securityContext` besitzen, dürfen durch diese Änderung nicht modifiziert werden.
- REQ-6: Die Änderungen dürfen keine neuen `kustomize build`-Fehler im Basis-Layer erzeugen (`task workspace:validate` bleibt grün).

## Acceptance Criteria

- THEN liefert der Measure-Command die leere Liste `[]` (kein Deployment ohne securityContext).
- THEN ist `bash scripts/health-goals-check.sh --only=G-K8S03` grün und meldet 0/34 Deployments ohne securityContext.
- THEN sind `task test:changed` und `task freshness:check` grün.
- THEN enthält `k3d/livekit.yaml` im `livekit-egress`-Deployment-Container einen Block mit `allowPrivilegeEscalation: false`.
- THEN enthält `k3d/sealed-secrets-controller.yaml` im `sealed-secrets-controller`-Container einen Block mit `runAsNonRoot: true`, `allowPrivilegeEscalation: false` und `capabilities.drop: [ALL]`.
- THEN enthält `k3d/sessions-server.yaml` im `nginx`-Container einen Block mit `allowPrivilegeEscalation: false`.
