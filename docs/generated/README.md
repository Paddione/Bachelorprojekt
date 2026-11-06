# docs/generated — generierte Graph-Artefakte

## graph-k8s-env.json — K8s/Env-Graph (KEIN Code-Graph)

- `graph-k8s-env.json` ist ein **Kubernetes/Environment-Graph**: Nodes `{id, namespace, name, type}`
  (z. B. `CronJob`), Edges `{from, to, via, kind}` mit `kind=env` (z. B. `CronJob -> shared-db`
  via `env:PGHOST`). Stand: 104 Nodes, 2136 Edges.
- Dieser Graph enthält **keine** `file:line`-Spans und **keine** K3-Signaturen —
  er ist **NICHT** der K3-Code-Graph und darf nicht mit ihm verwechselt werden.
- Der **K3-Code-Graph** lebt im Index des `codebase-memory`-Hubs (MCP) plus Doku unter
  `docs/brain/k3-code-graph.md` (SSOT-adjacent). K3-Prüfungen (`list_projects`,
  `index_status`, `check_index_coverage`) laufen gegen den Hub-Index, nicht gegen
  diese JSON-Datei.
- Verboten: `validate_graph.py --repo` (oder ein anderer Code-Graph-Validator)
  gegen `graph-k8s-env.json` laufen lassen — das Artefakt ist ein Env-Graph,
  kein Symbol-/Call-Graph.
- Historie (Eigner-Entscheid 2026-11-06): umbenannt von `graph.json` nach
  `graph-k8s-env.json` (reines Rename, byte-identisch), um die Verwechslung
  mit dem K3-Code-Graph zu beenden. Es gibt bewusst **kein** `graph.json`
  mehr; kein Stub anlegen.
