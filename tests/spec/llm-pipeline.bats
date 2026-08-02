#!/usr/bin/env bats
# tests/spec/llm-pipeline.bats
# SSOT: openspec/specs/llm-pipeline.md
#
# Covers: LLM_ENABLED switch, embedding gateway, fail-closed on bge-m3 errors.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Embedding infrastructure ──────────────────────────────────────────

@test "embeddings.ts exists for embedding routing" {
  [ -f "$REPO/website/src/lib/embeddings.ts" ]
}

@test "embeddings.ts references LLM_ENABLED switch" {
  run grep -q 'LLM_ENABLED' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts routes through LLM gateway when LLM_ENABLED" {
  # T002426/T002551: die Gateway-Adresse steht nicht mehr in dieser Datei. Sie
  # kommt vom bge-Router — seit T002551 die reine resolveEndpoint-Aufloesung
  # (ein Endpoint pro Rolle). Geprueft wird deshalb die Indirektion, nicht mehr
  # das Adressliteral.
  run grep -q "from './bge-router'" "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
  run grep -qE 'llm-gateway' "$REPO/website/src/lib/bge-router.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts falls back to voyageai when LLM_ENABLED=false" {
  run grep -q 'voyageai\|voyage' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Fail-closed on GPU router errors ──────────────────────────────────

@test "embeddings.ts has error handling (EmbeddingQueryError or similar)" {
  run grep -qi 'EmbeddingQueryError\|EmbeddingIndexError\|throw.*Error\|catch' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Knowledge DB layer ────────────────────────────────────────────────

@test "knowledge-db.ts exists for pgvector operations" {
  [ -f "$REPO/website/src/lib/knowledge-db.ts" ]
}

# ── LLM_HOST_IP reachability from the k3d dev cluster [T002109] ────────
#
# The dev k3d cluster reaches the WSL host over the WireGuard mesh
# (192.168.100.0/24), the same address prod already uses. Docker bridge
# addresses do not work here: Docker Desktop runs its daemon in a separate
# docker-desktop distro, so no docker0/br-* interface exists in the working
# distro and k3d assigns a random per-cluster subnet.

dev_llm_host_ip() {
  grep -E '^\s*LLM_HOST_IP:' "$REPO/environments/dev.yaml" \
    | head -1 | sed -E 's/.*:\s*"?([0-9.]+)"?.*/\1/'
}

@test "dev LLM_HOST_IP is not a Docker bridge address" {
  local ip; ip="$(dev_llm_host_ip)"
  [ -n "$ip" ]
  # 172.16.0.0/12 covers docker0 (172.17.x) and every k3d-assigned subnet.
  if [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]]; then
    echo "LLM_HOST_IP=$ip is a Docker bridge address — unreachable from k3d pods" >&2
    return 1
  fi
}

@test "dev LLM_HOST_IP is inside the wg-mesh CIDR 192.168.100.0/24" {
  local ip; ip="$(dev_llm_host_ip)"
  [[ "$ip" =~ ^192\.168\.100\.[0-9]+$ ]]
}

@test "dev LLM_HOST_IP matches the GPU-host address used by prod envs" {
  local dev prod
  dev="$(dev_llm_host_ip)"
  prod="$(grep -E '^\s*LLM_HOST_IP:' "$REPO/environments/mentolder.yaml" \
    | head -1 | sed -E 's/.*:\s*"?([0-9.]+)"?.*/\1/')"
  [ "$dev" = "$prod" ]
}

@test "allow-llm-gateway-egress covers the CIDR that dev LLM_HOST_IP lives in" {
  run grep -q '192\.168\.100\.0/24' "$REPO/k3d/network-policies.yaml"
  [ "$status" -eq 0 ]
}

# ── llama.cpp infrastructure [T002110] ──────────────────────────

@test "k3d/llm-gpu.yaml defines llm-gateway-embed service on port 8081 (T002551)" {
  run grep -q 'name: llm-gateway-embed' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
  run grep -q 'port: 8081' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
}

@test "k3d/llm-gpu.yaml defines llm-gateway-rerank service on port 8081 (T002551)" {
  run grep -q 'name: llm-gateway-rerank' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
  run grep -q 'port: 8081' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
}

# ── bge-K8s-Migration (T002551) ─────────────────────────────────────────
# Die vier llama.cpp-Server wandern vom WSL-Host (Endpoints auf LLM_HOST_IP)
# in CPU-only Kubernetes-Deployments (bge-embed/bge-rerank). Die Gateway-
# Services bleiben unter demselben Namen erreichbar, aber der Vertrag ändert
# sich: Selector statt Endpoints, Port 8081 statt 8095/8096, Batch-Services
# entfallen. Live-Cluster-Tests skippen offline (Muster _skip_if_no_db).

_skip_if_no_llm_gateway() {
  if ! kubectl get svc llm-gateway-embed -n "${BGE_NS:-workspace}" \
    --context "${BGE_CTX:-fleet}" -o name >/dev/null 2>&1; then
    skip "no llm-gateway-embed service reachable (offline/CI)"
  fi
}

@test "bge-k8s: llm-gateway-embed Service hat Selector app=bge-embed (ClusterIP statt Endpoints)" {
  _skip_if_no_llm_gateway
  local sel
  sel="$(kubectl get svc llm-gateway-embed -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" \
    -o jsonpath='{.spec.selector.app}' 2>/dev/null)"
  [ "$sel" = "bge-embed" ]
}

@test "bge-k8s: llm-gateway-embed Service exponiert Port 8081" {
  _skip_if_no_llm_gateway
  local port
  port="$(kubectl get svc llm-gateway-embed -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" \
    -o jsonpath='{.spec.ports[0].port}' 2>/dev/null)"
  [ "$port" = "8081" ]
}

