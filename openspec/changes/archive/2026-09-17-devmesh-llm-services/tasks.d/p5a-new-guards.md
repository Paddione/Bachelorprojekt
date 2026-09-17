<!-- Partial p5a-new-guards — target_files: tests/spec/local-dev-mesh/llm-services.bats, tests/spec/local-dev-mesh/tailnet-policy.bats, tests/spec/mcp-gateway/start-windows-unc.bats, tests/spec/dev-pod-mcp-bundle/dev-pod.bats -->

## Partial P5a: Neue Guards (RED)

**Rolle:** tests · **depends_on:** p1a-gpu-endpoint, p1b-llm-services, p2-supervisor-fleet, p3a-windows, p3b-wsl-units, p4-docs-registry

**Ziel:** Jede Requirement/Scenario-Paarung aus `specs/local-dev-mesh.md`,
`specs/local-llm-proxy.md` und `specs/mcp-gateway.md` hat einen ausführbaren Guard,
`tailnet-policy.bats` ist auf die von P1a eingeführte `gpu_endpoint.ports`-Liste umgestellt und
`dev-pod.bats` deckt den fleet-Rückbau ab. Die Umstellung der Guards auf die gelöschten WSL-Units
steht in `tasks.d/p5b-guard-migration.md`.

**Abgleich gegen P1a/P1b (`tasks.d/p1a-gpu-endpoint.md`, `tasks.d/p1b-llm-services.md`):** Der
Vertrag unten stammt aus den dort geschriebenen Manifesten und Migrationen, nicht aus
`design.md`. Zahlen (Ports, Secret-Namen) sind Zitate daraus.

### Schnittstellenvertrag (aus P1a/P1b)

- **`devmesh/inventory.yaml` `gpu_endpoint`:** `{host, address, port, ports: [{name, port}, …]}`.
  `ports` ist eine **Liste** von Objekten, aktuell `lmstudio:1234, freetoken:1919, gemma12:8089, gemma4:8090, qwen38:8094`.
  `address` (100.102.71.114) ist neu, `port` (1234) bleibt der Wert für den unveränderten
  `http`-Port.
- **`llm-gateway-host` Service + EndpointSlice** tragen NACH dem Rendern den bestehenden
  `http`-Port (Service `port: 80`, EndpointSlice `port: <gpu_endpoint.port>`) **plus** einen
  benannten Port je Eintrag aus `gpu_endpoint.ports` (Name = `.name`, Port = `.port`, in beiden
  Ressourcen identisch). Ein Test, der die Portmenge der Service-Ressource exakt gegen die
  Inventarliste vergleicht, ist deshalb falsch — `http` ist immer zusätzlich da.
- **Deployment `llm-services`** (`dev-local/components/llm-services/deployment.yaml`): Container
  `mcp-node`, Image `ghcr.io/paddione/mcp-node`, env `MCP_NODE_SERVICES=llm-proxy,postgres,bge-mcp`
  Zusätzliche Env-Namen, die P1b
  setzt und die Guards unten referenzieren: `FACTORY_PG_URL`, `BGE_MCP_TOKEN`, `LLM_EMBED_URL`,
  `LLM_RERANKER_URL` (beide `http://127.0.0.1:18235`), `MCP_POSTGRES_TOKEN`,
  `MCP_READONLY_DB_PASSWORD`, `DATABASE_URL`, `LLM_PROXY_ADMIN_TOKEN`, `DEEPSEEK_API_KEY`.
- **Service `llm-services`**: `18235→18235` (llm-proxy), `13001→3001` (postgres),
  `13005→3007` (bge-mcp).
- **`scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql`**: existiert, seedet acht
  Zeilen (`freetoken-qwen36`, `llamacpp-gemma12`, `llamacpp-gemma4`, `llamacpp-qwen38` je
  `llm-gateway-host:<port>`; `cluster-embed`/`cluster-rerank` auf Cluster-DNS; `lmstudio` auf
  `llm-gateway-host:1234`; `deepseek` extern), keine `127.0.0.1`/`localhost`.
