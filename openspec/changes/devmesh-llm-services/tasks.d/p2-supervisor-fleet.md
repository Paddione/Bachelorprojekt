<!-- Partial p2-supervisor-fleet — target_files: docker/mcp-node/supervisor.sh, docker/mcp-node/Dockerfile, k3d/dev-pod/deployment.yaml, k3d/dev-pod/service.yaml, scripts/openspec-embed-local.sh -->

## Partial P2: mcp-node-Supervisor und fleet-Rückbau

**Ziel:** Der `mcp-node`-Supervisor startet nur die Dienste, die `MCP_NODE_SERVICES` nennt
(design.md D4), kennt bge-mcp als neuen Eintrag und startet mcp-postgres nur mit Token (D5).
Der fleet-`dev-pod` startet llm-proxy und mcp-postgres nicht mehr (D1). Alle Stellen, die
diese beiden Ports am fleet-`dev-pod` erwarten, werden umgestellt.

**Spec:** `openspec/changes/devmesh-llm-services/specs/local-dev-mesh.md` → Requirement
"devmesh hosts the CPU-bound LLM and database services", Szenario "Only the three services
start in the component". `specs/local-llm-proxy.md` → "The proxy serves remote backends only"
(der Proxy läuft nicht mehr im fleet-`dev-pod`).

Stand der Messungen: `PRE=c33f8cf75` (Worktree `devmesh-llm-services-T900191`).

### Befunde, die den Zuschnitt bestimmen

1. **bge-mcp braucht keine Code-Änderung.** `scripts/bge-mcp/server.mjs` liest `BGE_MCP_HOST`
   (Default `127.0.0.1`) und `BGE_MCP_PORT` und endet ohne `BGE_MCP_TOKEN` (`requireToken` vor
   `server.listen`) mit Exit ungleich 0. Der Shim importiert `bge-router.ts` direkt; Node v22.23.2
   im Image strippt Typen ohne Flag. `server.mjs` und bge-Zeilen im Dockerfile sind deshalb nicht
   in `target_files`. Gemessen:

   ```bash
   grep -n "BGE_MCP_HOST\|BGE_MCP_PORT\|requireToken" scripts/bge-mcp/server.mjs
   kubectl --context fleet -n workspace-dev exec deploy/dev-pod -c mcp-node -- node --version   # v22.23.2
   BGE_MCP_TOKEN=x BGE_MCP_HOST=0.0.0.0 BGE_MCP_PORT=39107 \
     LLM_EMBED_URL=http://127.0.0.1:18235 LLM_RERANKER_URL=http://127.0.0.1:18235 \
     timeout 4 node scripts/bge-mcp/server.mjs &
   sleep 2; curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Authorization: Bearer x' \
     -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
     http://127.0.0.1:39107/mcp    # 200, Log: "listening on http://0.0.0.0:39107"
   ```

2. **Der Host-Guard begrenzt beide Token-Server auf Port-Forward-Clients.** `guardRequest`
   (`scripts/lib/mcp-http-security.mjs`) lehnt jeden `Host` ausser `127.0.0.1`, `localhost`, `::1`
   ab; ein Aufruf ueber die ClusterIP bekommt 403. `kubectl port-forward` reicht
   `Host: 127.0.0.1:<port>` durch und verbindet im Pod auf `localhost` (design.md D6). Deshalb ist
   `mcp-postgres-local.mjs` trotz festem `127.0.0.1`-Bind erreichbar. bge-mcp bindet `0.0.0.0`,
   damit der Service-`targetPort` auf einen Socket zeigt.

3. **Das bisherige postgres des Supervisors prüft kein Token.** `gateway postgres 3001
   "mcp-server-postgres …"` startet supergateway ohne Authentifizierung. Der Eintrag startet
   deshalb `scripts/mcp-gateway/mcp-postgres-local.mjs`: verlangt `MCP_POSTGRES_TOKEN`, laesst nur
   lesende Anfragen durch und importiert `pg`. Das Image hat `pg` nicht, der Checkout kein
   `node_modules`; die ESM-Aufloesung findet `/workspace/node_modules` (Dockerfile-Aenderung).
   Gemessen:

   ```bash
   grep -n "^import\|requireToken\|server.listen" scripts/mcp-gateway/mcp-postgres-local.mjs
   grep -n "pg\b" docker/mcp-node/Dockerfile || echo "pg fehlt im Image"
   jq -r .version node_modules/pg/package.json   # 8.23.0, Pin fuer das Image
   ```

   Verwaiste `mcp-server-postgres`-Kinder entstehen nur unter supergateway, der Supervisor startet
   `reap-postgres-children.sh` nicht mehr. Datei, COPY-Zeile und Pins bleiben;
   `tests/spec/mcp-gateway.bats` Zeile 199–238 bleibt gruen.

