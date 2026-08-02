# Proposal: t002185-health-goals-cronjob

## Why

`k3d/monitoring/health-goals-cronjob.yaml` ist eine leere Hülle: Der einzige Container-Befehl ist
`echo 'Running health goals check cron'` — es wird nichts gemessen. Die Datei ist außerdem **nicht**
als `resource` in `k3d/monitoring/kustomization.yaml` gelistet, wird also von keinem `kustomize build`
erfasst und landet nie im Cluster (`kubectl --context fleet -n workspace get cronjob` bestätigt: kein
`health-goals-check`-CronJob existiert live). Der Datei fehlt damit jede Wirkung — weder Messung noch
Deployment.

Die Datei entstand in T002151 (Observability-Remediation, PR #3195) als Platzhalter unter mehreren
Deliverables und wurde in T002063 (#3205) nur beim Image-Pin mitgepflegt, ohne den eigentlichen
Messbefehl je nachzuziehen — seither reine Bit-Leiche.

**Abgrenzung zu verwandten, bereits abgeschlossenen Tickets:**
- **T002148** ("SDLC-Health-Goals … auf Ziel bringen") behandelte die *Inhalte* der Repository-Health-Ziele
  in `.claude/lib/goals.md` — nicht diesen CronJob. Out of scope hier.
- **T002151** ("Observability-Remediation") hat diesen CronJob als einen von mehreren Deliverables
  eingeführt, aber unfertig gelassen. T002185 räumt genau dieses Leftover auf — es öffnet nicht erneut
  den größeren Observability-Scope.

Die eigentliche Health-Goals-Messung (`.claude/lib/goals.md` gegen reproduzierbare Ziele prüfen) läuft
bereits vollständig und funktionierend über `.github/workflows/health-goals.yml` (GitHub-Actions-Cron,
`task health:goals:update` → `scripts/health-goals-check.sh`) — dieser Workflow checkt das Repo aus und
hat Zugriff auf `.claude/lib/goals.md`, Taskfile und Node/Bash-Tooling. Ein Kubernetes-CronJob im
`monitoring`-Namespace (Image `alpine/k8s`, kein Repo-Checkout, kein Node/Task) kann dieselbe Messung
nicht sinnvoll nachbilden, ohne die bereits funktionierende GH-Actions-Pipeline zu duplizieren.

## What

- `k3d/monitoring/health-goals-cronjob.yaml` wird entfernt (dead code — nie registriert, nie deployed,
  keine reale Messlogik; die Zuständigkeit liegt bereits vollständig bei
  `.github/workflows/health-goals.yml`).
- Ein Regressionstest stellt sicher, dass künftig kein Kubernetes-Manifest in `k3d/monitoring/` existiert,
  das nicht als `resource` in `k3d/monitoring/kustomization.yaml` registriert ist — das verhindert, dass
  ein weiteres "totes" Manifest unbemerkt liegen bleibt.
- Kein Cluster-Deploy, kein neuer CronJob, keine Erweiterung des Observability-Scopes von T002151.

_Ticket: T002185_
