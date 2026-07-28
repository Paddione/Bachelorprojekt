#!/usr/bin/env bats
#
# T002426 — bge-dual-pair-failover
#
# Prueft die Artefakte der Partials p1 bis p5: das CPU-gebundene Batch-Paar
# (8085/8086), seine Autostart- und Watchdog-Abdeckung, den MCP-Shim samt
# Registry-Eintrag, die Environment-Variablen und die Cluster-Services.
#
# Konventionen (T002356-M1 / T002338-M2):
#   - Jeder Negativtest traegt seinen Positiv-Anker IM SELBEN Test, und zwar
#     zuerst. Ohne ihn besteht "X kommt nicht vor" vakuos, sobald die Datei
#     fehlt.
#   - Die .ps1-Dateien sind CRLF. Regex-Anker auf "$" matchen dort nicht;
#     "[[:space:]]*$" schliesst das \r mit ein.
#   - Es wird gegen Dateiinhalte geprueft, nicht gegen $output eines Skripts —
#     damit kann der Worktree-Name keinen Match erfuellen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  EMBED_BATCH="${REPO_ROOT}/scripts/llm/start-embed-batch-server.ps1"
  RERANK_BATCH="${REPO_ROOT}/scripts/llm/start-rerank-batch-server.ps1"
}

# ── p1: Batch-Paar auf dem Host ──────────────────────────────────────────────

@test "T002426: Batch-Embed-Server laeuft auf Port 8085 mit CLS-Pooling" {
  [ -f "$EMBED_BATCH" ]
  grep -qE '\$Port[[:space:]]*=[[:space:]]*8085' "$EMBED_BATCH"
  grep -qE -- '"--pooling",[[:space:]]*"cls"' "$EMBED_BATCH"
  grep -qE -- '"--embedding"' "$EMBED_BATCH"
}

@test "T002426: Batch-Rerank-Server laeuft auf Port 8086 im Rerank-Modus" {
  [ -f "$RERANK_BATCH" ]
  grep -qE '\$Port[[:space:]]*=[[:space:]]*8086' "$RERANK_BATCH"
  grep -qE -- '"--reranking"' "$RERANK_BATCH"
}

@test "T002426: -ngl 0 ist in beiden Batch-Skripten festgeschrieben, nicht ueberschreibbar" {
  # Positiv-Anker zuerst: das feste -ngl 0 muss ueberhaupt vorhanden sein.
  for f in "$EMBED_BATCH" "$RERANK_BATCH"; do
    [ -f "$f" ]
    grep -qE -- '"-ngl",[[:space:]]*"0"' "$f"
  done
  # Negativ-Aussage: keine Env-Override-Variable fuer ngl im Batch-Pfad.
  for f in "$EMBED_BATCH" "$RERANK_BATCH"; do
    run grep -cE '\$env:LLM_[A-Z_]*NGL' "$f"
    [ "$output" = "0" ]
  done
}

@test "T002426: Batch-Skripte setzen kein --fit (sie nehmen am VRAM-Wettbewerb nicht teil)" {
  # Positiv-Anker: die Batch-Skripte existieren und tragen ihren Flag-Satz.
  for f in "$EMBED_BATCH" "$RERANK_BATCH"; do
    [ -f "$f" ]
    grep -qE -- '"-ub",[[:space:]]*"8192"' "$f"
  done
  # Negativ-Aussage: weder --fit noch -fit tauchen auf.
  for f in "$EMBED_BATCH" "$RERANK_BATCH"; do
    run grep -cE -- '(--fit|"-fit")' "$f"
    [ "$output" = "0" ]
  done
}

@test "T002426: Scheduled-Task-Registrierung deckt beide Batch-Server ab" {
  local f="${REPO_ROOT}/scripts/llm/register-scheduled-tasks.ps1"
  [ -f "$f" ]
  grep -q 'start-embed-batch-server.ps1' "$f"
  grep -q 'start-rerank-batch-server.ps1' "$f"
  grep -qE 'Name[[:space:]]*=[[:space:]]*"LlamaEmbedBatchServer"' "$f"
  grep -qE 'Name[[:space:]]*=[[:space:]]*"LlamaRerankBatchServer"' "$f"
}