4. **Umgebungsvariablen des fleet-`dev-pod`:**
   - `DATABASE_URL`, `SHARED_DB_PASSWORD`: nur der postgres-Eintrag liest sie. Beide entfallen.
   - `FACTORY_PG_URL`, `WEBSITE_DB_PASSWORD` bleiben: ticket-mcp braucht sie nicht (geht ueber
     `_ticket-core.sh` per `kubectl exec`), aber `factory_psql` (`scripts/factory/lib.sh:122`) aus
     dem task-runner nutzt ohne kubectl nur `FACTORY_PG_URL`. Der Kommentar nennt diesen Grund.
   - `PGOPTIONS` bleibt (`tests/spec/mcp-gateway.bats:406`).
   - `LLM_PROXY_HOST_BIND`, `LLM_PROXY_PORT`, `LLM_PROXY_REMOTE_ONLY` entfallen.

   ```bash
   grep -rn "FACTORY_PG_URL" scripts/ticket-mcp-node scripts/brain-mcp-node scripts/mcp-task-runner scripts/vda/ticket || echo "keine Treffer"
   grep -n "kubectl exec" scripts/vda/ticket/_ticket-core.sh | head -2        # Anker: > 0
   grep -n "FACTORY_PG_URL" scripts/factory/lib.sh | head -2                   # Anker: > 0
   grep -n "PGOPTIONS" tests/spec/mcp-gateway.bats                             # Anker: > 0
   ```

5. **Kein In-Cluster-Konsument auf fleet zeigt auf den `dev-pod`.** `k3d/dev-stack/sdlc-console.yaml`
   setzt `LLM_ENABLED: "false"` ohne `LLM_PROXY_URL` (Fallback `127.0.0.1:18235`, Console meldet
   `unreachable`, Fail-closed-Zustand aus T016429). `k3d/sdlc-stack/sdlc-console.yaml` setzt
   `LLM_PROXY_URL: ""` und ist nicht in Flux. `factory-runner` nutzt
   `LLM_BASE_URL=http://192.168.100.10:1919/v1`. Die `18235`-Treffer in `scripts/factory/*`,
   `.github/workflows/arbitration.yml` und `taskfiles/Taskfile.sdlc.yml` meinen die Workstation.
   Alle diese Dateien bleiben unveraendert.

   ```bash
   git grep -n "18235\|LLM_PROXY_URL\|llm-proxy\.workspace-dev\|svc/llm-proxy" -- \
     k3d prod-fleet flux scripts/factory .github/workflows/arbitration.yml taskfiles/Taskfile.sdlc.yml \
     ':!k3d/docs-content-built'
   kubectl --context fleet -n workspace-dev get deploy sdlc-console \
     -o jsonpath='{.metadata.labels}{"\n"}{range .spec.template.spec.containers[*].env[*]}{.name}{"\n"}{end}'
   kubectl --context fleet -n workspace-dev get deploy factory-runner \
     -o jsonpath='{range .spec.template.spec.containers[*].env[*]}{.name}={.value}{"\n"}{end}' | grep -i llm
   ```

6. **Workstation-Forwards auf den fleet-`dev-pod` brechen mit.** `kubectl port-forward svc/dev-pod
   … 18235:18235` scheitert komplett (auch 18080), sobald der Port fehlt. Betroffen:
   `scripts/openspec-embed-local.sh` (Remediation-Text, dieses Partial) sowie
   `taskfiles/Taskfile.agents.yml`, `scripts/mcp-gateway/start-mcp-unified.sh:146`,
   `scripts/mcp-gateway/mcp-gateway.service` (P3b) und `scripts/mcp-gateway/start-windows.ps1` (P3a).

   ```bash
   git grep -n "svc/dev-pod" -- . ':!k3d/docs-content-built' ':!openspec/changes/archive'
   ```

