# Proposal: ticket-pgpod-running-pod-selector

## Why

T002307 ist ein Mishap-Bundle mit drei Meldungen. Sie wurden **einzeln** gegen den
`main`-Stand (`3d91067da`) und gegen den Live-Cluster geprüft, bevor geplant wurde.
Nur eine davon ist ein Bug.

**Eintrag 1 — `ticket.sh` greift den Completed-Pod. BUG, real, wird gefixt.**
`_pgpod()` in `scripts/vda/ticket/_ticket-core.sh:32` listet Pods ungefiltert
(`kubectl get pod -l 'app in (shared-db, shared-db-dev)' -o name | head -1`). kubectl
sortiert nach Namen, also kann ein zurückgebliebener Pod in Phase `Succeeded`/`Failed`
vor dem lebenden einsortiert werden. Jeder der rund 25 `ticket.sh`-Aufrufe scheitert
dann im Folgeschritt an `kubectl exec` mit "cannot exec into a container in a completed
pod". Bisher half nur das manuelle Löschen des toten Pods. Alle Call-Sites laufen durch
diesen einen Helper — der Phasen-Filter gehört genau dorthin.

**Eintrag 2 — SA `claude-code-agent` hat kein `pods/exec`. KEIN Bug, Absicht.**
Die Ursache stand im Mishap nicht fest ("möglicherweise MCP-Server-Konfiguration ODER
fehlende RBAC-Rolle"); sie ist jetzt belegt. `mcp-kubernetes` auf `localhost:18080` ist
ein `kubectl port-forward` auf `svc/claude-code-mcp-monolith` (`default`), dessen
`kubernetes_mcp_server`-Container mit `--cluster-provider in-cluster` läuft und damit
den Token der SA `claude-code-agent` benutzt. Deren ClusterRole
(`k3d/default/claude-code-agent-clusterrole.yaml`) vergibt ausschließlich
`get`/`list`/`watch`; die einzige schreibende Berechtigung ist eine auf `default`
begrenzte Role für `deployments`/`deployments/scale`. Live bestätigt:
`kubectl --context fleet auth can-i create pods/exec --as=system:serviceaccount:default:claude-code-agent -n workspace`
antwortet `no`. Das ist dieselbe Least-Privilege-Linie, die der MCP-Tool-Guide als
"Mutations bleiben kubectl" festhält. `create pods/exec` cluster-weit an diese SA zu
vergeben, wäre eine Rechteausweitung auf faktisch Shell-in-jedem-Pod — erreichbar über
einen unauthentifizierten HTTP-Endpunkt auf `localhost`. Es wird **keine** RBAC-Regel
ergänzt. Was fehlt, ist Dokumentation: Der Guide listet `pods_delete`/`resources_*` als
bewusst kubectl-pflichtig, nennt `pods_exec`/`pods_run` aber nicht — deshalb las sich
das Denial wie eine Fehlkonfiguration.

**Eintrag 3 — `mcp-postgres` ist read-only. KEIN Bug, Absicht.**
Der `postgres`-Container derselben Monolith-Pod-Spec bridged
`@modelcontextprotocol/server-postgres`, das jede Query in eine `READ ONLY`-Transaktion
klammert — genau daher der gemeldete Wortlaut "cannot execute ALTER ROLE in a read-only
transaction". Der MCP-Tool-Guide schreibt diesen Zwang bereits als globale Invariante
fest ("Writes/DDL/Superuser bleiben kubectl"). Die Schutzschicht bleibt unangetastet.
Ergänzt wird nur, dass `ALTER USER`/`ALTER ROLE`/`GRANT` explizit darunter fallen, damit
der nächste Operator den Fehler als erwartet erkennt statt ihn erneut zu melden.

**Nebenbefund aus der Prüfung.** `openspec/specs/mcp-gateway.md` behauptet, der
`claude-code-mcp-monolith` sei dekommissioniert und die MCP-Server liefen als
CLI-Prozesse auf dem WSL-Host. Das Deployment läuft seit 56 Tagen (`1/1`), und
`:18080`/`:13001` sind Port-Forwards darauf. Diese falsche SSOT-Aussage ist der Grund,
warum die Identität hinter dem Denial nicht auf Anhieb auffindbar war — sie wird
korrigiert.

## What

1. **Fix (Verhalten):** `_pgpod()` filtert serverseitig auf
   `--field-selector status.phase=Running` und meldet im Fehlerfall unterscheidbar, ob
   gar kein Pod oder nur nicht-laufende Pods gefunden wurden.
2. **Doku (`.claude/skills/references/mcp-tool-guide.md`):** `pods_exec`/`pods_run` als
   RBAC-seitig by-design verweigert benennen (mit SA und ClusterRole als Beleg),
   `ALTER USER`/`ALTER ROLE`/`GRANT` in der read-only-Invariante des `mcp-postgres`
   explizit machen, und den dort dokumentierten `psql()`-Helper auf denselben
   Running-Filter ziehen wie `_pgpod`.
3. **SSOT korrigieren:** Architektur-Notiz in `openspec/specs/mcp-gateway.md` auf den
   tatsächlichen Betriebsmodus (In-Cluster-Monolith hinter Port-Forward, read-only SA)
   richtigstellen.

**Nicht in Scope (bewusst):** keine RBAC-Änderung, keine Aufweichung des
`mcp-postgres`-read-only, keine Änderung an der BRAND-/Namespace-Auflösung in
`scripts/ticket.sh` (T002280 arbeitet parallel daran) und keine Änderung an der
Brand-Topologie von `mcp-postgres` (T002278).

_Ticket: T002307_