- **`environments/schema.yaml`**: `BGE_MCP_TOKEN`, `MCP_POSTGRES_TOKEN`,
  `MCP_READONLY_DB_PASSWORD` sind neu, alle drei `required: false` + `dev_absent: true` +
  nicht-leerer `dev_absent_reason`. **Geprüft (Nachtrag-Punkt 3):**
  `tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats` und
  `tests/unit/secrets-sync.bats` enthalten **keine** hartkodierte Namensliste — sie werten
  generisch `dev_absent`/`required` aus. Mit den drei Annotationen aus P1b.2 bleiben beide Guards
  grün, ohne dass P5a/P5b sie anfassen. Kein Eintrag in `target_files` nötig; hier nur als Beleg der
  Prüfung festgehalten.
- **`taskfiles/Taskfile.devmesh.yml`**: neuer Task `registry:migrate`, aufgerufen aus `deploy`.
  **Geprüft:** `tests/spec/local-dev-mesh/devmesh-taskfile.bats` enthält keine Zeile, die
  `deploy`s `cmds`-Liste oder die Menge der Tasks abschließend aufzählt (`grep -n
  'deploy\|cmds\|registry'` liefert keinen Treffer) — der neue Task bricht dort nichts, kein
  Eintrag in `target_files` nötig.
- **`scripts/mcp-gateway/start-windows.ps1` / `register-autostart.ps1`** (P3a):
  lösen `$RepoRoot` über `.ProviderPath` auf (Fix T900190). Außerdem gilt `design.md` D6 (kein lokaler `bge-mcp`-Start mehr, zusätzlicher
  Forward von `svc/llm-services` aus `--context devmesh` mit den Ports 18235/13001/13005) — P5a.1
  prüft nur das, was beide Requirements (`mcp-gateway.md`) tatsächlich verlangen, nicht P3s
  genaue Parametrisierung der bestehenden `DevPod*Port`-Parameter.

---

### Task P5a.1 — Failing-Test-Step (RED): neue Guards anlegen

**Files:**
- Create: `tests/spec/local-dev-mesh/llm-services.bats`
- Create: `tests/spec/mcp-gateway/start-windows-unc.bats`

**Interfaces:**
- Consumes: Schnittstellenvertrag oben; `scripts/devmesh/render-stack.sh`,
  `devmesh/inventory.yaml` (das ECHTE Inventar, keine Test-Fixture — P1a hat es bereits auf den
  Endzustand gebracht, ein synthetisches Fixture würde die Schema-Annahme duplizieren), `docker/mcp-node/supervisor.sh`,
  `scripts/mcp-gateway/start-windows.ps1`, `scripts/mcp-gateway/register-autostart.ps1` (IST-Stand
  vor P2/P3a).
- Produces: fünf `@test`-Blöcke in `llm-services.bats`, drei in `start-windows-unc.bats`, auf die
  Task P5a.4 als GREEN-Nachweis verweist.

- [ ] **Schritt 1: `tests/spec/local-dev-mesh/llm-services.bats` schreiben.**