7. **Das fleet-Deployment `llm-proxy` (`workspace-dev`) hat kein Manifest im Repo.** Alle
   `managedFields`-Manager sind `kubectl-*`, kein Flux-Label. Dasselbe gilt fuer Service,
   ServiceAccount `llm-proxy-sa`, ConfigMap `llm-proxy-mcp-config`, Role/RoleBinding
   `llm-proxy-pod-reader*`, ClusterRoleBinding `llm-proxy-kubectl`, NetworkPolicy
   `allow-llm-proxy-setup-egress` und Secret `llm-proxy-secrets`. Der Rueckbau (D1) ist deshalb ein
   Operator-Schritt nach dem Merge (Task P2.6). Gemessen:

   ```bash
   kubectl --context fleet -n workspace-dev get deploy llm-proxy \
     -o jsonpath='{.metadata.labels}{"\n"}{.metadata.managedFields[*].manager}{"\n"}'
   git grep -ln "llm-proxy-mcp-config\|llm-proxy-sa\|allow-llm-proxy-setup-egress\|llm-proxy-kubectl" -- . ':!k3d/docs-content-built' || echo "kein Manifest im Repo"
   ```

### File Structure (dieses Partial)

| Datei | Verantwortung | Ist | Budget |
|---|---|---|---|
| `docker/mcp-node/supervisor.sh` | Dienstauswahl, bge-mcp-Eintrag, postgres über `mcp-postgres-local.mjs` mit Token-Pflicht | 100 | 700 |
| `docker/mcp-node/Dockerfile` | `pg` zur Bauzeit nach `/workspace/node_modules` | 48 | kein S1-Limit für Dockerfile |
| `k3d/dev-pod/deployment.yaml` | `MCP_NODE_SERVICES` ohne llm-proxy/postgres, Ports 18235/3001 und nicht mehr gelesene Env-Werte raus, Readiness auf 3003 | 274 | kein S1-Limit für `.yaml` |
| `k3d/dev-pod/service.yaml` | Ports `llm-proxy` und `postgres` raus | 34 | kein S1-Limit für `.yaml` |
| `scripts/openspec-embed-local.sh` | Remediation-Text zeigt auf devmesh `svc/llm-services` | 206 | 594 |

**S1-Budget:** Keine der Dateien ist gebaselined. Für `.sh` gilt das statische Limit 800,
daraus ergeben sich die Budgets 700 und 594. `gates.yaml` → `s1.limits` hat keinen Eintrag für
`.yml`, `.yaml` oder Dockerfile. `supervisor.sh` wächst um etwa 45 Zeilen auf rund 145, also
18 % der Schwelle. `openspec-embed-local.sh` bleibt netto zeilenneutral. Gemessen:

```bash
PRE=c33f8cf75
grep -A15 '^  limits:' docs/code-quality/gates.yaml
for f in docker/mcp-node/supervisor.sh docker/mcp-node/Dockerfile k3d/dev-pod/deployment.yaml \
         k3d/dev-pod/service.yaml scripts/openspec-embed-local.sh; do
  printf '%s ist=%s baseline=%s\n' "$f" "$(wc -l < "$f")" \
    "$(jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json)"
done
```

<!-- vitest: kein neuer Test nötig, weil llm-proxy-client.ts nur als Befund gelesen und nicht geändert wird -->

**S4:** Es entstehen keine neuen Skripte oder Manifeste. `k3d/dev-pod/*` hängt weiter an
`k3d/dev-pod/kustomization.yaml` und `prod-fleet/dev-pod`.

### Interfaces

- **Produces (für P1b, `dev-local/components/llm-services`):**
  - `MCP_NODE_SERVICES=llm-proxy,postgres,bge-mcp` startet genau diese drei Dienste.
  - Pod-Ports: llm-proxy `18235`, postgres `3001` (nur `127.0.0.1`), bge-mcp `3007`
    (`0.0.0.0`). Die Service-Ports 18235/13001/13005 zeigen auf diese `targetPort`s.
  - Pflicht-Env: `MCP_POSTGRES_TOKEN` und `DATABASE_URL` für postgres, `BGE_MCP_TOKEN` für
    bge-mcp. Fehlt ein Wert, loggt der Supervisor `<dienst>: <VAR> nicht gesetzt — Server
    nicht gestartet` und startet den Dienst nicht.
  - Readiness-Vorschlag für P1b: `tcpSocket` auf `18235`, weil nur llm-proxy ohne Secret
    startet.
  - Ein unbekannter Name in `MCP_NODE_SERVICES` beendet den Supervisor mit Exit 2 und der
    Meldung `unbekannter Dienst '<name>' in MCP_NODE_SERVICES`. Ein Tippfehler zeigt sich so
    als CrashLoop statt als Pod ohne Server.
