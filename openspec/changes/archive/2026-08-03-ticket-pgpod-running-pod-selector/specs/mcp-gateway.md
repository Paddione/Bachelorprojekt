## ADDED Requirements

### Requirement: mcp-kubernetes und mcp-postgres laufen mit read-only Identität

The MCP gateway SHALL expose `mcp-kubernetes` and `mcp-postgres` under an identity that
cannot mutate the cluster or the database, and the documentation SHALL name this as
intended least privilege rather than as a defect. `mcp-kubernetes` runs in-cluster under
the ServiceAccount `claude-code-agent`, whose ClusterRole grants only `get`/`list`/`watch`;
`mcp-postgres` wraps every statement in a read-only transaction. Cluster mutations and
writing SQL — including `pods_exec`, `pods_run`, `ALTER USER`, `ALTER ROLE` and `GRANT` —
SHALL go through `kubectl` instead.

#### Scenario: pods/exec über mcp-kubernetes wird verweigert

- **GIVEN** `mcp-kubernetes` bedient Anfragen unter der SA `claude-code-agent`
- **WHEN** ein Agent `pods_exec` aufruft
- **THEN** verweigert der API-Server die Anfrage mit "cannot create resource pods/exec",
  und dieses Verhalten ist als beabsichtigt dokumentiert — die ClusterRole wird **nicht**
  um `create pods/exec` erweitert

#### Scenario: Der Tool-Guide nennt die kubectl-pflichtigen Kubernetes-Tools vollständig

- **GIVEN** `.claude/skills/references/mcp-tool-guide.md` listet die bewusst
  kubectl-pflichtigen `mcp-kubernetes`-Tools auf
- **WHEN** die Liste gelesen wird
- **THEN** enthält sie neben `pods_delete`/`resources_*` auch `pods_exec` und `pods_run`,
  sodass ein Denial nicht als Fehlkonfiguration missgedeutet wird

#### Scenario: ALTER ROLE über mcp-postgres schlägt erwartungsgemäß fehl

- **GIVEN** `mcp-postgres` klammert jede Query in eine `READ ONLY`-Transaktion
- **WHEN** ein Agent `ALTER USER`, `ALTER ROLE` oder `GRANT` absetzt
- **THEN** antwortet PostgreSQL mit "cannot execute … in a read-only transaction", und der
  Tool-Guide weist diese Statements ausdrücklich dem `kubectl exec … psql`-Pfad zu

## ADDED Requirements

### Requirement: Architektur-Notiz beschreibt den tatsächlichen Betriebsmodus

The `mcp-gateway` SSOT spec SHALL describe how the MCP servers are actually served. The
claim that `claude-code-mcp-monolith` was decommissioned and that all MCP servers run as
host-side CLI processes is wrong for `mcp-kubernetes` and `mcp-postgres`: both are
`kubectl port-forward` targets on the in-cluster Deployment `claude-code-mcp-monolith` in
namespace `default`. The spec SHALL state this, because the wrong claim is what made the
read-only identity behind a denied `pods_exec` hard to locate.

#### Scenario: Betriebsmodus ist aus der Spec ableitbar

- **GIVEN** ein Operator untersucht, unter welcher Identität `mcp-kubernetes` Anfragen stellt
- **WHEN** er `openspec/specs/mcp-gateway.md` liest
- **THEN** findet er, dass `:18080` und `:13001` Port-Forwards auf
  `svc/claude-code-mcp-monolith` sind und die SA `claude-code-agent` die wirksame Identität
  ist — ohne die Deployment-Manifeste selbst lesen zu müssen