```bash
cat > tests/spec/local-dev-mesh/llm-services.bats << 'EOF'
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/llm-services.bats — T900191
# SSOT: openspec/specs/local-dev-mesh.md ("devmesh hosts the CPU-bound LLM and database
#       services", "The GPU endpoint exposes one port per workstation GPU service",
#       "The devmesh backend registry contains no loopback URLs")
#
# Pruefmodus: gemischt.
#   - Render-Assertions (Deployment/Service/EndpointSlice): ERGEBNIS von
#     `scripts/devmesh/render-stack.sh core` gegen das ECHTE devmesh/inventory.yaml, nicht der
#     Quelltext der Kustomize-Bausteine — nur so faellt der Test auch dann rot aus, wenn eine
#     Ressource existiert, aber nicht in die Kustomization aufgenommen wurde. Die erwarteten
#     GPU-Portnamen werden aus demselben Inventar abgeleitet (selbstreferenziell), damit der Test
#     nicht an konkreten Portnummern haengt, die sich mit dem Inventar aendern koennen.
#   - Supervisor-Selektion: AUSGEFUEHRTES `docker/mcp-node/supervisor.sh` gegen PATH-Stubs,
#     nicht gegrept — das Requirement behauptet Laufzeitverhalten ("startet ... und keinen
#     anderen Server"), das ein Quelltext-Grep nicht widerlegen kann.
#   - Migrations-Datei: Quelltext-Ausnahme (T002448-M4) — das Ergebnis der Migration ist ihr
#     SQL-Inhalt, ein Cluster zum Ausfuehren steht in CI nicht zur Verfuegung.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDER="$REPO_ROOT/scripts/devmesh/render-stack.sh"
  SUPERVISOR="$REPO_ROOT/docker/mcp-node/supervisor.sh"
  MIGRATION="$REPO_ROOT/scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql"
  INVENTORY="$REPO_ROOT/devmesh/inventory.yaml"
  FIX="$(mktemp -d)"
}

teardown() { rm -rf "$FIX"; }

render() { (cd "$REPO_ROOT" && bash "$RENDER" core) > "$FIX/core.yaml" 2> "$FIX/core.err" || { cat "$FIX/core.err" >&2; return 1; }; }

@test "Requirement 'devmesh hosts the CPU-bound LLM and database services': Deployment und Service im core-Profil" {
  render
  run yq ea -r 'select(.kind == "Deployment" and .metadata.name == "llm-services") | .metadata.name' "$FIX/core.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "llm-services" ]

  run yq ea -r 'select(.kind == "Deployment" and .metadata.name == "llm-services") | .spec.template.spec.containers[] | select(.name == "mcp-node") | .env[] | select(.name == "MCP_NODE_SERVICES") | .value' "$FIX/core.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "llm-proxy,postgres,bge-mcp" ]

  ports="$(yq ea -r 'select(.kind == "Service" and .metadata.name == "llm-services") | .spec.ports[].port' "$FIX/core.yaml" | sort -n)"
  # Positiv-Anker: die Service-Ressource existiert ueberhaupt und traegt Ports
  [ -n "$ports" ]
  expected="$(printf '13001\n13005\n18235\n')"
  [ "$ports" = "$expected" ]
}

@test "Requirement 'The GPU endpoint exposes one port per workstation GPU service': ein benannter Port je Inventar-Eintrag zusaetzlich zu http" {
  render
  # Positiv-Anker: das Inventar listet mindestens einen GPU-Dienst — sonst waere die
  # Teilmengen-Pruefung unten vakuos erfuellt.
  inv_count="$(yq -r '.gpu_endpoint.ports // [] | length' "$INVENTORY")"
  [ "$inv_count" -gt 0 ]

  while IFS=$'\t' read -r pname pport; do
    [ -z "$pname" ] && continue
    svc_port="$(yq ea -r "select(.kind == \"Service\" and .metadata.name == \"llm-gateway-host\") | .spec.ports[] | select(.name == \"$pname\") | .port" "$FIX/core.yaml")"
    [ "$svc_port" = "$pport" ] || { echo "Service-Port fuer $pname: erwartet $pport, war '$svc_port'"; return 1; }
    eps_port="$(yq ea -r "select(.kind == \"EndpointSlice\" and .metadata.name == \"llm-gateway-host\") | .ports[] | select(.name == \"$pname\") | .port" "$FIX/core.yaml")"
    [ "$eps_port" = "$pport" ] || { echo "EndpointSlice-Port fuer $pname: erwartet $pport, war '$eps_port'"; return 1; }
  done < <(yq -r '.gpu_endpoint.ports[] | [.name, .port] | @tsv' "$INVENTORY")

  # http bleibt zusaetzlich bestehen (Requirement fordert "einen Port je Dienst", nicht den
  # Ersatz des bestehenden Ports).
  http_port="$(yq ea -r 'select(.kind == "Service" and .metadata.name == "llm-gateway-host") | .spec.ports[] | select(.name == "http") | .port' "$FIX/core.yaml")"
  [ "$http_port" = "80" ]

  addr="$(yq ea -r 'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .endpoints[0].addresses[0]' "$FIX/core.yaml")"
  inv_addr="$(yq -r '.gpu_endpoint.address' "$INVENTORY")"
  [ "$addr" = "$inv_addr" ]
}

@test "Requirement 'Only the three services start in the component': Supervisor startet genau llm-proxy, postgres, bge-mcp" {
  [ -f "$SUPERVISOR" ]
  BIN="$FIX/bin"; mkdir -p "$BIN"
  LOG="$FIX/supervisor.log"
  for t in node supergateway; do
    cat > "$BIN/$t" << STUB
#!/bin/sh
echo "invoked:$t:\$*" >> "$LOG"
sleep 30
STUB
    chmod +x "$BIN/$t"
  done

  run env -i PATH="$BIN:/usr/bin:/bin" \
    MCP_NODE_SERVICES="llm-proxy,postgres,bge-mcp" \
    MCP_SUPERVISOR_RESTART_DELAY=100 \
    DATABASE_URL="postgresql://x/y" \
    DEV_POD_REPO="$REPO_ROOT" \
    timeout 2 sh "$SUPERVISOR"
  # timeout beendet den Supervisor per SIGTERM (Exit 124) — das Log entsteht trotzdem.
  [ -s "$LOG" ]

  grep -qF 'start llm-proxy' "$LOG"
  grep -qF 'start postgres' "$LOG"
  grep -qF 'start bge-mcp' "$LOG"
  # Positiv-Anker oben (llm-proxy startete) belegt: fehlende Zeilen unten sind
  # tatsaechliche Abwesenheit, nicht ein grundsaetzlich leeres Log.
  refused="$(grep -cE 'start (github|ticket-mcp|brain-mcp|task-runner|codebase-memory)' "$LOG" || true)"
  [ "$refused" -eq 0 ]
}

@test "Requirement 'devmesh backend registry contains no loopback URLs': Migration seedet keine 127.0.0.1/localhost-base_url" {
  [ -f "$MIGRATION" ]
  hits="$(grep -ciE '127\.0\.0\.1|localhost' "$MIGRATION" || true)"
  [ "$hits" -eq 0 ]
}

@test "Requirement 'devmesh backend registry contains no loopback URLs': mindestens eine llm-gateway-host-Zeile (Positiv-Anker)" {
  [ -f "$MIGRATION" ]
  hits="$(grep -ciF 'llm-gateway-host' "$MIGRATION" || true)"
  [ "$hits" -ge 1 ]
}
EOF
```