- **Consumes (von P1b/P3b):**
  - Namespace und Service-Name in devmesh: `workspace` / `llm-services`. Das folgt aus
    design.md D3 (`shared-db.workspace.svc`) und D6.
  - Den Dateinamen der zweiten systemd-Unit legt P3b fest:
    `scripts/mcp-gateway/devmesh-forward.service`. Die Verlinkung in
    `taskfiles/Taskfile.agents.yml` liegt ebenfalls bei P3b.

**Konventionen:** POSIX-`sh` im Supervisor (`#!/bin/sh`, kein Bash), Kommentare Deutsch in
ASCII ohne Umlaute wie im Bestand, Ticket-Marke `[T900191]`.

---

### Task P2.1: Supervisor mit Dienstauswahl, bge-mcp und Token-pflichtigem postgres

**Files:**
- Modify: `docker/mcp-node/supervisor.sh`

- [x] **Schritt 1: Kopfkommentar ergänzen.** Direkt unter dem bestehenden Kopfblock, vor
  `set -u`, einfügen:

```sh
#
# [T900191] MCP_NODE_SERVICES waehlt die Dienste (kommagetrennt):
#   llm-proxy, postgres, github, ticket-mcp, brain-mcp, task-runner,
#   codebase-memory, bge-mcp
# Leer oder ungesetzt = alle. Secret-/Token-Pruefungen gelten zusaetzlich:
# ein ausgewaehlter Dienst ohne Pflichtwert startet trotzdem nicht.
```

- [x] **Schritt 2: Auswahl-Helfer nach `trap shutdown TERM INT` einfügen**

```sh
SERVICES="$(printf '%s' "${MCP_NODE_SERVICES:-}" | tr -d ' ')"
KNOWN="llm-proxy postgres github ticket-mcp brain-mcp task-runner codebase-memory bge-mcp"
for s in $(printf '%s' "$SERVICES" | tr ',' ' '); do
  case " $KNOWN " in
    *" $s "*) ;;
    *) log "FEHLER: unbekannter Dienst '$s' in MCP_NODE_SERVICES (bekannt: $KNOWN)"; exit 2 ;;
  esac
done

# enabled <name> — 0, wenn der Dienst laut MCP_NODE_SERVICES starten soll.
enabled() {
  [ -z "$SERVICES" ] && return 0
  case ",$SERVICES," in
    *",$1,"*) return 0 ;;
  esac
  log "$1: nicht in MCP_NODE_SERVICES — Server nicht gestartet"
  return 1
}
```

- [x] **Schritt 3: llm-proxy-Block einklammern.** Der bestehende `supervise llm-proxy env …`
  Aufruf bleibt Zeile für Zeile gleich, einschließlich der `LOADOUTS_PATH=…loadouts.json`-Zeile,
  die `tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats` Test 1.3 prüft. Er steht jetzt
  innerhalb von:

```sh
if enabled llm-proxy; then
  supervise llm-proxy env \
    LLM_PROXY_HOST_BIND="${LLM_PROXY_HOST_BIND:-0.0.0.0}" \
    LLM_PROXY_PORT="${LLM_PROXY_PORT:-18235}" \
    LOADOUTS_PATH="${LOADOUTS_PATH:-$REPO/scripts/llm/loadouts.json}" \
    node "$REPO/scripts/llm-proxy/server.mjs"
fi
```

- [x] **Schritt 4: postgres-Block ersetzen** (den ganzen Abschnitt `# ── postgres (3001)` bis
  zum `fi`):

```sh
# ── postgres (3001) ──────────────────────────────────────────────────
# [T900191] mcp-postgres-local statt supergateway + mcp-server-postgres: der
# Server prueft MCP_POSTGRES_TOKEN (requireToken) und laesst nur lesende
# Einzelabfragen zur DB durch. supergateway prueft kein Token. Kein Reaper mehr:
# die verwaisten mcp-server-postgres-Kinder (T002321) entstehen nur unter
# supergateway. Der Server bindet fest auf 127.0.0.1 — Zugriff ueber
# kubectl port-forward, nicht ueber die ClusterIP.
if enabled postgres; then
  if [ -z "${DATABASE_URL:-}" ]; then
    log "postgres: DATABASE_URL nicht gesetzt — Server nicht gestartet"
  elif [ -z "${MCP_POSTGRES_TOKEN:-}" ]; then
    log "postgres: MCP_POSTGRES_TOKEN nicht gesetzt — Server nicht gestartet"
  else
    supervise postgres env PORT=3001 node "$REPO/scripts/mcp-gateway/mcp-postgres-local.mjs"
  fi
fi
```

