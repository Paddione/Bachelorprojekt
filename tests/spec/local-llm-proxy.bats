#!/usr/bin/env bats
# tests/spec/local-llm-proxy.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Konvention: eine .bats-Datei pro OpenSpec-SSOT-Spec.

PROXY_MOD="scripts/llm-proxy/server.mjs"
ROUTE="scripts/factory/route-provider.sh"

# Minimaler OpenAI-kompatibler Stub: $1=port $2=label $3=modelId
_start_stub() {
  local port="$1" label="$2" model="$3"
  node -e '
    const [port,label,model]=process.argv.slice(1);
    require("http").createServer((req,res)=>{
      let b=""; req.on("data",c=>b+=c); req.on("end",()=>{
        res.setHeader("content-type","application/json");
        if(req.url.startsWith("/v1/models"))
          return res.end(JSON.stringify({object:"list",data:[{id:model,object:"model"}]}));
        if(req.url.startsWith("/v1/chat/completions")){
          const m=(JSON.parse(b||"{}").model)||null;
          return res.end(JSON.stringify({backend:label,served:model,requested:m,
            choices:[{message:{role:"assistant",content:"ok"}}]}));
        }
        res.statusCode=404; res.end("{}");
      });
    }).listen(Number(port),"127.0.0.1");
  ' "$port" "$label" "$model" &
  echo $!
}

_free_port() { node -e 'const s=require("net").createServer();s.listen(0,()=>{console.log(s.address().port);s.close();})'; }

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  PORT_A="$(_free_port)"; PORT_B="$(_free_port)"; PROXY_PORT="$(_free_port)"
  PID_A="$(_start_stub "$PORT_A" backendA m1)"
  PID_B="$(_start_stub "$PORT_B" backendB m2)"
  # Registry-Override: der Proxy liest im Testmodus die Backends aus LLM_PROXY_BACKENDS_JSON
  # statt aus der DB (fail-closed auf DB, wenn Env fehlt — im Test immer gesetzt).
  export LLM_PROXY_PORT="$PROXY_PORT"
  export LLM_PROXY_BACKENDS_JSON="[
    {\"name\":\"a\",\"kind\":\"llamacpp\",\"baseUrl\":\"http://127.0.0.1:${PORT_A}/v1\",\"enabled\":true,\"priority\":1,\"fixups\":[],\"modelAliases\":{}},
    {\"name\":\"b\",\"kind\":\"lmstudio\",\"baseUrl\":\"http://127.0.0.1:${PORT_B}/v1\",\"enabled\":true,\"priority\":2,\"fixups\":[],\"modelAliases\":{}}]"
  PROXY_PID=""
}

teardown() {
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true
  kill "$PID_A" "$PID_B" 2>/dev/null || true
}

_start_proxy() {
  node "${REPO_ROOT}/${PROXY_MOD}" & PROXY_PID=$!
  for _ in $(seq 1 40); do
    curl -sf "http://127.0.0.1:${PROXY_PORT}/health" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  return 1
}

# Skip if no shared-db pod is reachable (offline / CI without cluster).
_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db,shared-db-dev)' -o name 2>/dev/null | head -1) || true
  if [[ -z "$_pod" ]]; then
    skip "no shared-db pod reachable (offline/CI)"
  fi
}

@test "GET /v1/models aggregiert beide Backends (m1 + m2)" {
  _start_proxy
  run curl -sf "http://127.0.0.1:${PROXY_PORT}/v1/models"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"m1"'
  echo "$output" | grep -q '"m2"'
}

@test "Routing: exakte ID m2 -> Backend b via x-llm-proxy-backend" {
  _start_proxy
  run curl -sf -D - -o /dev/null \
    -H 'content-type: application/json' -d '{"model":"m2","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi 'x-llm-proxy-backend: b'
  echo "$output" | grep -qi 'x-llm-proxy-served-model: m2'
}

@test "Stale ID -> Verfuegbarkeits-Fallback + x-llm-proxy-served-model" {
  _start_proxy
  run curl -sf -D - -o /dev/null \
    -H 'content-type: application/json' -d '{"model":"does-not-exist","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$status" -eq 0 ]
  # hoechstpriores gesundes Backend ist a (prio 1) -> m1
  echo "$output" | grep -qi 'x-llm-proxy-served-model: m1'
}

@test "Alle Backends down -> 503 mit error.code no_backend" {
  kill "$PID_A" "$PID_B" 2>/dev/null; sleep 0.3
  _start_proxy
  run curl -s -o /tmp/llmproxy_body -w '%{http_code}' \
    -H 'content-type: application/json' -d '{"model":"m1","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$output" = "503" ]
  grep -q '"no_backend"' /tmp/llmproxy_body
}

@test "route-provider.sh factory-implement sonnet -> baseUrl :18235 (kein :8093)" {
  _skip_if_no_db
  run bash "${REPO_ROOT}/${ROUTE}" factory-implement sonnet
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"baseUrl":"http://127.0.0.1:18235"'
  ! echo "$output" | grep -q ':8093'
}
