#!/usr/bin/env bats
# tests/spec/llm-pipeline/bge-thread-quota.bats [T002661]
#
# PRÜFMODUS: Output-Verifikation. Die Assertions laufen gegen den gerenderten
# Kustomize-Build von `k3d/` — also gegen das Artefakt, das Flux tatsächlich
# anwendet — nicht per grep gegen den Manifest-Quelltext. Ein Patch in einem
# Overlay, der `-t` wieder entfernt, fällt damit auf; ein Quelltext-grep würde
# ihn übersehen.
#
# HINTERGRUND: k3d/llm-gpu.yaml setzte für beide llama.cpp-Container kein `-t`.
# llama.cpp wählt dann nproc — im Container 8, während limits.cpu 2000m nur
# 2 Kerne Quota gibt. Gemessen an bge-embed auf pk-hetzner-4 am 2026-08-04:
# 5003 von 9172 Scheduling-Perioden gedrosselt (54,5 %), throttled_usec 2028 s
# gegen usage_usec 1181 s — der Container wurde länger gedrosselt als er
# rechnete. Folge: 10,7 s für ein Embedding von 13 Tokens.
#
# Bei llama.cpp ist Oversubscription überproportional teuer, weil alle Threads
# an jeder Layer-Barriere synchronisieren: ist die Quota einer 100-ms-Periode
# aufgebraucht, friert der Kernel alle Threads bis zum Periodenende ein.

setup_file() {
  export REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export RENDERED="${BATS_FILE_TMPDIR}/k3d-rendered.yaml"
  kubectl kustomize "${REPO_ROOT}/k3d" >"${RENDERED}" 2>/dev/null || true
}

# Gibt die args des llama-cpp-Containers eines Deployments als Zeilen aus.
_llama_args() {
  yq eval-all "select(.kind == \"Deployment\" and .metadata.name == \"$1\")
    | .spec.template.spec.containers[]
    | select(.name == \"llama-cpp\")
    | .args[]" "${RENDERED}" 2>/dev/null
}

# Gibt limits.cpu des llama-cpp-Containers aus (z.B. '2000m' oder '2').
_llama_cpu_limit() {
  yq eval-all "select(.kind == \"Deployment\" and .metadata.name == \"$1\")
    | .spec.template.spec.containers[]
    | select(.name == \"llama-cpp\")
    | .resources.limits.cpu" "${RENDERED}" 2>/dev/null
}

# '2000m' -> 2 ; '2' -> 2 ; '1500m' -> 1 (abgerundet, mindestens 1)
_cpu_to_cores() {
  local raw="$1" cores
  if [[ "$raw" == *m ]]; then
    cores=$(( ${raw%m} / 1000 ))
  else
    cores="${raw%%.*}"
  fi
  [ "$cores" -ge 1 ] 2>/dev/null || cores=1
  echo "$cores"
}

# Wert des -t-Flags aus einer args-Liste (die Zeile nach '-t').
_thread_flag() {
  printf '%s\n' "$1" | grep -A1 '^-t$' | tail -n1
}

@test "bge-embed: -t ist gesetzt und überschreitet die CPU-Quota nicht" {
  local args limit cores threads
  args="$(_llama_args bge-embed)"

  # Positiv-Anker [T002356-M1]: ohne ihn bestünde der Test vakuos, sobald der
  # Build fehlschlägt oder der Container umbenannt wird — die Kandidatenliste
  # wäre leer und jede Aussage über sie trivial wahr.
  [ -n "$args" ]
  printf '%s\n' "$args" | grep -qx -- '--embeddings'

  limit="$(_llama_cpu_limit bge-embed)"
  [ -n "$limit" ] && [ "$limit" != "null" ]
  cores="$(_cpu_to_cores "$limit")"

  printf '%s\n' "$args" | grep -qx -- '-t'
  threads="$(_thread_flag "$args")"
  [ -n "$threads" ]
  [ "$threads" -ge 1 ]
  [ "$threads" -le "$cores" ]
}

@test "bge-rerank: -t ist gesetzt und überschreitet die CPU-Quota nicht" {
  local args limit cores threads
  args="$(_llama_args bge-rerank)"

  [ -n "$args" ]
  printf '%s\n' "$args" | grep -qx -- '--reranking'

  limit="$(_llama_cpu_limit bge-rerank)"
  [ -n "$limit" ] && [ "$limit" != "null" ]
  cores="$(_cpu_to_cores "$limit")"

  printf '%s\n' "$args" | grep -qx -- '-t'
  threads="$(_thread_flag "$args")"
  [ -n "$threads" ]
  [ "$threads" -ge 1 ]
  [ "$threads" -le "$cores" ]
}

@test "bge-thread-quota: der laufende bge-embed-Pod trägt -t in seinen args" {
  if ! kubectl --context "${BGE_CTX:-fleet}" get deploy bge-embed \
      -n "${BGE_NS:-workspace}" -o name >/dev/null 2>&1; then
    skip "kein fleet-Cluster erreichbar (offline/CI)"
  fi
  local args
  args="$(kubectl --context "${BGE_CTX:-fleet}" get deploy bge-embed \
    -n "${BGE_NS:-workspace}" \
    -o jsonpath='{.spec.template.spec.containers[?(@.name=="llama-cpp")].args}' 2>/dev/null)"

  # Positiv-Anker: erst belegen, dass wir echte args gelesen haben.
  [ -n "$args" ]
  [[ "$args" == *"--embeddings"* ]]

  [[ "$args" == *'"-t"'* ]]
}
