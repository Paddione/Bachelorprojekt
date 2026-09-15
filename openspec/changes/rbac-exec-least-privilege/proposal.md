# Proposal: rbac-exec-least-privilege

## Why

Drei Identitäten dürfen per `kubectl exec` in Pods, die sie nicht brauchen (gemessen 2026-09-10, `origin/main` 1c924b5b9):

- **ServiceAccount `website`** (Namespaces `website`, `website-staging`, `website-korczewski`) hat über die
  ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` **clusterweit** `pods/exec create` — also auch in den
  Prod-Workspace (`shared-db`) und in `workspace-dev` (dev-pod mit `dev-shell`-Home). Eine Kompromittierung der
  öffentlich erreichbaren Website führt damit direkt zu Code-Exec in beliebigen Pods. Gebraucht wird exec nur vom
  SDLC-Test-Runner (`tests/runner.sh local|prod`), und zwar im eigenen Website-Namespace und im eigenen Brand-Workspace.
- **ServiceAccount `factory-tick`** hat exec in ganz `workspace-dev`, weil der CronJob den Tick per
  `kubectl exec deploy/factory-runner` anstößt und Pod-Namen nicht per `resourceNames` adressierbar sind.
- **ServiceAccount `kube-system/dev-deployer`** ist `cluster-admin` mit einem Legacy-Token, manuell angelegt
  (2026-06-01), nicht im Repo, seit dem Anlagetag unbenutzt.

```bash
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website:website -n workspace-dev   # yes
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website:website -n workspace       # yes
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:workspace-dev:factory-tick -n workspace-dev  # yes
kubectl --context fleet -n kube-system get secret dev-deployer-token -o jsonpath='{.metadata.labels}'   # legacy-token-last-used 2026-06-01
```

Der Befund blockiert T900113 (git-crypt per GPG im dev-shell): ein entsperrter Clone unter `/home/dev` wäre sonst
für die Website-Identität lesbar.

## What

- **Website:** `pods/exec` aus der ClusterRole entfernen; stattdessen `Role`/`RoleBinding` nur im eigenen
  Website-Namespace (`website-self-exec`) und im zugehörigen Brand-Workspace (`website-test-runner-exec`,
  neue Datei in der k3d-Basis). Übrige Rechte unverändert (T900114).
- **factory-tick:** HTTP-Wakeup statt exec — Listener `docker/factory-runner/wakeup-listener.mjs` im Runner-Image,
  ClusterIP-Service, CronJob per `curl` ohne ServiceAccount-Token, Role `factory-tick-exec` entfällt,
  NetworkPolicy erlaubt nur tick → runner auf dem Listener-Port.
- **dev-deployer:** Audit-Skript `scripts/security/cluster-admin-audit.sh` mit Allowlist; Löschen von
  ClusterRoleBinding, Token-Secret und ServiceAccount als Ops-Schritt mit erneuter Nutzerbestätigung.
- **Guards:** BATS unter `tests/spec/security/` und `tests/spec/software-factory/`.

Nicht Teil: T900114, T900113, `k3d/tests-retention-cronjob.yaml`.

_Ticket: T900110_
