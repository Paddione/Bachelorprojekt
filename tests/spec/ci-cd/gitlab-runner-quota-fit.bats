#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-quota-fit.bats — concurrent passt in die Quota [T012647]
# SSOT: openspec/specs/ci-cd.md
#
# PRUEFMODUS: Rechnung ueber Werte aus zwei Repo-Dateien. Ausnahme nach CLAUDE.md
# §Test-Resultats-Konvention [T002448-M4] fuer Deploy-Konfiguration — die Wirkung zeigt
# sich erst, wenn der Runner unter Vollast Jobs wechselt.
#
# Hintergrund: Die Herleitung in namespace.yaml bemass die Quota fuer den Zustand, in dem
# N Jobs LAUFEN. Beim Wechsel existieren kurz N+1 Pods — der alte zaehlt im Zustand
# Terminating weiter zur Quota, waehrend der naechste angefordert wird. Bei concurrent=4
# fehlten dafuer 300m; die Ablehnung ist kein Warten, sondern ein sofortiger system
# failure. In Pipeline 2771092581 scheiterten daran alle 10 Jobs.
#
# Der Test rechnet deshalb mit N+1, nicht mit N. Er prueft die Vertraeglichkeit zweier
# Dateien, die niemand gemeinsam im Blick hat: wer concurrent in values/ erhoeht, sieht
# die Quota in namespace.yaml nicht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  VALUES="${REPO_ROOT}/k3d/gitlab-runner-stack/values/gitlab-runner.yaml"
  NS="${REPO_ROOT}/k3d/gitlab-runner-stack/namespace.yaml"

  CONCURRENT="$(grep -E '^concurrent: [0-9]+' "$VALUES" | grep -oE '[0-9]+$')"
  QUOTA_CPU="$(grep -E '^\s*requests\.cpu: "[0-9]+"' "$NS" | grep -oE '[0-9]+' | head -1)"
  # defaultRequest.cpu steht als erster cpu-Wert im LimitRange-Block.
  DEFREQ="$(awk '/defaultRequest:/{f=1;next} f&&/cpu:/{print;exit}' "$NS" | grep -oE '[0-9]+')"
}

@test "T012647: die Rechengroessen sind in beiden Dateien auffindbar" {
  # Positiv-Anker fuer alle folgenden Tests: ohne ihn wuerden leere Variablen
  # die Vergleiche unten stillschweigend bestehen lassen.
  [ -n "$CONCURRENT" ]
  [ -n "$QUOTA_CPU" ]
  [ -n "$DEFREQ" ]
  [ "$CONCURRENT" -gt 0 ]
  [ "$DEFREQ" -gt 0 ]
}

@test "T012647: concurrent+1 Job-Pods passen in requests.cpu der Quota" {
  # Basislast im Namespace, aus der Herleitung in namespace.yaml:
  # Runner-Manager 200m + registry-cache 100m.
  local basis=300
  local quota_m=$(( QUOTA_CPU * 1000 ))
  # Ein Job-Pod = 2 Container (build + helper), je defaultRequest.
  local pro_pod=$(( DEFREQ * 2 ))
  # N+1: waehrend eines Wechsels haelt der terminierende Pod seine Requests noch.
  local benoetigt=$(( (CONCURRENT + 1) * pro_pod + basis ))

  [ "$benoetigt" -le "$quota_m" ]
}

@test "T012647: die Quota ist nicht unnoetig gross fuer concurrent" {
  # Gegenrichtung: waere die Quota so gross, dass concurrent+3 Pods hineinpassen,
  # koennte concurrent hoeher stehen — dann ist einer der beiden Werte veraltet.
  # Der Test faengt damit den Fall ab, dass jemand die Quota anhebt und vergisst,
  # concurrent nachzuziehen (der Durchsatz laege dann brach).
  local basis=300
  local quota_m=$(( QUOTA_CPU * 1000 ))
  local pro_pod=$(( DEFREQ * 2 ))
  local grosszuegig=$(( (CONCURRENT + 3) * pro_pod + basis ))

  [ "$grosszuegig" -gt "$quota_m" ]
}