- [x] **Schritt 5: github und die Repo-eigenen Server einklammern**

```sh
if enabled github; then
  if [ -n "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
    gateway github 3002 "/usr/local/bin/github-mcp-server stdio"
  else
    log "github: GITHUB_PERSONAL_ACCESS_TOKEN nicht gesetzt — Server nicht gestartet"
  fi
fi

# ── Repo-eigene Server ───────────────────────────────────────────────
enabled ticket-mcp      && gateway ticket-mcp    3003 "node $REPO/scripts/ticket-mcp-node/server.mjs"
enabled brain-mcp       && gateway brain-mcp     3004 "node $REPO/scripts/brain-mcp-node/server.mjs"
enabled task-runner     && gateway task-runner   3005 "node $REPO/scripts/mcp-task-runner/server.mjs --taskfile $REPO/Taskfile.yml"
enabled codebase-memory && gateway codebase-memory 3006 "codebase-memory-mcp"
```

- [x] **Schritt 6: bge-mcp-Eintrag vor `log "alle Server gestartet — warte"` anhängen**

```sh
# ── bge-mcp (3007) ───────────────────────────────────────────────────
# [T900191] Service-Port 13005 -> 3007. Embedding und Rerank laufen ueber den
# llm-proxy im selben Pod. Ohne llm-proxy in der Auswahl antwortet bge-mcp mit
# Upstream-Fehlern. 0.0.0.0, damit der Service-targetPort einen Socket hat; der
# Host-Guard in scripts/lib/mcp-http-security.mjs laesst trotzdem nur
# Loopback-Host-Header durch (Port-Forward).
if enabled bge-mcp; then
  if [ -z "${BGE_MCP_TOKEN:-}" ]; then
    log "bge-mcp: BGE_MCP_TOKEN nicht gesetzt — Server nicht gestartet"
  else
    supervise bge-mcp env \
      BGE_MCP_HOST="${BGE_MCP_HOST:-0.0.0.0}" \
      BGE_MCP_PORT=3007 \
      LLM_EMBED_URL=http://127.0.0.1:18235 \
      LLM_RERANKER_URL=http://127.0.0.1:18235 \
      node "$REPO/scripts/bge-mcp/server.mjs"
  fi
fi
```

Den Kopfkommentar "Supervisor fuer die sieben Node-MCP-Server" auf "acht" ändern.

- [x] **Schritt 7: Syntax, Lint und Auswahl-Verhalten prüfen**

```bash
sh -n docker/mcp-node/supervisor.sh
bash -n docker/mcp-node/supervisor.sh
shellcheck docker/mcp-node/supervisor.sh
# Auswahl ohne echte Server: node/supergateway als Stubs, Supervisor nach 2s beenden
tmp=$(mktemp -d); mkdir -p "$tmp/bin"
for b in node supergateway codebase-memory-mcp; do printf '#!/bin/sh\nsleep 30\n' > "$tmp/bin/$b"; chmod +x "$tmp/bin/$b"; done
run_sel() { PATH="$tmp/bin:$PATH" DEV_POD_REPO="$PWD" MCP_NODE_SERVICES="$1" timeout 2 sh docker/mcp-node/supervisor.sh 2>&1; }
run_sel "llm-proxy,postgres,bge-mcp" | grep '^\[supervisor\] start'
run_sel "llm-proxy,postgres,bge-mcp" | grep -c 'nicht gesetzt'          # 2 (postgres, bge-mcp ohne Token)
MCP_POSTGRES_TOKEN=t DATABASE_URL=postgresql://x BGE_MCP_TOKEN=t run_sel "llm-proxy,postgres,bge-mcp" | grep -c '^\[supervisor\] start'   # 3
run_sel "" | grep -c '^\[supervisor\] start'                             # 5: llm-proxy + 4 Repo-Server
run_sel "tiket-mcp"; echo "exit=$?"                                      # exit=2, "unbekannter Dienst 'tiket-mcp'"
```

Erwartet: `shellcheck` meldet nichts. Die Zählungen stimmen mit den Kommentaren überein. Jede
Zählung ist ein Positiv-Anker größer 0. Ist sie 0, lief der Supervisor nicht.