- [ ] **Schritt 2: `tests/spec/mcp-gateway/start-windows-unc.bats` schreiben.**

```bash
cat > tests/spec/mcp-gateway/start-windows-unc.bats << 'EOF'
#!/usr/bin/env bats
# tests/spec/mcp-gateway/start-windows-unc.bats — T900190/T900191
# SSOT: openspec/specs/mcp-gateway.md ("Windows hosts have a documented start mechanism")
#
# Pruefmodus: Quelltext (dokumentierte Ausnahme T002448-M4, wie
# powershell-ascii-only.bats) — Windows-PowerShell laeuft nicht in der Linux-CI, das
# Ergebnis dieser Skripte manifestiert sich ausschliesslich in ihrem Inhalt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  START="$REPO_ROOT/scripts/mcp-gateway/start-windows.ps1"
  AUTOSTART="$REPO_ROOT/scripts/mcp-gateway/register-autostart.ps1"
}

@test "T900190: beide Skripte loesen RepoRoot ueber .ProviderPath auf, keines ueber ).Path" {
  for f in "$START" "$AUTOSTART"; do
    [ -f "$f" ]
    # Positiv-Anker: die Zeile mit Resolve-Path existiert ueberhaupt
    grep -q 'Resolve-Path' "$f"
    grep -q '(Resolve-Path .*)\.ProviderPath' "$f"
  done
  # Negativ-Aussage erst NACH dem Positiv-Anker (tests/CLAUDE.md): kein Skript
  # darf mehr das UNC-brechende ).Path an dieser Stelle verwenden.
  bad="$(grep -lE '\(Resolve-Path [^)]*\)\.Path\b' "$START" "$AUTOSTART" || true)"
  [ -z "$bad" ]
}

@test "start-windows.ps1 startet keinen lokalen bge-mcp-Prozess mehr" {
  [ -f "$START" ]
  hit="$(grep -ciE 'node.*bge-mcp[\\/]server\.mjs' "$START" || true)"
  [ "$hit" -eq 0 ]
}

@test "start-windows.ps1 forwardet svc/llm-services aus dem devmesh-Kontext mit allen drei Ports" {
  [ -f "$START" ]
  # Positiv-Anker: das Skript kennt ueberhaupt einen zweiten Kontext neben fleet
  grep -qF 'devmesh' "$START"
  line="$(grep -E 'context .?devmesh.? .*svc/llm-services' "$START" || true)"
  [ -n "$line" ]
  for port in 18235 13001 13005; do
    [[ "$line" == *"$port"* ]]
  done
}
EOF
```

