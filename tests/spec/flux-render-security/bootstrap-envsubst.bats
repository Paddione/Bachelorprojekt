#!/usr/bin/env bats
# tests/spec/flux-render-security/bootstrap-envsubst.bats — Platzhalter-Deckung im Bootstrap [T002869]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation).
# Begruendung: Geprueft wird das Zusammenspiel zweier Repo-Dateien — welche Platzhalter in
# flux/clusters/fleet/bootstrap/ stehen und welche der flux:bootstrap-Task an envsubst
# uebergibt. Der Effekt zeigt sich erst beim Apply gegen einen echten Cluster; lokal gibt es
# dazu keinen Laufzeit-Output. Ausnahme nach CLAUDE.md §Test-Resultats-Konvention [T002448-M4]
# fuer CI- und Deploy-Konfiguration.
#
# Hintergrund: Ein ${VAR} ohne envsubst-Deckung wird woertlich ins Cluster appliziert. Die
# Ressource existiert dann, meldet READY=True — und wirkt nicht. Beobachtet am 2026-08-09:
# die IngressRoute flux-webhook trug woertlich Host(`${FLUX_WEBHOOK_HOST}`) und verwies auf
# ein TLS-Secret namens ${TLS_SECRET_NAME}. Traefik matchte nie, der Webhook war tot, und
# jeder Merge wartete bis zu 10 Minuten auf das Poll-Intervall.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  BOOTSTRAP_DIR="${REPO_ROOT}/flux/clusters/fleet/bootstrap"
  TASKFILE="${REPO_ROOT}/Taskfile.yml"
}

# Alle distinct ${VAR}-Namen aus den Bootstrap-Manifesten.
_placeholders() {
  grep -rhoE '\$\{[A-Z_][A-Z0-9_]*\}' "$BOOTSTRAP_DIR" 2>/dev/null \
    | tr -d '${}' | sort -u
  return 0
}

# Der flux:bootstrap-Task als Textblock: ab der Task-Zeile bis zum naechsten Task
# gleicher Einrueckung. Kein festes grep -A<n> — ein starres Fenster wandert bei
# Aenderungen in den Folge-Task (Lehre aus T002503).
_bootstrap_task() {
  awk '/^  flux:bootstrap:/{f=1}
       f && /^  [a-z][a-z0-9:_-]*:$/ && !/^  flux:bootstrap:/{exit}
       f{print}' "$TASKFILE"
  return 0
}

@test "bootstrap-envsubst: jeder Platzhalter wird an envsubst uebergeben" {
  [ -d "$BOOTSTRAP_DIR" ]

  # Positiv-Anker [T002356-M1]: es gibt ueberhaupt Platzhalter im Bootstrap.
  # Ohne ihn waere die Aussage bei leerer Kandidatenmenge trivial erfuellt.
  run _placeholders
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Zweiter Anker: der flux:bootstrap-Task ist auffindbar und ruft envsubst auf.
  task_text="$(_bootstrap_task)"
  [ -n "$task_text" ]
  echo "$task_text" | grep -q 'envsubst'

  # Eigentliche Aussage: kein Platzhalter bleibt ungedeckt. Gedeckt ist er, wenn sein Name
  # im Task vorkommt — entweder in einer envsubst-Variablenliste oder als vorher gesetztes
  # export. Die Meldung nennt die Fundstelle, damit der Befund ohne Nachforschung handhabbar ist.
  uncovered=""
  while read -r var; do
    [ -n "$var" ] || continue
    echo "$task_text" | grep -q "$var" || uncovered="${uncovered} ${var}"
  done < <(_placeholders)

  if [ -n "$uncovered" ]; then
    echo "Platzhalter in ${BOOTSTRAP_DIR#$REPO_ROOT/} ohne Deckung im flux:bootstrap-Task:${uncovered}" >&2
    echo "Folge: sie werden woertlich ins Cluster appliziert — Ressource existiert, wirkt aber nicht." >&2
    return 1
  fi
}

@test "bootstrap-envsubst: die Webhook-IngressRoute referenziert ein eigenes TLS-Secret" {
  IR="${BOOTSTRAP_DIR}/ingressroute-flux-webhook.yaml"
  [ -f "$IR" ]

  # Positiv-Anker: die Datei traegt ueberhaupt einen tls-Block mit secretName.
  grep -q 'secretName:' "$IR"

  # Eigentliche Aussage: das Secret ist fest benannt und liegt damit in flux-system,
  # statt ueber ${TLS_SECRET_NAME} auf ein Secret eines anderen Namespace zu zeigen,
  # das dort gar nicht existiert.
  grep -q 'secretName:[[:space:]]*flux-webhook-tls' "$IR"
  ! grep -q 'secretName:[[:space:]]*\${TLS_SECRET_NAME}' "$IR"
}

@test "bootstrap-envsubst: ein Certificate fuer den Webhook-Host ist deklariert" {
  CERT="${BOOTSTRAP_DIR}/certificate-flux-webhook.yaml"

  # Positiv-Anker: im Repo wird cert-manager ueberhaupt verwendet — sonst waere die
  # Forderung nach einem Certificate gegenstandslos.
  run bash -c "grep -rl 'kind: Certificate' '${REPO_ROOT}/prod' '${REPO_ROOT}/flux' 2>/dev/null | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Eigentliche Aussage: es gibt ein Certificate, das flux-webhook-tls erzeugt.
  [ -f "$CERT" ]
  grep -q 'kind: Certificate' "$CERT"
  grep -q 'secretName:[[:space:]]*flux-webhook-tls' "$CERT"
  grep -q 'flux-webhook\.' "$CERT"
}
