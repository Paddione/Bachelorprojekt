#!/usr/bin/env bats
# tests/spec/fleet-operations/cronjob-hygiene.bats
# SSOT: openspec/specs/fleet-operations.md
# Ticket: T900035 (Batch T900041)
#
# PRUEFMODUS: gemischt — Render-Output fuer die Ziel-URL (dort sitzt der
# Defekt in dem, was der Overlay emittiert), Quelltext fuer die
# Aufraeum-Felder der CronJob-Spec.
#
# Befund 1 (scheduled-publish): k3d/cronjob-scheduled-publish.yaml rief
# fest verdrahtet http://website.website-staging.svc.cluster.local/... auf.
# In PROD (workspace) und in korczewski zeigte der CronJob damit auf die
# STAGING-Website — Job endete in BackoffLimitExceeded. Jeder andere CronJob
# im Repo nutzt ${WEBSITE_NAMESPACE} (k3d/notify-unread-cronjob.yaml,
# k3d/cronjob-monthly-billing.yaml, k3d/error-log-retention-cronjob.yaml).
#
# Befund 2 (Diagnostik): der Container lief mit 'curl -sf' — silent+fail.
# Das Pod-Log blieb bei jedem Fehlschlag komplett leer, die Diagnose war blind.
#
# Befund 3 (tests-results-retention): 7 Fehl-Pods pro Lauf, aeltester 11d.
# Ohne ttlSecondsAfterFinished raeumt der Job-Controller die Pods nie ab.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SP="${REPO_ROOT}/k3d/cronjob-scheduled-publish.yaml"
  TR="${REPO_ROOT}/k3d/tests-retention-cronjob.yaml"
}

@test "T900035: scheduled-publish zielt auf die eigene Website-Namespace, nicht auf website-staging" {
  [ -f "$SP" ]

  # Positiv-Anker (T002356-M1): der curl-Aufruf existiert ueberhaupt.
  run grep -c 'api/cron/scheduled-publish' "$SP"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Der Guard: kein hartkodierter Fremd-Namespace in der Basis.
  local hardcoded
  hardcoded="$(grep -F 'website.website-staging.svc.cluster.local' "$SP" || true)"
  [ -z "$hardcoded" ] \
    || { echo "scheduled-publish zeigt fest auf website-staging: ${hardcoded}" >&2; return 1; }

  # ... sondern der Namespace kommt beim Render aus der Env-Registry, wie bei
  # jedem anderen CronJob (notify-unread, monthly-billing, error-log-retention).
  run grep -c 'website.${WEBSITE_NAMESPACE}.svc.cluster.local' "$SP"
  [ "$status" -eq 0 ] || { echo "scheduled-publish nutzt kein \${WEBSITE_NAMESPACE}" >&2; return 1; }
  [ "$output" -ge 1 ]

  # Gegenprobe zu T012907: der Token MUSS als Doppel-Dollar escaped bleiben.
  # Der Renderer nimmt so markierte Variablen aus der envsubst-Liste und
  # unwrapped sie danach, damit erst die Shell im Container sie aufloest.
  # Ein Fix, der hier auf einfaches $CRON_SECRET umstellt, laesst envsubst den
  # Token beim Render zu Leerstring ersetzen - der Job liefe dann ohne Auth.
  run grep -cF 'Bearer $${CRON_SECRET}' "$SP"
  [ "$status" -eq 0 ] || { echo "CRON_SECRET ist nicht mehr als \$\$ escaped (T012907)" >&2; return 1; }
  [ "$output" -eq 1 ]
}

@test "T900035: scheduled-publish macht Fehlschlaege im Log sichtbar" {
  [ -f "$SP" ]

  # 'curl -sf' schluckt Body UND Fehlermeldung: der Pod stirbt mit leerem Log.
  # Der Guard verlangt, dass der HTTP-Code ausgegeben wird, bevor der Job
  # fehlschlaegt — sonst ist der naechste Ausfall wieder nicht diagnostizierbar.
  run grep -c 'http_code' "$SP"
  [ "$status" -eq 0 ] || { echo "scheduled-publish gibt keinen HTTP-Code aus (blindes Log)" >&2; return 1; }
  [ "$output" -ge 1 ]
}

@test "T900035: beide CronJobs raeumen ihre Job-Pods ab" {
  local f
  for f in "$SP" "$TR"; do
    [ -f "$f" ]

    # Positiv-Anker: es ist ueberhaupt ein CronJob.
    run grep -c '^kind: CronJob' "$f"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]

    # ttlSecondsAfterFinished laesst den Job-Controller beendete Jobs samt
    # Pods loeschen. Ohne das Feld stapelten sich Fehl-Pods bis 11 Tage lang.
    run grep -c 'ttlSecondsAfterFinished:' "$f"
    [ "$status" -eq 0 ] || { echo "$(basename "$f"): kein ttlSecondsAfterFinished" >&2; return 1; }
    [ "$output" -ge 1 ]

    # failedJobsHistoryLimit begrenzt zusaetzlich die behaltene Historie.
    run grep -c 'failedJobsHistoryLimit:' "$f"
    [ "$status" -eq 0 ] || { echo "$(basename "$f"): kein failedJobsHistoryLimit" >&2; return 1; }
    [ "$output" -ge 1 ]
  done
}

@test "T900035: der korczewski-URL-Patch fuer scheduled-publish ist entbehrlich geworden" {
  # Der Patch existierte nur, weil die Basis auf einen festen Namespace zeigte.
  # Mit ${WEBSITE_NAMESPACE} in der Basis loest der Overlay-Render die URL
  # selbst korrekt auf — ein zusaetzlicher Patch mit hartkodiertem Host waere
  # wieder genau die Drift-Quelle, die den Bug erzeugt hat.
  local p="${REPO_ROOT}/prod-korczewski/patch-cronjob-urls.yaml"
  [ -f "$p" ]

  # Positiv-Anker: die Datei patcht weiterhin andere CronJobs.
  run grep -c 'kind: CronJob' "$p"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  local leftover
  leftover="$(awk '/name: scheduled-publish/,0' "$p" | grep -F 'website.website-korczewski.svc.cluster.local' || true)"
  [ -z "$leftover" ] \
    || { echo "scheduled-publish wird weiterhin per hartkodierter URL gepatcht: ${leftover}" >&2; return 1; }
}