- [ ] **Schritt 3: Syntax beider Dateien prüfen.**

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/local-dev-mesh/llm-services.bats
# erwartet: 5
tests/unit/lib/bats-core/bin/bats --count tests/spec/mcp-gateway/start-windows-unc.bats
# erwartet: 3
```

- [ ] **Schritt 4: Testlauf RED.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/llm-services.bats tests/spec/mcp-gateway/start-windows-unc.bats
# expected: FAIL — solange P2 (supervisor.sh MCP_NODE_SERVICES, bge-mcp-Eintrag) und P3a
# (start-windows.ps1) nicht im Branch liegen: der Supervisor-Test scheitert, weil supervisor.sh
# ohne P2 alle sechs bisherigen Server startet und bge-mcp fehlt; die start-windows-unc-Tests
# scheitern an ".Path" statt ".ProviderPath" und am noch vorhandenen
# "node ...\bge-mcp\server.mjs"-Start. Die drei render-basierten Tests sind ab P1a/P1b bereits gruen
# (beide liegen laut depends_on vor P5a) — das ist erwartet, kein Plan-Fehler: RED bezieht sich auf
# den Gesamtlauf inklusive der P2/P3a-abhaengigen Tests.
```

- [ ] **Schritt 5: Commit.**

```bash
git add tests/spec/local-dev-mesh/llm-services.bats tests/spec/mcp-gateway/start-windows-unc.bats
git commit -m "test(devmesh): guards fuer llm-services und start-windows UNC-Fix (rot) [T900191]"
```

---

### Task P5a.2 — `tailnet-policy.bats` auf `gpu_endpoint.ports` (Liste) umstellen