- [x] **Schritt 8: Bestehende Guards bleiben grün**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats
```

Erwartet: PASS. Die Reaper- und Pin-Guards lesen Reaper-Datei, Supervisor und Dockerfile
zusammen. Test 1.3 findet die `LOADOUTS_PATH`-Zeile.

- [x] **Schritt 9: Commit**

```bash
git add docker/mcp-node/supervisor.sh
git commit -m "feat(mcp): Dienstauswahl per MCP_NODE_SERVICES, bge-mcp und token-pflichtiges postgres [T900191]"
```

---

### Task P2.2: `pg` ins mcp-node-Image

**Files:**
- Modify: `docker/mcp-node/Dockerfile`

- [x] **Schritt 1: Pin und Installation ergänzen.** Nach den bestehenden `ARG`-Zeilen:

```dockerfile
ARG PG_VERSION=8.23.0
```

Nach dem bestehenden `RUN apk add … && rm -f /tmp/github-mcp-server.tar.gz` einen eigenen
Schritt einfügen, vor `COPY`:

```dockerfile
# [T900191] mcp-postgres-local.mjs (postgres-Eintrag des Supervisors) importiert
# `pg`. Der Checkout unter /workspace/repo hat kein node_modules; die
# ESM-Aufloesung sucht aufwaerts und findet /workspace/node_modules.
RUN mkdir -p /workspace \
 && npm install --prefix /workspace --no-audit --no-fund --omit=dev "pg@${PG_VERSION}"
```

Die Kopfzeile "Enthaelt llm-proxy, ticket-mcp, …" um `bge-mcp` ergänzen.

- [x] **Schritt 2: Bauen und Auflösung prüfen**

```bash
docker build -t mcp-node:t900191 docker/mcp-node
docker run --rm -v "$PWD:/workspace/repo:ro" --entrypoint node mcp-node:t900191 \
  -e "import('/workspace/repo/scripts/mcp-gateway/mcp-postgres-local.mjs').catch(e=>{console.log(e.message);process.exit(1)})" \
  ; echo "exit=$?"
```

Erwartet: Die Ausgabe enthält `MCP-HTTPSEC: Pflicht-Token fehlt — setze MCP_POSTGRES_TOKEN`.
Das Modul `pg` wurde also gefunden, und der Token-Guard greift. `Cannot find package 'pg'`
wäre ein Fehlschlag. Ohne lokales Docker läuft der Schritt im CI-Workflow, der das Image baut.

- [x] **Schritt 3: Commit**

```bash
git add docker/mcp-node/Dockerfile
git commit -m "feat(mcp): pg fuer mcp-postgres-local ins Image [T900191]"
```

---

### Task P2.3: fleet-`dev-pod` ohne llm-proxy und postgres

**Files:**
- Modify: `k3d/dev-pod/deployment.yaml`
- Modify: `k3d/dev-pod/service.yaml`

- [x] **Schritt 1: Env-Block des Containers `mcp-node` umstellen.** Entfernen:
  `LLM_PROXY_HOST_BIND`, `LLM_PROXY_PORT`, `LLM_PROXY_REMOTE_ONLY` samt Kommentaren,
  `SHARED_DB_PASSWORD`, `DATABASE_URL`, außerdem den Kommentarblock "dev-pod-secrets wird vom
  Operator per kubeseal angelegt …", der nur `SHARED_DB_PASSWORD` erklärt. Als erstes
  Env-Element einfügen:

```yaml
            # [T900191] llm-proxy und postgres laufen in devmesh
            # (dev-local/components/llm-services). Ohne diese Auswahl startete
            # der Supervisor beide erneut.
            - name: MCP_NODE_SERVICES
              value: "github,ticket-mcp,brain-mcp,task-runner,codebase-memory"
```

  Den Kommentar über `WEBSITE_DB_PASSWORD`/`FACTORY_PG_URL` so ersetzen:

```yaml
            # [T900106/T900191] factory_psql (scripts/factory/lib.sh) spricht mit
            # gesetzter FACTORY_PG_URL die ClusterIP direkt an; im Pod fehlt
            # kubectl. Seit dem Umzug des llm-proxy nach devmesh nutzt das nur
            # noch der task-runner, wenn er Factory-Tasks startet.