@test "bge-k8s: llm-gateway-rerank Service hat Selector app=bge-rerank" {
  _skip_if_no_llm_gateway
  local sel
  sel="$(kubectl get svc llm-gateway-rerank -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" \
    -o jsonpath='{.spec.selector.app}' 2>/dev/null)"
  [ "$sel" = "bge-rerank" ]
}

@test "bge-k8s: llm-gateway-rerank Service exponiert Port 8081" {
  _skip_if_no_llm_gateway
  local port
  port="$(kubectl get svc llm-gateway-rerank -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" \
    -o jsonpath='{.spec.ports[0].port}' 2>/dev/null)"
  [ "$port" = "8081" ]
}

@test "bge-k8s: bge-embed Deployment existiert" {
  _skip_if_no_llm_gateway
  kubectl get deploy bge-embed -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" >/dev/null 2>&1
}

@test "bge-k8s: bge-rerank Deployment existiert" {
  _skip_if_no_llm_gateway
  kubectl get deploy bge-rerank -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" >/dev/null 2>&1
}

@test "bge-k8s: Batch-Services existieren nicht mehr" {
  _skip_if_no_llm_gateway
  for svc in llm-gateway-embed-batch llm-gateway-rerank-batch; do
    if kubectl get svc "$svc" -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" \
      -o name >/dev/null 2>&1; then
      echo "Batch-Service $svc existiert noch" >&2
      return 1
    fi
  done
}

@test "no environment file declares LLM_EMBED_BATCH_URL (T002551)" {
  run grep -rE '^[[:space:]]*-[[:space:]]*name:[[:space:]]*LLM_EMBED_BATCH_URL[[:space:]]*$' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no environment file declares LLM_RERANKER_BATCH_URL (T002551)" {
  run grep -rE '^[[:space:]]*-[[:space:]]*name:[[:space:]]*LLM_RERANKER_BATCH_URL[[:space:]]*$' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no environment file declares LLM_BGE_LATENCY_BUDGET_MS or LLM_BGE_QUEUE_LIMIT (T002551)" {
  run grep -rE '^[[:space:]]*-[[:space:]]*name:[[:space:]]*(LLM_BGE_LATENCY_BUDGET_MS|LLM_BGE_QUEUE_LIMIT)[[:space:]]*$' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "k3d/llm-gpu.yaml exponiert Port 8081 statt 8095/8096 (T002551)" {
  run grep -q 'port: 8081' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
  run grep -qE 'port: 809[56]' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 1 ]
}