P1a hat `devmesh/inventory.yaml` bereits auf `gpu_endpoint.ports` (fünf Einträge) umgestellt und
`devmesh/tailnet-policy.hujson` entsprechend fünf Ziele in einer Regel gegeben (P1a.1/P1a.2).
`tests/spec/local-dev-mesh/tailnet-policy.bats` prüft weiterhin gegen den alten Vertrag (ein
einzelnes `gpu_endpoint.port`, ein Ziel) und ist deshalb nach P1a bereits rot — P1as eigener
Verifikations-Task P1a.4 hält das ausdrücklich fest ("nur der in B2 genannte Tailnet-Test rot,
bis P5a ihn umstellt"). Dieser Task behebt das.

**Files:**
- Modify: `tests/spec/local-dev-mesh/tailnet-policy.bats`

- [ ] **Schritt 1: Rot-Stand bestätigen.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/tailnet-policy.bats
# erwartet (Stand nach P1a, vor diesem Task): 3 ok, 1 not ok
# ("GPU-Endpunkt ist die einzige Ausnahme..." meldet "Ausnahme-Ziel ist nicht gpu-host:1234")
```

- [ ] **Schritt 2: `policy_facts()` auf die Portliste umstellen.** In der Python-Kennzahlenzeile
      `gpu_port = str(...)` durch die Liste ersetzen und die Ausgabezeile anpassen:

```python
# ersetzt: gpu_port = str((inv.get("gpu_endpoint") or {}).get("port") or "-")
gpu_ports = [str(p.get("port")) for p in ((inv.get("gpu_endpoint") or {}).get("ports") or [])]
```

```python
# ersetzt die print(...)-Zeile: "... gpuport={gpu_port} alias={alias}"
print(f"acls={len(acls)} grants={len(grants)} bad={bad} ports={','.join(sorted(ports))} mesh={int(mesh)}"
      f" exc={len(exc_rules)} excdst={','.join(exc_dst) or '-'} gpuports={','.join(gpu_ports) or '-'} alias={alias}")
```

  Den Kopfkommentar der Kennzahlenzeile (`#   gpuport = gpu_endpoint.port ...`) auf
  `#   gpuports = gpu_endpoint.ports[].port, komma-getrennt, Inventar-Reihenfolge` ändern.

- [ ] **Schritt 3: Den zweiten `@test`-Block ersetzen.**

```bash
@test "T900116: GPU-Endpunkt ist die einzige Ausnahme von tag:devmesh in einen Client" {
  run policy_facts
  [ "$status" -eq 0 ] || { echo "Policy oder Inventar nicht parsebar: $output"; return 1; }
  # Positiv-Anker: Inventar nennt mindestens einen GPU-Port, Policy definiert den Alias gpu-host.
  printf '%s\n' "$output" | grep -qE 'gpuports=[0-9]+(,[0-9]+)*' \
    || { echo "gpu_endpoint.ports fehlt im Inventar: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'alias=1' || { echo "hosts.gpu-host fehlt in der Policy: $output"; return 1; }
  local gpuports expected
  gpuports="$(printf '%s\n' "$output" | sed -nE 's/.*gpuports=([0-9,]+).*/\1/p')"
  expected="gpu-host:$(printf '%s' "$gpuports" | sed 's/,/,gpu-host:/g')"
  # Genau eine Regel, ein Ziel je Inventar-Port, in Inventar-Reihenfolge (Vertrag aus P1a B2).
  printf '%s\n' "$output" | grep -qF 'exc=1 ' || { echo "erwartet genau eine Ausnahme-Regel: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF "excdst=${expected} " \
    || { echo "Ausnahme-Ziele stimmen nicht mit gpu_endpoint.ports ueberein: $output (erwartet excdst=${expected})"; return 1; }
}
```

- [ ] **Schritt 4: Grün-Lauf.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/tailnet-policy.bats
# erwartet: 4 ok
```

- [ ] **Schritt 5: Rot-Gegenprobe.** In der Policy testweise ein sechstes Ziel in dieselbe
      Ausnahme-Regel einfügen (z. B. `"gpu-host:9999",`), Test muss an der `excdst=`-Zeile rot
      werden, danach verwerfen:

```bash
git diff --quiet devmesh/tailnet-policy.hujson || git checkout -- devmesh/tailnet-policy.hujson
```

- [ ] **Schritt 6: Commit.**

```bash
git add tests/spec/local-dev-mesh/tailnet-policy.bats
git commit -m "test(devmesh): tailnet-policy-Guard auf gpu_endpoint.ports-Liste umgestellt [T900191]"
```

---

### Task P5a.3 — Fleet-`dev-pod`-Rückbau: bestehenden Guard erweitern statt neuen anlegen

Der Deployment-Rückbau (`MCP_NODE_SERVICES` ohne `llm-proxy`/`postgres`, keine
`containerPort` 18235/3001 mehr) ist ein Fleet-Manifest-Detail, für das
`tests/spec/dev-pod-mcp-bundle/dev-pod.bats` bereits der etablierte Ort ist (parst
`k3d/dev-pod/deployment.yaml` mit `yq`/`node`, exakt dieselbe Prüfmethode). Ein zweiter Guard
in `tests/spec/mcp-gateway/` würde dasselbe Manifest aus einer zweiten Quelle prüfen und bei
der nächsten Änderung doppelt gepflegt werden müssen. **Abgleich mit P2:** Hält P2 den Namen `MCP_NODE_SERVICES` und
die fünf verbleibenden Server-Namen (`github,ticket-mcp,brain-mcp,task-runner,codebase-memory`)
nicht ein, ist Schritt 1 unten entsprechend nachzuziehen.

**Files:**
- Modify: `tests/spec/dev-pod-mcp-bundle/dev-pod.bats`

- [ ] **Schritt 1: Zwei `@test`-Blöcke nach `"dev-pod carries exactly the four declared containers"` (Zeile ~41) einfügen.**

```bash
@test "mcp-node container in dev-pod does not expose llm-proxy or postgres ports anymore" {
  run y "$DEPLOY" "d.spec.template.spec.containers.find(c=>c.name==='mcp-node').ports.map(p=>p.containerPort)"
  [ "$status" -eq 0 ]
  ports="$(echo "$output" | tr -d '[]' | tr ',' '\n')"
  # Positiv-Anker: der Container behaelt seine fuenf verbliebenen Ports.
  echo "$ports" | grep -qx '3002'
  refused="$(echo "$ports" | grep -cxE '18235|3001' || true)"
  [ "$refused" -eq 0 ]
}

@test "mcp-node container sets MCP_NODE_SERVICES without llm-proxy or postgres" {
  run y "$DEPLOY" "(d.spec.template.spec.containers.find(c=>c.name==='mcp-node').env.find(e=>e.name==='MCP_NODE_SERVICES')||{}).value"
  [ "$status" -eq 0 ]
  [ "$output" != "null" ]
  IFS=',' read -ra names <<< "$output"
  refused=0
  for n in "${names[@]}"; do
    case "$n" in llm-proxy|postgres) refused=1 ;; esac
  done
  [ "$refused" -eq 0 ]
  # Positiv-Anker: die fuenf verbliebenen Server sind weiterhin gelistet.
  [[ ",$output," == *,github,* ]]
}
```

- [ ] **Schritt 2: Testlauf RED (vor P2).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-pod-mcp-bundle/dev-pod.bats
# expected: FAIL — die zwei neuen Tests scheitern: containerPort 18235/3001 stehen noch im
# Manifest, MCP_NODE_SERVICES existiert dort noch nicht.
```