@test "T002426: Watchdog ueberwacht die Ports 8085 und 8086" {
  local f="${REPO_ROOT}/scripts/llm/watchdog-llm-servers.ps1"
  [ -f "$f" ]
  grep -qE 'Port[[:space:]]*=[[:space:]]*8085' "$f"
  grep -qE 'Port[[:space:]]*=[[:space:]]*8086' "$f"
  grep -q 'start-embed-batch-server.ps1' "$f"
  grep -q 'start-rerank-batch-server.ps1' "$f"
}

@test "T002426: loadouts.json fuehrt beide Batch-Server CPU-gebunden" {
  local f="${REPO_ROOT}/scripts/llm/loadouts.json"
  [ -f "$f" ]
  run node -e '
    const l = require(process.argv[1]).loadouts;
    const slugs = ["bge-embed-batch", "bge-rerank-batch"];
    for (const s of slugs) {
      const e = l.find((x) => x.slug === s);
      if (!e) throw new Error("missing loadout " + s);
      if (e.fit.enabled !== false) throw new Error(s + ": fit must be disabled");
      if (e.args.ngl !== 0) throw new Error(s + ": ngl must be 0");
      if (e.mcp.serversConfig !== null) throw new Error(s + ": mcp.serversConfig must be null");
      if (!e.notes) throw new Error(s + ": notes must explain the CPU binding");
    }
    const ports = slugs.map((s) => l.find((x) => x.slug === s).port).sort();
    if (ports.join(",") !== "8085,8086") throw new Error("ports are " + ports.join(","));
  ' "$f"
  [ "$status" -eq 0 ]
}

@test "T002426: runner.mjs bildet uiMcpProxy auf --ui-mcp-proxy ab" {
  local f="${REPO_ROOT}/scripts/llm-proxy/runner.mjs"
  [ -f "$f" ]
  grep -q 'uiMcpProxy' "$f"
  grep -q -- '--ui-mcp-proxy' "$f"
}

# ── p4: MCP-Shim ─────────────────────────────────────────────────────────────

@test "T002426: bge-MCP-Shim existiert, bindet auf 127.0.0.1 und verlangt einen Bearer-Token" {
  local f="${REPO_ROOT}/scripts/bge-mcp/server.mjs"
  [ -f "$f" ]
  grep -q "127.0.0.1" "$f"
  grep -qi 'bearer' "$f"
}

@test "T002426: der Shim haelt keine eigene Failover-Logik, sondern ruft den Router" {
  local f="${REPO_ROOT}/scripts/bge-mcp/server.mjs"
  # Positiv-Anker: beide Tools sind ueberhaupt vorhanden.
  [ -f "$f" ]
  grep -q 'bge_embed' "$f"
  grep -q 'bge_rerank' "$f"
  # Negativ-Aussage: kein zweiter Health-Check-Pfad im Shim.
  run grep -cE '/health' "$f"
  [ "$output" = "0" ]
}

@test "T002426: MCP-Registry fuehrt bge-mcp als HTTP-Server" {
  local f="${REPO_ROOT}/docs/agent-guide/registry/mcp.yaml"
  grep -qE '^  bge-mcp:' "$f"
  run sed -n '/^  bge-mcp:/,/^  [a-z0-9-]*:$/p' "$f"
  echo "$output" | grep -qE '^[[:space:]]+transport: http'
}

@test "T002426: mcp-servers.json (llama-stdio-Liste) nimmt den HTTP-Shim NICHT auf" {
  local f="${REPO_ROOT}/scripts/llm/mcp-servers.json"
  # Positiv-Anker: die Datei ist die erwartete stdio-Liste mit Bestandseintraegen.
  run node -e '
    const j = require(process.argv[1]);
    if (!j.mcpServers) throw new Error("no mcpServers key");
    if (!j.mcpServers["codebase-memory-mcp"]) throw new Error("stdio baseline entry missing");
    for (const [k, v] of Object.entries(j.mcpServers)) {
      if (!v.command) throw new Error(k + " has no command (not a stdio entry)");
    }
    if (j.mcpServers["bge-mcp"]) throw new Error("bge-mcp must not be registered here");
  ' "$f"
  [ "$status" -eq 0 ]
}

# ── p5: Environment und Cluster-Services ─────────────────────────────────────

