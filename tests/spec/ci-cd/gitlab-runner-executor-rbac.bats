#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-executor-rbac.bats — Rechteumfang der Runner-Role [T012637]
# SSOT: openspec/specs/ci-cd.md
#
# PRUEFMODUS: Quelltext-Inspektion des gerenderten Manifests. Ausnahme nach
# CLAUDE.md §Test-Resultats-Konvention [T002448-M4] fuer Deploy-Konfiguration: die Wirkung
# einer RBAC-Regel zeigt sich erst beim Job-Start im Cluster, lokal gibt es dazu keinen
# ausfuehrbaren Output. Der Nachbar gitlab-runner-fleet-rbac.bats prueft die Form der Role
# (namespaced, kein ClusterRole); diese Datei prueft ihren UMFANG in beide Richtungen.
#
# Hintergrund: Die Role trug bis T012637 nur pods, pods/log und secrets ohne update. Jeder
# Job scheiterte an "cannot update resource secrets" beim Setzen der ownerReferences —
# sichtbar erst, nachdem T012634 die vorgelagerte PodSecurity-Ablehnung behoben hatte.
# Zwei Fehlerrichtungen sind moeglich und beide teuer: zu wenig Rechte laesst jeden Job
# scheitern, zu viele (namespaces create/delete) heben die Namespace-Beschraenkung aus,
# auf der die Absicherung des Runners beruht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDERED="${REPO_ROOT}/k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml"
  VALUES="${REPO_ROOT}/k3d/gitlab-runner-stack/values/gitlab-runner.yaml"
}

@test "T012637: die Role deckt ab, was der Kubernetes-Executor zum Job-Start braucht" {
  [ -f "$RENDERED" ]

  # secrets/update — daran scheiterte jeder Job (ownerReferences auf dem Job-Secret).
  run grep -E '"get","list","create","update","delete"' "$RENDERED"
  [ "$status" -eq 0 ]

  # exec/attach — der Executor fuehrt die Build-Schritte im Job-Pod aus.
  run grep -F 'resources: ["pods/exec"]' "$RENDERED"
  [ "$status" -eq 0 ]
  run grep -F 'resources: ["pods/attach"]' "$RENDERED"
  [ "$status" -eq 0 ]
}

@test "T012637: die Role greift nicht ueber den eigenen Namespace hinaus" {
  # Positiv-Anker zuerst: die Regelliste ist ueberhaupt vorhanden und erweitert.
  # Ohne ihn bestuende der Negativtest unten auch bei leerer oder fehlender Datei.
  run grep -F 'resources: ["pods/exec"]' "$RENDERED"
  [ "$status" -eq 0 ]

  # namespaces create/delete steht in der Doku-Tabelle, ist hier aber bewusst
  # ausgelassen: es waere ein clusterweiter Rechteausbau und stuende gegen
  # clusterWideAccess=false. Wer es braucht, ergaenzt es begruendet.
  run grep -F 'resources: ["namespaces"]' "$RENDERED"
  [ "$status" -ne 0 ]

  # Gegenprobe in der Quelle, damit ein Re-Render die Auslassung nicht still kippt.
  run grep -F '"namespaces"' "$VALUES"
  [ "$status" -ne 0 ]
}