# ── Modell-PVCs auf Longhorn (T002551) ────────────────────────────────
# Die Basis (k3d/llm-gpu.yaml) laesst storageClassName frei, damit der lokale
# k3d-dev-Cluster die Default-SC (local-path) nutzt. Der Fleet-Cluster pinnt die
# Modell-PVCs im Prod-Overlay auf longhorn (Component
# prod-fleet/components/llm-models-longhorn) — repliziert statt node-lokal,
# kein erneuter HF-Download nach Node-Ausfall. Zwei Guards: statisch auf der
# Component (Entwicklungs-Repro), live auf dem Fleet-Cluster (Ist-Zustand).

@test "prod-fleet pinnt bge-Modell-PVCs per Component auf longhorn (T002551)" {
  local base="$REPO/prod-fleet"
  [ -f "$base/components/llm-models-longhorn/kustomization.yaml" ]
  [ -f "$base/components/llm-models-longhorn/storageclass-patch.yaml" ]
  for pvc in bge-embed-models bge-rerank-models; do
    run grep -q "name: $pvc" "$base/components/llm-models-longhorn/storageclass-patch.yaml"
    [ "$status" -eq 0 ]
  done
  run grep -c 'storageClassName: longhorn' "$base/components/llm-models-longhorn/storageclass-patch.yaml"
  [ "$output" -eq 2 ]
  # Beide Brand-Overlays binden die Component ein.
  for overlay in "$base/mentolder" "$base/korczewski"; do
    run grep -q 'llm-models-longhorn' "$overlay/kustomization.yaml"
    [ "$status" -eq 0 ]
  done
}

@test "bge-k8s: bge-Modell-PVCs liegen auf storageClass longhorn" {
  _skip_if_no_llm_gateway
  for pvc in bge-embed-models bge-rerank-models; do
    local sc
    sc="$(kubectl get pvc "$pvc" -n "${BGE_NS:-workspace}" --context "${BGE_CTX:-fleet}" \
      -o jsonpath='{.spec.storageClassName}' 2>/dev/null)"
    [ "$sc" = "longhorn" ] \
      || { echo "PVC $pvc nicht auf longhorn: '$sc'"; false; }
  done
}