```

  `PGOPTIONS`, `GITHUB_PERSONAL_ACCESS_TOKEN` und `DEV_POD_REPO` bleiben unverändert.

- [x] **Schritt 2: Ports und Readiness.** Aus `ports:` die Zeilen `llm-proxy` (18235) und
  `postgres` (3001) entfernen. Die `readinessProbe` von `mcp-node` auf ticket-mcp umstellen:

```yaml
          readinessProbe:
            # [T900191] ticket-mcp (3003) startet ohne Secret; llm-proxy (18235)
            # laeuft nicht mehr in diesem Pod.
            tcpSocket:
              port: 3003
```

  `initialDelaySeconds`, `periodSeconds` und `failureThreshold` bleiben. Im Kopfkommentar die
  Zeile `mcp-node — llm-proxy, ticket-mcp, …, postgres unter einem Supervisor` auf
  `mcp-node — ticket-mcp, brain-mcp, task-runner, codebase-memory, github (MCP_NODE_SERVICES)`
  ändern, und den Titel `MCP-Server-Bundle + llm-proxy` auf `MCP-Server-Bundle`.

- [x] **Schritt 3: Service.** In `k3d/dev-pod/service.yaml` diese zwei Zeilen entfernen:

```yaml
    - { name: llm-proxy, port: 18235, targetPort: 18235, protocol: TCP }
    - { name: postgres, port: 3001, targetPort: 3001, protocol: TCP }
```

  Im Kopfkommentar den Satz über `mcp-postgres` ersetzen: "exponierte damit mcp-kubernetes
  unauthentifiziert — er liest den gesamten Cluster. mcp-postgres liegt seit T900191 in
  devmesh."

- [x] **Schritt 4: Render prüfen**

```bash
kubectl kustomize prod-fleet/dev-pod > /tmp/devpod.yaml; echo "render=$? zeilen=$(wc -l < /tmp/devpod.yaml)"
grep -c '18235' /tmp/devpod.yaml                                   # 0 (vorher 5)
grep -cE 'containerPort: 3001|port: 3001' /tmp/devpod.yaml         # 0
grep -A1 'name: MCP_NODE_SERVICES' /tmp/devpod.yaml                # value ohne llm-proxy/postgres
grep -cE 'name: (DATABASE_URL|SHARED_DB_PASSWORD|LLM_PROXY_)' /tmp/devpod.yaml   # 0
grep -cE 'name: (FACTORY_PG_URL|WEBSITE_DB_PASSWORD|PGOPTIONS)' /tmp/devpod.yaml # 3
task workspace:validate
tests/unit/lib/bats-core/bin/bats tests/spec/dev-pod-mcp-bundle/dev-pod.bats tests/spec/mcp-gateway.bats
```

Erwartet: `render=0` mit mehr als 0 Zeilen, danach die kommentierten Zählwerte. Beide
BATS-Dateien sind grün.

- [x] **Schritt 5: Commit**

```bash
git add k3d/dev-pod/deployment.yaml k3d/dev-pod/service.yaml
git commit -m "feat(infra): llm-proxy und postgres aus dem fleet-dev-pod entfernen [T900191]"
```

---

### Task P2.4: Remediation-Text in `scripts/openspec-embed-local.sh`

**Files:**
- Modify: `scripts/openspec-embed-local.sh`

- [x] **Schritt 1: Heredoc umstellen.** Die Zeilen unter "Seit T900107 laeuft er als Container
  des dev-pod …" bis zur `export LLM_PROXY_URL`-Zeile ersetzen. Die Zeilenzahl bleibt gleich:

```text
Seit T900191 laeuft er im devmesh-Pod llm-services; lokal ist er
optional. Zwei Wege:

  a) Gegen devmesh arbeiten (kein lokaler Proxy noetig):
       kubectl --context devmesh -n workspace port-forward svc/llm-services 18235:18235
     oder dauerhaft die Adresse setzen:
       export LLM_PROXY_URL=http://127.0.0.1:18235
