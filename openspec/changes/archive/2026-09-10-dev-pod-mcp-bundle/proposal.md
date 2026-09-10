# Proposal: dev-pod-mcp-bundle

## Why

Die MCP-Server sind heute auf drei Betriebsformen verteilt, und keine davon traegt allein:
der `claude-code-mcp-monolith` (Namespace `default`, vier Container) laeuft, wird aber von
keiner Flux-Kustomization erfasst und geht nur ueber ein manuelles
`kubectl apply -k k3d/default` live. Vier weitere Server laufen als lokale stdio-Prozesse auf
der Workstation. Die Clients erreichen die In-Cluster-Server ausschliesslich ueber
`kubectl port-forward` auf `localhost:{18080,13001,13002,13003,13005}` — faellt der Tunnel aus,
meldet jeder Client `ConnectionRefused`, und ein eigener Watchdog existiert nur, um genau diese
Tunnel am Leben zu halten. Der `llm-proxy` in `workspace-dev` steht auf 0/1: er installiert
`bash`, `curl` und `postgresql-client` zur Laufzeit per `apk add` nach und scheitert am
Alpine-CDN.

Ein Pod buendelt diese Teile, macht den Zugang unabhaengig von einer eingeschalteten
Workstation und ersetzt die Tunnel-Konstruktion durch feste Mesh-Routen.

## What

Ein Deployment `dev-pod` in `workspace-dev`, ausgerollt ueber Flux, mit drei Containern:

| Container | Inhalt |
|---|---|
| `mcp-node` | llm-proxy, ticket-mcp, brain-mcp, task-runner, codebase-memory, github, postgres — alle Node.js unter einem Supervisor |
| `mcp-kubernetes` | das Go-Binary von quay.io, unveraendert uebernommen |
| `repo-sync` | Sidecar, haelt das PVC per `git fetch && git reset --hard origin/main` aktuell |

Der `claude-code-mcp-monolith` entfaellt. `playwright` bleibt lokaler npx-stdio-Server; er
braucht keinen Repo-Zugriff und traegt als einziger ein 4-GiB-Limit, das im Bundle alle
uebrigen Server mitreissen wuerde. Der `keycloak`-Container wird nicht mitportiert — damit
erledigt sich der unter T002311 erfasste Defekt.

Der Zugang laeuft ausschliesslich ueber das wg-Mesh. Ein Ingress scheidet aus: `oauth2-proxy-dev`
traegt fuer genau diese Pfade ein `--skip-auth-route`, ein oeffentlicher Endpunkt haette
`mcp-kubernetes` und `mcp-postgres` also unauthentifiziert exponiert.

Der `llm-proxy` verliert seinen llama.cpp-Zweig: die Loadout-Verwaltung als systemd-User-Units
und der `exclusiveGroup`-Mechanismus setzten den WSL-Host voraus, den es seit ADR-007 nicht mehr
gibt. Im Cluster steht keine GPU zur Verfuegung (gemessen: alle sechs Nodes `gpu=KEINE`), der
Proxy bedient daher ausschliesslich Remote-Backends.

### ADR-007 wird bewusst ersetzt

`docs/adr/ADR-007-wsl-exit-fleet-native.md:51-52` verwirft beide Bausteine dieses Changes:
"Dev-in-Pod / Thin-Client (D)" mit der Begruendung "Worker-RAM 85-112 %, WAN-Latenz, native
Toolchain geht verloren", und "llm-proxy migrieren" mit "retire statt portieren".

Der RAM-Grund haelt der Messung nicht mehr stand:

```bash
kubectl --context fleet top nodes
# 2026-09-10: gekko-2 22% | gekko-3 43% | gekko-4 39% | pk-4 36% | pk-6 39% | pk-8 44%
```

WAN-Latenz und "native Toolchain geht verloren" bleiben unwiderlegt. Sie treffen den Pod als
*Arbeitsplatz*; dieser Change beansprucht ihn ausschliesslich als Server-Bundle. Die
interaktive Entwicklung bleibt Windows-nativ, wie ADR-007 sie beschreibt.

### Warum drei Container und nicht einer

```bash
kubectl --context fleet -n default top pod --containers -l app=claude-code-mcp-monolith
# 2026-09-10: github 61Mi | kubernetes 45Mi | playwright 144Mi | postgres 91Mi = 341Mi real
# deklarierte Requests derselben vier Container: 960Mi
```

Container in einem Pod teilen den Network-Namespace und kosten kaum RAM; die Reservierung
kostet. Ein Zusammenlegen aller Server in einen Container senkt den tatsaechlichen Verbrauch
nicht — dieselben Prozesse brauchen dasselbe — sondern nur die Zahl der Requests. Dasselbe
erreichen realistische Requests, ohne Absturz-Isolation und Probes pro Server aufzugeben.

_Ticket: T900107_