- [ ] **Schritt 3: Commit.**

```bash
git add tests/spec/dev-pod-mcp-bundle/dev-pod.bats
git commit -m "test(devmesh): dev-pod verliert llm-proxy/postgres-Ports (rot) [T900191]"
```

---
### Task P5a.4 — GREEN der neuen Guards und Rot-Gegenprobe

Läuft, nachdem alle impl-Partials im Branch liegen (depends_on).

- [ ] **Schritt 1: Neue und geänderte Guards dieses Partials grün laufen lassen.**

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/local-dev-mesh/llm-services.bats \
  tests/spec/local-dev-mesh/tailnet-policy.bats \
  tests/spec/mcp-gateway/start-windows-unc.bats \
  tests/spec/dev-pod-mcp-bundle/dev-pod.bats
# erwartet: alle ok
```

- [ ] **Schritt 2: Rot-Gegenprobe des Supervisor-Selektions-Tests.** `MCP_NODE_SERVICES` in der
      `env`-Zeile temporär auf `postgres,bge-mcp` (ohne `llm-proxy`) setzen, Test muss an der
      `grep -qF 'start llm-proxy'`-Zeile rot werden, danach verwerfen:

```bash
git diff --quiet tests/spec/local-dev-mesh/llm-services.bats || git checkout -- tests/spec/local-dev-mesh/llm-services.bats
```

- [ ] **Schritt 3: Commit.**

```bash
git add tests/spec/local-dev-mesh/llm-services.bats tests/spec/local-dev-mesh/tailnet-policy.bats \
  tests/spec/mcp-gateway/start-windows-unc.bats tests/spec/dev-pod-mcp-bundle/dev-pod.bats
git commit -m "test(devmesh): neue Guards gruen nach P1-P4 [T900191]"
```