```

  Den Kopfkommentar `[T900107] Der Proxy ist mit dem dev-pod in den Cluster gezogen.`
  (Zeile 21) auf `[T900191] Der Proxy laeuft in devmesh (svc/llm-services).` ändern.

- [x] **Schritt 2: Prüfen**

```bash
bash -n scripts/openspec-embed-local.sh
shellcheck scripts/openspec-embed-local.sh
git grep -n "svc/dev-pod" -- scripts/openspec-embed-local.sh | grep -c "18235"   # 0
git grep -c "svc/llm-services" -- scripts/openspec-embed-local.sh               # > 0
wc -l scripts/openspec-embed-local.sh   # 206
```

- [x] **Schritt 3: Commit**

```bash
git add scripts/openspec-embed-local.sh
git commit -m "docs(scripts): openspec-embed-local nennt devmesh svc/llm-services [T900191]"
```

---

### Task P2.5: In-Cluster-Konsumenten nach dem Rückbau belegen

Es gibt keine Dateiänderung. Befund 5 gilt nach dem Merge weiter, und kein fleet-Workload
zeigt auf `dev-pod:18235` oder `dev-pod:3001`.

**Files:**
- Verify: `k3d/dev-stack/sdlc-console.yaml`, `k3d/sdlc-stack/sdlc-console.yaml`

- [x] **Schritt 1: Referenzsuche**

```bash
git grep -nE "dev-pod[^ ]*:(18235|3001)|dev-pod\.workspace-dev" -- k3d prod-fleet flux scripts .github taskfiles \
  ':!k3d/docs-content-built' ':!scripts/mcp-gateway' || echo "keine In-Cluster-Referenz"
grep -n "LLM_ENABLED" k3d/dev-stack/sdlc-console.yaml     # Anker: "false"
```

Erwartet: `keine In-Cluster-Referenz`, der Anker liefert `LLM_ENABLED: "false"`. Die
fleet-`sdlc-console` bleibt ohne Proxy. `getProxyUrl()` fällt auf `127.0.0.1:18235` zurück,
und die Cockpit-Routen melden `unreachable`. Das ist das Verhalten, das T016429 dokumentiert
hat.

---

### Task P2.6: Operator-Schritt — fleet-Deployment `llm-proxy` abbauen (nach Merge)

Das Deployment hat kein Manifest (Befund 7), Flux entfernt es also nicht. Der Schritt ändert
den Cluster. Er läuft erst nach dem Merge, wenn devmesh `svc/llm-services` antwortet, und nur
nach ausdrücklicher Freigabe durch den Nutzer.

**Files:** keine

- [ ] **Schritt 1: Vorbedingung lesend prüfen**

```bash
kubectl --context devmesh -n workspace get deploy llm-services -o jsonpath='{.status.readyReplicas}{"\n"}'   # 1
kubectl --context fleet -n workspace-dev get endpoints llm-proxy
kubectl --context fleet -n workspace-dev get deploy dev-pod -o jsonpath='{.spec.template.spec.containers[0].ports[*].containerPort}{"\n"}'   # ohne 18235/3001
```

- [ ] **Schritt 2: Abbau (nur nach Freigabe)**

```bash
kubectl --context fleet -n workspace-dev delete deploy/llm-proxy svc/llm-proxy sa/llm-proxy-sa \
  cm/llm-proxy-mcp-config role/llm-proxy-pod-reader rolebinding/llm-proxy-pod-reader-binding \
  networkpolicy/allow-llm-proxy-setup-egress secret/llm-proxy-secrets
kubectl --context fleet delete clusterrolebinding/llm-proxy-kubectl
kubectl --context fleet -n workspace-dev get all,sa,cm,secret -l app=llm-proxy 2>&1 | tail -1   # No resources found
```

Erwartet: Jede `delete`-Zeile meldet `deleted`. Die Kontrollabfrage findet nichts.

---

### Task P2.7: Verifikation dieses Partials

**Files:**
- Verify: alle `target_files`

- [x] **Schritt 1: Lint, Render, S1**

```bash
sh -n docker/mcp-node/supervisor.sh && shellcheck docker/mcp-node/supervisor.sh scripts/openspec-embed-local.sh
kubectl kustomize prod-fleet/dev-pod | grep -cE '18235|containerPort: 3001'   # 0
wc -l docker/mcp-node/supervisor.sh scripts/openspec-embed-local.sh
jq -r '."S1:docker/mcp-node/supervisor.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

Erwartet: `supervisor.sh` hat weniger als 200 Zeilen, und die Baseline-Abfrage meldet
`nicht-baselined`.

- [x] **Schritt 2: Die drei Pflicht-Kommandos**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartet: Alle drei enden mit Exit 0. `task freshness:check` meldet `0 blocking`.

- [x] **Schritt 3: Commit der regenerierten Artefakte**

```bash
git add -A
git commit -m "chore(mcp): Freshness-Artefakte nach P2 [T900191]"
```
