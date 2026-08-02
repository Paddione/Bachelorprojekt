#!/usr/bin/env bats
#
# T002570 / Bug 3: scripts/index-repo.ts darf keine Referenzen auf den
# dekommissionierten Host-lokalen llama.cpp-Port :8095 mehr enthalten.
# Seit T002551 laeuft bge-m3 als Cluster-Service `llm-gateway-embed` auf :8081.
#
# PRUEFMODUS: Source-Grep (bewusst, Ausnahme nach T002448-M4).
# Geprueft wird eine reine Konstanten-/Kommentar-Aussage in einer TypeScript-
# Datei, deren Fallback-Zweig nur bei nicht erreichbarem LLM_EMBED_URL greift.
# Ein Laufzeit-Aufruf von resolveEmbedConfig() wuerde einen erreichbaren
# Embedding-Endpunkt bzw. dessen Abwesenheit voraussetzen und waere in CI
# nicht deterministisch. Jeder Negativtest traegt einen Positiv-Anker im
# selben @test-Block (T002356-M1).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  INDEX_REPO="${REPO_ROOT}/scripts/index-repo.ts"
}

@test "index-repo.ts: embed-Fallbacks zeigen auf :8081, nirgends mehr auf :8095" {
  [ -f "$INDEX_REPO" ]

  # Positiv-Anker: der korrigierte Zustand muss belegbar vorhanden sein.
  # Ohne den Fix ist :8081 nicht gesetzt und dieser Block wird rot.
  run grep -c "localhost:8081" "$INDEX_REPO"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  run grep -c "llm-gateway-embed.workspace.svc.cluster.local" "$INDEX_REPO"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  run grep -c '`http://${clusterHost}:8081`' "$INDEX_REPO"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Negativ-Aussage: kein einziges Vorkommen des toten Ports mehr — auch nicht
  # in Kommentaren (der Datei-Header beschrieb den Fallback bis T002570 falsch).
  run grep -n "8095" "$INDEX_REPO"
  [ "$status" -ne 0 ]
}

@test "index-repo.ts: resolveEmbedConfig bevorzugt LLM_EMBED_URL vor jedem Fallback" {
  [ -f "$INDEX_REPO" ]

  # Positiv-Anker: die Env-Var-Konvention (identisch zu website/src/lib/bge-router.ts)
  # muss die primaere Quelle bleiben.
  run grep -c "process.env.LLM_EMBED_URL" "$INDEX_REPO"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Der tote llm-router (Service existiert im Cluster nicht, T002570 Bug 1)
  # darf hier nicht als Embedding-Ziel auftauchen.
  run grep -n "llm-router.workspace.svc.cluster.local" "$INDEX_REPO"
  [ "$status" -ne 0 ]
}
