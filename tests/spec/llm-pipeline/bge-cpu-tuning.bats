#!/usr/bin/env bats
#
# T002572 / k8s-CPU-Tuning: bge-embed und bge-rerank bekommen einen
# llama.cpp-Thread-Parameter `-t <threads>` und ein auf 4000m angehobenes
# resources.limits.cpu (requests.cpu bleibt 1000m).
#
# PRUEFMODUS: Source-Grep auf dem deklarativen Manifest via yq (bewusst,
# Ausnahme nach T002448-M4). Geprueft wird eine reine Manifest-Aussage in
# k3d/llm-gpu.yaml (Multi-Doc-YAML). Ein Laufzeit-Aufruf der Deployments
# wuerde einen Cluster mit GPU/CPU-Nodes voraussetzen und waere in CI nicht
# deterministisch. Jeder Negativtest traegt einen Positiv-Anker im selben
# @test-Block (T002356-M1). Eigene Datei statt Append an
# tests/spec/llm-pipeline.bats (T002416 own-file convention).
#
# Extraktion: yq v4.53.2 (eval-all, Alias `ea`) fuer Multi-Doc-YAML; Selektion
# ueber select(.kind == "Deployment" and .metadata.name == ...). Der Literal
# "4000m" wird NIE per grep gesucht (Plan-Verbot) — nur ueber yq-Feldzugriff.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MANIFEST="${REPO_ROOT}/k3d/llm-gpu.yaml"
}

# Extrahiert den Wert hinter dem `-t`-Flag des llama-cpp-Containers im
# Deployment $1. Gibt nichts aus, wenn kein `-t` vorhanden ist.
get_t_value() {
  local dep="$1"
  run yq ea \
    "select(.kind == \"Deployment\" and .metadata.name == \"${dep}\") \
     | .spec.template.spec.containers[] | select(.name == \"llama-cpp\") \
     | .args[]" "$MANIFEST"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | awk '$0=="-t"{getline; print; exit}'
}

@test "bge-cpu-tuning: beide Deployments tragen ein -t-Flag mit positivem Integer" {
  [ -f "$MANIFEST" ]

  # Positiv-Anker: das -t-Flag muss in den args beider llama-cpp-Container
  # vorhanden sein. Ohne den Fix ist es nicht gesetzt und dieser Block rot.
  for dep in bge-embed bge-rerank; do
    run yq ea \
      "select(.kind == \"Deployment\" and .metadata.name == \"${dep}\") \
       | .spec.template.spec.containers[] | select(.name == \"llama-cpp\") \
       | .args[]" "$MANIFEST"
    [ "$status" -eq 0 ]
    run grep -c '^-t$' <<<"$output"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
  done

  # Negativ-Aussage: der Wert hinter -t ist nicht leer und nicht "0".
  for dep in bge-embed bge-rerank; do
    t_value="$(get_t_value "$dep")"
    [ -n "$t_value" ]
    [ "$t_value" != "0" ]
  done
}

@test "bge-cpu-tuning: limits.cpu 4000m bei unveraendertem requests.cpu 1000m" {
  [ -f "$MANIFEST" ]

  # Positiv-Anker: requests.cpu bleibt in beiden Containern bei 1000m.
  # Erst wenn das belegt ist, wird limits.cpu auf 4000m geprueft.
  for dep in bge-embed bge-rerank; do
    run yq ea \
      "select(.kind == \"Deployment\" and .metadata.name == \"${dep}\") \
       | .spec.template.spec.containers[] | select(.name == \"llama-cpp\") \
       | .resources.requests.cpu" "$MANIFEST"
    [ "$status" -eq 0 ]
    [ "$output" = "1000m" ]
  done

  # Negativ-Aussage: limits.cpu ist auf 4000m angehoben (aktuell 2000m).
  for dep in bge-embed bge-rerank; do
    run yq ea \
      "select(.kind == \"Deployment\" and .metadata.name == \"${dep}\") \
       | .spec.template.spec.containers[] | select(.name == \"llama-cpp\") \
       | .resources.limits.cpu" "$MANIFEST"
    [ "$status" -eq 0 ]
    [ "$output" = "4000m" ]
  done
}

@test "bge-cpu-tuning: -t-Wert ueberschreitet nicht die kleinste Node-Core-Groesse" {
  # Plan Task 4, Gate G2: kleinste Ready-Node hat 4 Cores.
  MAX_T="4"

  [ -f "$MANIFEST" ]

  for dep in bge-embed bge-rerank; do
    t_value="$(get_t_value "$dep")"
    [ -n "$t_value" ]
    # Positiv-Anker: -t ist ein positiver Integer (nicht leer, nicht 0).
    [ "$t_value" != "0" ]
    # Negativ-Aussage: der Wert liegt innerhalb der kleinsten Node-Core-Groesse.
    [ "$t_value" -le "$MAX_T" ]
  done
}