@test "T002426: schema.yaml deklariert Batch-URLs und Ueberlast-Schwellen" {
  local f="${REPO_ROOT}/environments/schema.yaml"
  for v in LLM_EMBED_BATCH_URL LLM_RERANKER_BATCH_URL LLM_BGE_LATENCY_BUDGET_MS LLM_BGE_QUEUE_LIMIT; do
    grep -qE "^  - name: ${v}$" "$f"
  done
}

@test "T002426: alle sechs Environment-Dateien tragen die Batch-Paar-URLs" {
  for env in dev mentolder korczewski staging fleet-mentolder fleet-korczewski; do
    local f="${REPO_ROOT}/environments/${env}.yaml"
    [ -f "$f" ]
    grep -qE '^  LLM_EMBED_BATCH_URL:' "$f"
    grep -qE '^  LLM_RERANKER_BATCH_URL:' "$f"
  done
}

@test "T002426: keine Brand-Domain-Literale in den neuen Environment-Werten" {
  # Positiv-Anker: die Werte existieren und zeigen auf cluster-interne Namen.
  local hits=0
  for env in dev mentolder korczewski staging fleet-mentolder fleet-korczewski; do
    local f="${REPO_ROOT}/environments/${env}.yaml"
    grep -E '^  LLM_(EMBED|RERANKER)_BATCH_URL:' "$f" | grep -q 'svc.cluster.local'
    hits=$((hits + 1))
  done
  [ "$hits" -eq 6 ]
  # Negativ-Aussage: kein Klartext-Brand-Hostname in genau diesen Zeilen.
  for env in dev mentolder korczewski staging fleet-mentolder fleet-korczewski; do
    local f="${REPO_ROOT}/environments/${env}.yaml"
    run bash -c "grep -E '^  LLM_(EMBED|RERANKER)_BATCH_URL:' '$f' | grep -cE 'mentolder\.de|korczewski\.de'"
    [ "$output" = "0" ]
  done
}

@test "T002426: k3d/llm-gpu.yaml exponiert Gateway-Services fuer 8085 und 8086" {
  local f="${REPO_ROOT}/k3d/llm-gpu.yaml"
  grep -qE '^  name: llm-gateway-embed-batch$' "$f"
  grep -qE '^  name: llm-gateway-rerank-batch$' "$f"
  grep -qE '^      port: 8085$' "$f"
  grep -qE '^      port: 8086$' "$f"
}

# ── p2/p3: Router und HTTP-Endpunkte ─────────────────────────────────────────

@test "T002426: bge-router.ts trennt Health-Probe von Routing-Entscheidung" {
  local f="${REPO_ROOT}/website/src/lib/bge-router.ts"
  [ -f "$f" ]
  grep -q 'export async function probePair' "$f"
  grep -q 'export async function resolvePair' "$f"
  grep -q 'logger.warn' "$f"
}

@test "T002426: der Router fuehrt keine any-Typen ein (CQ02)" {
  local f="${REPO_ROOT}/website/src/lib/bge-router.ts"
  # Positiv-Anker: die llama-server-Antwortformen sind explizit typisiert.
  [ -f "$f" ]
  grep -qE 'interface Llama(Health|Embedding|Rerank)Response' "$f"
  # Negativ-Aussage: kein `any` als Typ.
  run grep -cE ':[[:space:]]*any\b|<any>|as any' "$f"
  [ "$output" = "0" ]
}

@test "T002426: Retrieval- und Change-Feed-Endpunkt rufen den Router statt eigener Ausweichlogik" {
  local r="${REPO_ROOT}/website/src/pages/api/bge/retrieve.ts"
  local c="${REPO_ROOT}/website/src/pages/api/bge/changes.ts"
  [ -f "$r" ]
  [ -f "$c" ]
  # Positiv-Anker: der Retrieval-Endpunkt bindet den Router ein.
  grep -q "bge-router" "$r"
  # Negativ-Aussage: keine eigene Health-Probe in den Endpunkten.
  for f in "$r" "$c"; do
    run grep -cE 'probePair\(' "$f"
    [ "$output" = "0" ]
  done
}

@test "T002426: Retrieval lehnt Cross-Space-Queries ab und antwortet 503 statt Leermenge" {
  local r="${REPO_ROOT}/website/src/pages/api/bge/retrieve.ts"
  [ -f "$r" ]
  grep -q 'MixedEmbeddingModelError' "$r"
  grep -q '503' "$r"
}
