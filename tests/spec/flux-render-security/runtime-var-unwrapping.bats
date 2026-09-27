#!/usr/bin/env bats
# tests/spec/flux-render-security/runtime-var-unwrapping.bats — $$-Unwrapping im Renderer [T012503]
#
# PRUEFMODUS: Output-Verifikation der Unwrapping-Stufe, plus eine Quelltext-Zusicherung fuer
# das Escaping in einer generierten Datei. Die zweite ist eine Ausnahme nach CLAUDE.md
# §Test-Resultats-Konvention [T002448-M4] fuer Deploy-Konfiguration: die gerenderte
# Helm-Ausgabe hat lokal keinen ausfuehrbaren Output, ihr Effekt zeigt sich erst im Cluster.
#
# Hintergrund: Der Renderer nimmt als $${VAR} markierte Laufzeit-Variablen aus der
# envsubst-Liste und unwrapped sie danach (T002306). Das Unwrapping deckte urspruenglich nur
# Variablennamen und { ab — nicht (, ! und ?. Wer ein ConfigMap-Skript vollstaendig escaped,
# bekam $$(seq 1 3) unveraendert ausgeliefert; in der Shell ist $$ die PID, das Skript brach
# mit "syntax error: unexpected (" ab. Der gitlab-runner lag deshalb ab bc80f246b im
# CrashLoop. Der Gegenfehler ist genauso teuer: nimmt man das Escaping weg, landen
# CONFIG_PATH_FOR_INIT und MAX_REGISTER_ATTEMPTS in der envsubst-Liste, werden zu "" und
# "mkdir -p" laeuft ohne Argument.
#
# Der Runner-Stack (k3d/gitlab-runner-stack/), den die gerenderten-Datei-Tests prueften, wurde
# mit T900650 entfernt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDER_SCRIPT="${REPO_ROOT}/scripts/flux-render-artifact.sh"
  UNWRAP='s/\$\$([a-zA-Z0-9_({!?])/$\1/g'
}

@test "T012503: der Renderer verwendet genau das hier gepruefte Unwrapping-Muster" {
  # Verhindert, dass dieser Test eine Kopie prueft, die vom Skript abgedriftet ist.
  run grep -cF "$UNWRAP" "$RENDER_SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

@test "T012503: \$\${VAR} wird zu \${VAR} — die bestehende Zusicherung aus T002306" {
  run sed -E "$UNWRAP" <<<'mkdir -p $${CONFIG_PATH_FOR_INIT}'
  [ "$status" -eq 0 ]
  [ "$output" = 'mkdir -p ${CONFIG_PATH_FOR_INIT}' ]
}

@test "T012503: \$\$VAR ohne Klammern wird zu \$VAR" {
  run sed -E "$UNWRAP" <<<'wait $$register_pid'
  [ "$status" -eq 0 ]
  [ "$output" = 'wait $register_pid' ]
}

@test "T012503: \$\$( wird zu \$( — sonst expandiert die Shell \$\$ zur PID" {
  run sed -E "$UNWRAP" <<<'for i in $$(seq 1 3); do'
  [ "$status" -eq 0 ]
  [ "$output" = 'for i in $(seq 1 3); do' ]
}

@test "T012503: \$\$! und \$\$? werden zu \$! und \$?" {
  run sed -E "$UNWRAP" <<<'register_pid=$$! ; retval=$$?'
  [ "$status" -eq 0 ]
  [ "$output" = 'register_pid=$! ; retval=$?' ]
}

@test "T012907: CronJob auth secrets survive fleet envsubst for runtime expansion" {
  local manifest
  for manifest in \
    k3d/cronjob-scheduled-publish.yaml \
    k3d/notify-unread-cronjob.yaml \
    k3d/error-log-retention-cronjob.yaml; do
    run grep -cF 'Bearer $${CRON_SECRET}' "${REPO_ROOT}/${manifest}"
    [ "$status" -eq 0 ]
    [ "$output" -eq 1 ]

    run bash -c "sed -E '$UNWRAP' '${REPO_ROOT}/${manifest}' | grep -cF 'Bearer \${CRON_SECRET}'"
    [ "$status" -eq 0 ]
    [ "$output" -eq 1 ]
  done
}