@test "no environment file references old llm-gateway-tei-embed service" {
  run grep -r 'llm-gateway-tei-embed' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no environment file references old llm-gateway-tei-rerank service" {
  run grep -r 'llm-gateway-tei-rerank' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no environment file references old llm-gateway-lmstudio service" {
  run grep -r 'llm-gateway-lmstudio' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

# T002181: die vier folgenden Negativ-Assertions grepten über die ganze Datei und
# trafen damit die Grabstein-Kommentare ("# LLM_LMSTUDIO_URL removed — …"), die
# dokumentieren WARUM die Variable entfernt wurde. Die Variablen selbst sind
# längst weg. Geprüft wird jetzt gezielt die aktive YAML-Deklaration
# (`- name: <VAR>`); die erklärenden Kommentare dürfen bleiben.
assert_var_not_declared() {
  local var="$1"
  run grep -rE "^[[:space:]]*-[[:space:]]*name:[[:space:]]*${var}[[:space:]]*$" "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no schema or env file contains dead var LLM_LMSTUDIO_URL" {
  assert_var_not_declared LLM_LMSTUDIO_URL
}

@test "no schema or env file contains dead var LLM_CHAT_MODEL" {
  assert_var_not_declared LLM_CHAT_MODEL
}

@test "no schema or env file contains dead var LLM_CODING_MODEL" {
  assert_var_not_declared LLM_CODING_MODEL
}

@test "no schema or env file contains dead var LLM_EMBED_MODEL_NOMIC" {
  assert_var_not_declared LLM_EMBED_MODEL_NOMIC
}

# ── Physischer Batch (T002260) — im Cluster manifestgeprueft ─────────
# bge-m3 und bge-reranker-v2-m3 sind nicht-kausal (XLM-RoBERTa). llama.cpp kann
# eine solche Sequenz NICHT über mehrere physische Batches aufteilen — ohne
# -b/-ub gilt der Default n_ubatch=512 und jeder längere Input scheitert mit
# "input (N tokens) is too large to process". Das gesetzte -c 8192 hilft nicht.
# Der Ausfall ist unsichtbar: Kurztext-Smoke-Tests bleiben grün, und
# website/src/lib/rerank.ts verschluckt Rerank-Fehler zu score: 0.
# Die Flags lebten zuerst in start-embed-server.ps1/start-rerank-server.ps1;
# seit dem bge-Umzug (T002551) stehen sie in den Deployment-Args von
# k3d/llm-gpu.yaml (bge-embed und bge-rerank) — dort wird der Regressionsschutz
# weitergeführt, beide Deployments müssen -b/-ub 8192 behalten.

@test "bge-K8s-Manifest setzt -b und -ub auf volle Kontextlaenge (T002260)" {
  local f="$REPO/k3d/llm-gpu.yaml"
  # Jede der beiden Deployments (bge-embed, bge-rerank) fuehrt -b 8192 -ub 8192
  # in den Args (YAML-Listeneintraege "- <wert>"). -b/-ub kommen genau 2x vor,
  # der Wert 8192 genau 4x.
  run grep -cE '^[[:space:]]+- "-b"[[:space:]]*$' "$f"
  [ "$output" -eq 2 ]
  run grep -cE '^[[:space:]]+- "-ub"[[:space:]]*$' "$f"
  [ "$output" -eq 2 ]
  run grep -cE '^[[:space:]]+- "8192"[[:space:]]*$' "$f"
  [ "$output" -eq 4 ]
}

# ── CPU-only im Cluster (T002337) ─────────────────────────────────────
# Beide Hilfsmodelle liegen im CPU-RAM, damit das VRAM dem Chat-Modell gehoert
# (Gemma laeuft mit -Ctx 262144 und belegt rund 15,1 von 16,3 GiB). Im Cluster
# ist das strukturell erzwungen: die bge-Deployments deaktivieren CUDA via
# CUDA_VISIBLE_DEVICES="" und setzen -ngl 0. Der fruehere Host-Default-Guard
# (start-embed-server.ps1/start-rerank-server.ps1) ist damit durch das Manifest
# abgeloest — die Flags stehen jetzt in k3d/llm-gpu.yaml.
# Hinweis: der T002276-Flag-Guard auf register-scheduled-tasks.ps1 ist mit der
# Datei entfallen (T002551), der T002264-$Task.Expr-Key existiert ebenfalls nicht
# mehr — die Absichten sind in den Cluster-Guards oben aufgegangen.

@test "bge-K8s-Manifest deaktiviert CUDA (CPU-only, T002337)" {
  run grep -q 'CUDA_VISIBLE_DEVICES' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
}

@test "bge-K8s-Manifest setzt -ngl 0 fuer Embed und Rerank (CPU RAM, T002337)" {
  local f="$REPO/k3d/llm-gpu.yaml"
  run grep -cE '^[[:space:]]+- "-ngl"[[:space:]]*$' "$f"
  [ "$output" -eq 2 ]
  run grep -cE '^[[:space:]]+- "0"[[:space:]]*$' "$f"
  [ "$output" -eq 2 ]
}
# ── PowerShell-5.1-Parsebarkeit (T002275) ─────────────────────────────
# Die verbleibenden scripts/llm/*.ps1 (Bonsai, Gemma, gpt-oss) waren fuer
# PowerShell 5.1 nicht parsebar, aus
# zwei unabhaengigen Gruenden. Beide Guards sind statisch, weil CI unter Linux
# laeuft und kein PowerShell hat. Der echte Test ist auf Windows:
#   [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$errs)
#
# Grund 1 — Encoding: PS 5.1 liest eine .ps1 OHNE BOM als ANSI/Windows-1252.
# UTF-8-Mehrbyte-Sequenzen zerfallen, und einige der Bytes sind typografische
# Anfuehrungszeichen, die PowerShell als String-Delimiter akzeptiert:
#   '-' em dash  E2 80 94 -> Byte 0x94 = '"' in cp1252
#   Haken        E2 9C 93 -> Byte 0x93 = '"'
#   Pfeil rechts E2 86 92 -> Byte 0x92 = "'"
# Ein solches Zeichen im KOMMENTAR genuegt: es oeffnet einen String, der bis zum
# naechsten Anfuehrungszeichen laeuft. Der Parser zeigt dann auf eine Zeile weit
# darunter ("Zeichenfolge hat kein Abschlusszeichen").
#
# Grund 2 — Ternary: 'cond ? a : b' gibt es erst ab PowerShell 7. Auf diesem Host
# ist nur 5.1 installiert (kein pwsh.exe), dort ist es ein Parse-Fehler.

@test "no scripts/llm/*.ps1 contains a byte above 0x7F (T002275)" {
  # Absichtlich ALLE non-ASCII-Bytes, nicht nur die bekannten Quote-Ausloeser:
  # ein Test auf 'keine em dashes' waere zu eng, Haken und Pfeile brechen genauso.
  run bash -c "LC_ALL=C grep -lP '[\\x80-\\xff]' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
  [ "$status" -ne 0 ]
}

@test "no scripts/llm/*.ps1 uses the PS7-only ternary operator (T002275)" {
  run bash -c "grep -lE '\\)[[:space:]]+\\?[[:space:]]' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
  [ "$status" -ne 0 ]
}

@test "no scripts/llm/*.ps1 starts a server via Start-Job (T002276)" {
  # Ein Job haengt an der PowerShell-Sitzung; endet sie, stirbt der Server mit.
  # Kommentarzeilen ausgenommen - dort ist der alte Mechanismus dokumentiert.
  run bash -c "grep -nE 'Start-Job[[:space:]]+-ScriptBlock' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
}

@test "every scripts/llm/start-*.ps1 frees its port before starting (T002288)" {
  # Ohne Raeumung scheitert der neue Server still am Bind, waehrend der ALTE
  # Prozess sein Modell weiter im VRAM haelt. Gemessen 2026-07-27 nach einem
  # Lauf von llm-stack-autostart.cmd: je zwei llama-server auf 8095 und 8096,
  # 14119 statt 12285 MiB belegt - rund 1,8 GB pro Lauf, kumulierend.
  # Verzeichnisweit wie der Start-Job-Guard oben, damit neu hinzukommende
  # Startskripte automatisch abgedeckt sind.
  missing=""
  for f in "$REPO"/scripts/llm/start-*.ps1; do
    grep -q 'Get-NetTCPConnection' "$f" || missing="$missing $(basename "$f")"
  done
  [ -z "$missing" ] || { echo "ohne Port-Raeumung:$missing"; false; }
}

# ── Windows-Autostart entfernt (T002551) ─────────────────────────────
# Mit dem Umzug aller vier bge-Server in Kubernetes-Deployments
# (k3d/llm-gpu.yaml) ist auf dem Windows-Host kein bge-Server mehr zu starten
# oder zu ueberwachen: install-startup-autostart.ps1 (Startup-Ordner) und
# watchdog-llm-servers.ps1 hatten seit T002459 ausschliesslich bge-Eintraege,
# das Batch-Paar startete ueber eigene Skripte. Seit dem Longhorn-Ausbau
# entfallen auch die zwei interaktiven Host-Server (8095/8096): der bge-mcp-
# User-Service erreicht das Cluster-Deployment per kubectl port-forward
# (127.0.0.1:8081/8082) — die Windows-Scheduled-Tasks und ihre Startskripte
# (inkl. der letzten F:\Embedding-Referenz) sind obsolet. Gemma laeuft schon
# seit T002459 nicht mehr ueber den Windows-Autostart, sondern als Loadout im
# Linux-llm-proxy mit nativem 'systemd Restart=on-failure' (design.md D3).

@test "Windows-Autostart, Watchdog und interaktive bge-Server sind mit dem bge-Umzug entfernt (T002551)" {
  for f in install-startup-autostart.ps1 watchdog-llm-servers.ps1 \
           start-embed-batch-server.ps1 start-rerank-batch-server.ps1 \
           start-embed-server.ps1 start-rerank-server.ps1 \
           register-scheduled-tasks.ps1; do
    [ ! -f "$REPO/scripts/llm/$f" ] \
      || { echo "erwartet entfernt: $f"; false; }
  done
}

@test "Gemma laeuft als Linux-Loadout weiter, nicht im Windows-Autostart (T002459/T002551)" {
  # Positiv-Anker (T002356-M1): die gemma-Loadouts muessen im Linux-Stack
  # existieren, sonst hat die Migration nicht nur entfernt, sondern verloren.
  run node -e '
    const d = require("./scripts/llm/loadouts.json");
    const g = d.loadouts.filter(l => l.slug.startsWith("gemma-"));
    if (!g.length) process.exit(1);
    console.log(g.map(l => l.slug).join(","));
  '
  echo "Linux-Loadouts: $output"
  [ "$status" -eq 0 ]
}

# ── gpt-oss-20b als Factory-Kandidat (T002268) ────────────────────────
# Der Kandidat muss INERT bleiben, bis jemand bewusst umschaltet. Zwei
# Invarianten sichern das ab: priority 1 (Bonsai steht auf 0, route-provider.sh
# sortiert priority ASC) und KEIN Schreiben in tickets.factory_model_slots — das
# ist der Phase-Pin, den route-provider.sh gegenueber provider_config bevorzugt.

@test "start-gptoss-server.ps1 exists and serves port 8097 (T002268)" {
  [ -f "$REPO/scripts/llm/start-gptoss-server.ps1" ]
  run grep -qE '"--port",[[:space:]]*"8097"' "$REPO/scripts/llm/start-gptoss-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-gptoss-server.ps1 passes --jinja for tool_calls (T002268)" {
  # Ohne --jinja liefert llama-server keine strukturierten tool_calls - und genau
  # dafuer wurde dieser Kandidat ausgewaehlt (ifstruct-v1.0 91.95).
  run grep -q '"--jinja"' "$REPO/scripts/llm/start-gptoss-server.ps1"
  [ "$status" -eq 0 ]
}

@test "provider-register-gptoss.sh registers at priority 1, not 0 (T002268)" {
  [ -f "$REPO/scripts/factory/provider-register-gptoss.sh" ]
  run grep -qE '^PRIORITY=1$' "$REPO/scripts/factory/provider-register-gptoss.sh"
  [ "$status" -eq 0 ]
}

@test "provider-register-gptoss.sh does NOT write factory_model_slots (T002268)" {
  # Es wird auf echtes DML geprueft, nicht auf die bloesse Erwaehnung des
  # Tabellennamens: das Skript dokumentiert den Verzicht im Kommentar UND gibt
  # am Ende einen Hinweis aus, wo man bewusst umschalten wuerde. Beides soll
  # bleiben duerfen - nur ein INSERT/UPDATE/DELETE waere der Fehler.
  run bash -c "grep -iE '(INSERT INTO|UPDATE|DELETE FROM)[[:space:]]+tickets\.factory_model_slots' '$REPO/scripts/factory/provider-register-gptoss.sh'"
  [ "$status" -ne 0 ]
}

# ── Gemma-Chat-Server (T002277) ───────────────────────────────────────
# Das Skript lag bis 2026-07-27 unversioniert unter %UserProfile%\.lmstudio\.
# Die Guards sichern die drei Parameter, ohne die der Server fuer die Factory
# unbrauchbar waere - alle drei waren im Original bereits richtig gesetzt und
# sollen es beim Uebertragen ins Repo geblieben sein.

@test "start-gemma-server.ps1 exists and enables MTP speculative decoding (T002277)" {
  [ -f "$REPO/scripts/llm/start-gemma-server.ps1" ]
  run grep -qE '"--spec-type",[[:space:]]*"draft-mtp"' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
  run grep -q '\--spec-draft-model' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-gemma-server.ps1 defaults the context to 65536 (T002286/T002293)" {
  # Loest den -fitc-Floor aus T002277 ab. Die Schutzabsicht ist dieselbe - die
  # Factory fuellt 31-37k Tokens pro Prompt und braucht mehr als den llama.cpp-
  # Default -, nur strenger umgesetzt: ein fester -c kann gar nicht erst still
  # nach unten ausweichen, waehrend Auto-Fit je nach VRAM-Belegung variierte.
  # Seit T002293 ist -c ueber -Ctx parametrisierbar (Mehr-Agenten-Profil). Die
  # Absicht bleibt unveraendert, nur die Pruefstelle wandert: der DEFAULT muss
  # 65536 sein, und -c muss den Parameter benutzen statt eines Literals - sonst
  # koennte ein Aufrufer den Deckel setzen, ohne dass das Skript es zeigt.
  run grep -qE '\$Ctx[[:space:]]*=[[:space:]]*65536' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
  run grep -qE '"-c",[[:space:]]*"\$Ctx"' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-gemma-server.ps1 disables auto-fit (T002286)" {
  # "-fit on" zog den Kontext auf n_ctx_train (262144) hoch und band ~86 Prozent
  # davon ungenutzt als KV-Cache. Gemessen 2026-07-27: der feste Deckel gibt
  # 3094 MiB VRAM frei (15670 -> 12576 MiB belegt). Ohne "-fit off" wuerde das
  # gesetzte -c zwar gelten, aber die Absicht waere im Skript nicht mehr lesbar.
  run grep -qE '"-fit",[[:space:]]*"off"' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
  run bash -c "grep -E '\"-fit\",[[:space:]]*\"on\"' '$REPO/scripts/llm/start-gemma-server.ps1'"
  [ "$status" -ne 0 ]
}

@test "start-gemma-server.ps1 pairs -np > 1 with -kvu if it ever parallelises (T002286)" {
  # llama.cpp teilt -c stur durch -np, SOFERN nicht --kv-unified gesetzt ist.
  # Gemessen: "-c 8192 -np 4 -kvu" => n_ctx 8192 je Slot, mit "-no-kvu" => 2048.
  # Wer hier auf mehrere Slots umstellt, ohne -kvu zu setzen, viertelt den
  # Kontext lautlos unter den Factory-Bedarf.
  # Seit T002293 kommt -np aus dem Parameter $Slots. Beide Formen bleiben
  # zulaessig, die Absicht wird in beiden geprueft:
  #   a) Literal ("-np", "N")      -> N > 1 verlangt ein unbedingtes "-kvu"
  #   b) Parameter ("-np", "$Slots") -> Default muss 1 sein UND es muss einen
  #      Zweig geben, der -kvu bei > 1 dazuschaltet.
  # Der Wert steht in Anfuehrungszeichen ("-np", "1"), daher tr statt Anker-Regex.
  gemma="$REPO/scripts/llm/start-gemma-server.ps1"
  np="$(grep -oE '"-np",[[:space:]]*"[0-9]+"' "$gemma" | tr -dc '0-9')"
  if [ -n "$np" ]; then
    if [ "$np" -gt 1 ]; then
      run grep -q '"-kvu"' "$gemma"
      [ "$status" -eq 0 ]
    fi
  else
    run grep -qE '"-np",[[:space:]]*"\$Slots"' "$gemma"
    [ "$status" -eq 0 ]
    run grep -qE '\$Slots[[:space:]]*=[[:space:]]*1' "$gemma"
    [ "$status" -eq 0 ]
    # Muss den tatsaechlichen Parameter-Append treffen, NICHT irgendeine Zeile,
    # die beides erwaehnt: die Statusausgabe des Skripts enthaelt ebenfalls
    # "$Slots -gt 1" und den Text "-kvu" und wuerde eine lose Regex erfuellen,
    # auch wenn der Zweig geloescht waere (beim Negativtest aufgefallen).
    run grep -qE 'if[[:space:]]*\([[:space:]]*\$Slots[[:space:]]*-gt[[:space:]]*1[[:space:]]*\)[[:space:]]*\{[[:space:]]*\$Params[[:space:]]*\+=[[:space:]]*"-kvu"' "$gemma"
    [ "$status" -eq 0 ]
  fi
}

@test "start-gemma-server.ps1 keeps :8091 multimodal via --mmproj (T002296)" {
  # Gemma 4 12B kann Bild UND Audio, aber nur mit geladenem mmproj-Tower. Ohne
  # ihn startet der Server klaglos als reines Textmodell - /props meldet dann
  # vision:false/audio:false, und auffallen wuerde es erst, wenn ein Client ein
  # Bild schickt und eine hilflose Textantwort bekommt. Genau das ist zwischen
  # T002293 und T002296 passiert: der Live-Server hatte den Tower, das Skript
  # nicht, und der erste Start ueber das Skript hat ihn lautlos entfernt.
  gemma="$REPO/scripts/llm/start-gemma-server.ps1"
  run grep -qE '\$Mmproj[[:space:]]*=[[:space:]]*Join-Path' "$gemma"
  [ "$status" -eq 0 ]
  # Der Append muss an der Bedingung haengen, nicht irgendwo im Text stehen.
  run grep -qE '\$Params[[:space:]]*\+=[[:space:]]*@\("--mmproj",[[:space:]]*\$Mmproj\)' "$gemma"
  [ "$status" -eq 0 ]
  # Und ein fehlender Tower darf nicht still durchrutschen.
  run grep -qE 'mmproj not found' "$gemma"
  [ "$status" -eq 0 ]
}

@test "start-gemma-server.ps1 pairs quantised KV with -fa on (T002296)" {
  # Harte llama.cpp-Kopplung, kein Stilfrage: mit "-fa off" bricht der Start ab
  # mit "llama_init_from_model: V cache quantization requires flash_attn".
  # Nur f16 laedt ohne. Der Default "-fa auto" waehlt hier zwar faktisch "on",
  # ist aber hardwareabhaengig und wird von /props NICHT exponiert - es gibt
  # also keine Laufzeitpruefung, die den Fehler nachtraeglich sichtbar machte.
  gemma="$REPO/scripts/llm/start-gemma-server.ps1"
  kv="$(grep -oE '\$KvType[[:space:]]*=[[:space:]]*"[a-z0-9_]+"' "$gemma" | head -1 | sed -E 's/.*"([a-z0-9_]+)"/\1/')"
  [ -n "$kv" ]
  if [ "$kv" != "f16" ]; then
    run grep -qE '"-fa",[[:space:]]*"on"' "$gemma"
    [ "$status" -eq 0 ]
  fi
}

# Kein eigener Start-Job-Guard fuer start-gemma-server.ps1: der Test
# "no scripts/llm/*.ps1 starts a server via Start-Job (T002276)" oben deckt
# jedes Skript im Verzeichnis ab, auch neu hinzugekommene.

# ── -NoWait-Schalter (T002339) ──────────────────────────────────────
# Alle drei Startskripte sollen einen -NoWait-Schalter anbieten, der Health-Poll
# und Hinweistext ueberspringt. CRLF-Toleranz wie die -ngl-Guards (T002337):
# [[:space:]]*$ statt $, weil .ps1-Dateien durchgehend CRLF sind.

@test "every scripts/llm/start-*.ps1 has a NoWait switch (T002339)" {
  missing=""
  for f in "$REPO"/scripts/llm/start-*.ps1; do
    grep -qE '\[switch\]\$NoWait[[:space:]]*$' "$f" || missing="$missing $(basename "$f")"
  done
  [ -z "$missing" ] || { echo "ohne -NoWait:$missing"; false; }
}

@test "every scripts/llm/start-*.ps1 wraps health-poll/text in if (-not \$NoWait) (T002339)" {
  missing=""
  for f in "$REPO"/scripts/llm/start-*.ps1; do
    grep -qE 'if[[:space:]]*\([[:space:]]*-not[[:space:]]+\$NoWait[[:space:]]*\)' "$f" || missing="$missing $(basename "$f")"
  done
  [ -z "$missing" ] || { echo "ohne -NoWait-Guard:$missing"; false; }
}

# ── Watchdog entfaellt (T002551) ─────────────────────────────────────
# Der T002335-Watchdog haelt die Windows-Server am Leben (Start-Process,
# localhost:PORT/health-Poll, Write-WatchdogLog). Seit die bge-Server als
# Kubernetes-Deployments laufen (k3d/llm-gpu.yaml), uebernimmt das der Cluster:
# Readiness-Probe, Deployment-Rollout und der kubelet-Container-Neustart
# ersetzen Poll-Loop und Start-Process. Damit entfaellt auch die Frage nach
# einem zweiten Chat-Modell im Windows-Autostart — es gibt keinen Autostart
# mehr, Gemma laeuft als Linux-Loadout.
