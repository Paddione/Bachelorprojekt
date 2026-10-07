#!/usr/bin/env bats
# tests/spec/staging-stack-repair.bats
# Repo-seitige Ursachen des degradierten workspace-staging-Stacks [T900806].
# Belegt am 2026-10-07 per Loki, kubectl und Rollback-Probe gegen shared-db.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SHARED_DB="$REPO_ROOT/k3d/shared-db.yaml"
  MIGRATION="$REPO_ROOT/scripts/migrations/2026-08-10-llm-proxy-request-log.sql"
  STAGING_ENV="$REPO_ROOT/environments/staging.yaml"
  STAGING_SEALED="$REPO_ROOT/environments/sealed-secrets/staging.yaml"
}

# RC2: In Staging gehoerten public.brands/customers dem Benutzer postgres. Der
# ensure-Hook laeuft mit SET ROLE website und scheiterte am Foreign Key
# ("permission denied for table brands"); `|| true` verschluckte den Fehler.
@test "shared-db postStart normalisiert public-Tabellen auf Owner website" {
  run grep -E 'OWNER TO website' "$SHARED_DB"
  [ "$status" -eq 0 ] || { echo "kein OWNER TO website im postStart von $SHARED_DB"; return 1; }
}

@test "shared-db postStart verschluckt ensure-Fehler nicht mehr mit || true" {
  run grep -E 'ensure-[a-z-]+-schema\.sh \|\| true' "$SHARED_DB"
  [ "$status" -ne 0 ] || { echo "stilles || true gefunden:"; echo "$output"; return 1; }
}

# RC5: llm-proxy-log-retention macht UPDATE, die Migration gewaehrte nur
# SELECT, INSERT, DELETE ("permission denied for table llm_proxy_request_log").
@test "llm-proxy-Migration gewaehrt website UPDATE" {
  run grep -E 'GRANT [A-Z, ]*UPDATE[A-Z, ]* ON tickets\.llm_proxy_request_log TO website' "$MIGRATION"
  [ "$status" -eq 0 ] || { echo "kein UPDATE-Grant in $MIGRATION"; return 1; }
}

# RC6: Staging-Website zeigte auf die Nextcloud-DB im Prod-Namespace.
@test "staging NEXTCLOUD_DB_HOST zeigt nicht auf den Prod-Namespace" {
  run grep -E '^[[:space:]]*NEXTCLOUD_DB_HOST:' "$STAGING_ENV"
  [ "$status" -eq 0 ] || { echo "NEXTCLOUD_DB_HOST fehlt in $STAGING_ENV"; return 1; }
  [[ "$output" != *".workspace.svc"* ]] || { echo "zeigt auf Prod: $output"; return 1; }
}

# RC1: sessions-purge, billing-dunning-detection und monthly-billing scheiterten an
# fehlenden Keys. Geprueft wird die versiegelte Datei, weil der Klartext in CI
# verschluesselt bleibt.
@test "staging SealedSecrets enthalten die Pflicht-Keys" {
  for k in SESSIONS_CRON_TOKEN FILEN_EMAIL FILEN_PASSWORD POCKET_ID_SESSION_HUB_SECRET POCKET_ID_GRAFANA_SECRET POCKET_ID_WEBSITE_SECRET; do
    grep -qE "^[[:space:]]+${k}:" "$STAGING_SEALED" || { echo "fehlt in $STAGING_SEALED: $k"; return 1; }
  done
}
