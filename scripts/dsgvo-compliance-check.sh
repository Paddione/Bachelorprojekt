#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# dsgvo-compliance-check.sh — DSGVO Compliance Verification
# ═══════════════════════════════════════════════════════════════════
# Verifies that the Workspace platform meets data sovereignty claims.
# Can run standalone (human-readable) or with --json for Grafana ingestion.
#
# Checks:
#   1. No external DNS resolution from pods
#   2. No container images from US cloud providers
#   3. All data volumes are local (no cloud storage)
#   4. TLS certificates present (production)
#   5. Audit logging enabled across services
#   6. No telemetry endpoints contacted
#   9. TLS certificate present
#  10. Password policy configured in Keycloak
#  11. Backup CronJob active
#  12. NetworkPolicy Default-Deny active
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
OUTPUT_FORMAT="${1:-text}"
RESULTS=()
PASS=0
FAIL=0
WARN=0

_check() {
  local id="$1" name="$2" status="$3" detail="${4:-}"
  if [[ "$status" == "pass" ]]; then ((PASS++)); fi
  if [[ "$status" == "fail" ]]; then ((FAIL++)); fi
  if [[ "$status" == "warn" ]]; then ((WARN++)); fi

  if [[ "$OUTPUT_FORMAT" == "--json" ]]; then
    RESULTS+=("$(jq -cn --arg id "$id" --arg name "$name" --arg status "$status" --arg detail "$detail" \
      '{id:$id, name:$name, status:$status, detail:$detail, timestamp: (now | todate)}')")
  else
    local icon="✅"
    [[ "$status" == "fail" ]] && icon="❌"
    [[ "$status" == "warn" ]] && icon="⚠️"
    echo "  ${icon} ${id}: ${name}"
    [[ -n "$detail" ]] && echo "     → ${detail}"
  fi
}

echo "═══ DSGVO Compliance Check ═══"
echo "Namespace: ${NAMESPACE}"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ── Check 1: No external/US container images ─────────────────────
echo "▸ Prüfe Container-Images..."
IMAGES=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{end}' 2>/dev/null | sort -u)
US_CLOUD_IMAGES=$(echo "$IMAGES" | grep -iE '(gcr\.io|amazonaws|azurecr|mcr\.microsoft)' || true)
if [[ -z "$US_CLOUD_IMAGES" ]]; then
  _check "D01" "Keine Container-Images von US-Cloud-Anbietern" "pass"
else
  _check "D01" "Keine Container-Images von US-Cloud-Anbietern" "fail" "Gefunden: ${US_CLOUD_IMAGES}"
fi

# ── Check 2: No external DNS calls from pods ─────────────────────
echo "▸ Prüfe DNS-Auflösungen..."
# Check that pods don't resolve external analytics/tracking domains
EXTERNAL_DOMAINS="google-analytics.com telemetry.mattermost.com push-test.mattermost.com sentry.io"
DNS_VIOLATIONS=""
for domain in $EXTERNAL_DOMAINS; do
  # Try to resolve from inside a pod — if CoreDNS forwards it, it's a potential leak
  RESOLVE=$(kubectl exec -n "$NAMESPACE" deploy/mattermost -c mattermost -- \
    nslookup "$domain" 2>/dev/null | grep -c "Address:" 2>/dev/null || echo "0")
  if [[ "$RESOLVE" -gt 1 ]]; then
    DNS_VIOLATIONS="${DNS_VIOLATIONS} ${domain}"
  fi
done
if [[ -z "$DNS_VIOLATIONS" ]]; then
  _check "D02" "Keine externen Tracking-Domains auflösbar" "pass"
else
  _check "D02" "Keine externen Tracking-Domains auflösbar" "warn" "Auflösbar (nicht zwingend kontaktiert):${DNS_VIOLATIONS}"
fi

# ── Check 3: All PVCs are local (no cloud storage classes) ───────
echo "▸ Prüfe Speicher-Volumes..."
CLOUD_SC=$(kubectl get pvc -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.spec.storageClassName}{"\n"}{end}' 2>/dev/null \
  | grep -iE '(aws-ebs|azure-disk|gce-pd|do-block)' || true)
if [[ -z "$CLOUD_SC" ]]; then
  _check "D03" "Alle PersistentVolumes sind lokal (keine Cloud-Speicher)" "pass"
else
  _check "D03" "Alle PersistentVolumes sind lokal (keine Cloud-Speicher)" "fail" "Cloud StorageClass: ${CLOUD_SC}"
fi

# ── Check 4: Keycloak audit logging enabled ──────────────────────
echo "▸ Prüfe Audit-Logging..."
KC_ADMIN_PASS=$(kubectl get secret -n "$NAMESPACE" workspace-secrets \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || echo "devadmin")
KC_TOKEN=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -c keycloak -- \
  curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -d "grant_type=client_credentials&client_id=admin-cli" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=${KC_ADMIN_PASS}" \
  2>/dev/null | jq -r '.access_token // empty' 2>/dev/null || echo "")
if [[ -n "$KC_TOKEN" ]]; then
  EVENTS_ENABLED=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -c keycloak -- \
    curl -s -H "Authorization: Bearer ${KC_TOKEN}" \
    "http://localhost:8080/admin/realms/workspace" 2>/dev/null \
    | jq -r '.eventsEnabled // false' 2>/dev/null || echo "false")
  if [[ "$EVENTS_ENABLED" == "true" ]]; then
    _check "D04" "Keycloak Audit-Events aktiviert" "pass"
  else
    _check "D04" "Keycloak Audit-Events aktiviert" "warn" "eventsEnabled=${EVENTS_ENABLED}"
  fi
else
  _check "D04" "Keycloak Audit-Events aktiviert" "warn" "Keycloak-Admin-Token konnte nicht abgerufen werden"
fi

# ── Check 5: Mattermost compliance/audit endpoint works ─────────
echo "▸ Prüfe Mattermost Audit-Log..."
MM_TOKEN="${MM_ADMIN_TOKEN:-}"
if [[ -z "$MM_TOKEN" ]]; then
  MM_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"login_id":"testadmin","password":"Testpassword123!"}' \
    -D - "http://chat.localhost/api/v4/users/login" 2>/dev/null \
    | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2 || echo "")
fi
if [[ -n "$MM_TOKEN" ]]; then
  AUDIT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    "http://chat.localhost/api/v4/audits?page=0&per_page=1" 2>/dev/null || echo "000")
  if [[ "$AUDIT_STATUS" == "200" ]]; then
    _check "D05" "Mattermost Audit-Log abrufbar" "pass"
  else
    _check "D05" "Mattermost Audit-Log abrufbar" "fail" "HTTP ${AUDIT_STATUS}"
  fi
else
  _check "D05" "Mattermost Audit-Log abrufbar" "warn" "Kein Admin-Token verfügbar"
fi

# ── Check 6: No proprietary/tracking services in running pods ────
echo "▸ Prüfe auf proprietäre Dienste..."
PROPRIETARY=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null \
  | grep -iE '(datadog|newrelic|splunk|segment|mixpanel)' || true)
if [[ -z "$PROPRIETARY" ]]; then
  _check "D06" "Keine proprietären Telemetrie-Dienste im Cluster" "pass"
else
  _check "D06" "Keine proprietären Telemetrie-Dienste im Cluster" "fail" "Gefunden: ${PROPRIETARY}"
fi

# ── Check 7: All services use open-source licenses ───────────────
echo "▸ Prüfe Open-Source-Lizenzen..."
LICENSE_IMAGES=$(echo "$IMAGES" | grep -ivE '(mattermost|nextcloud|keycloak|postgres|collabora|coturn|nats|janus|nginx|opensearch|mailpit|busybox|signaling|axllent)' || true)
if [[ -z "$LICENSE_IMAGES" ]]; then
  _check "D07" "Alle Container-Images sind Open-Source-Projekte" "pass"
else
  _check "D07" "Alle Container-Images sind Open-Source-Projekte" "warn" "Unbekannte Images: ${LICENSE_IMAGES}"
fi

# ── Check 8: SMTP is internal (not external mail relay) ──────────
echo "▸ Prüfe E-Mail-Konfiguration..."
SMTP_HOST=$(kubectl get deploy -n "$NAMESPACE" mattermost \
  -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}' 2>/dev/null \
  | grep "MM_EMAILSETTINGS_SMTPSERVER" | cut -d= -f2 || echo "")
if [[ "$SMTP_HOST" == "mailpit" || "$SMTP_HOST" == "localhost" || -z "$SMTP_HOST" ]]; then
  _check "D08" "SMTP-Server ist cluster-intern (keine externen Mail-Relays)" "pass" "SMTP=${SMTP_HOST:-nicht konfiguriert}"
else
  _check "D08" "SMTP-Server ist cluster-intern (keine externen Mail-Relays)" "warn" "SMTP=${SMTP_HOST}"
fi

# ── Check 9: TLS-Zertifikat vorhanden (Art. 32) ──────────────────
echo "▸ Prüfe TLS-Zertifikat..."
TLS_SECRET=$(kubectl get secret workspace-wildcard-tls -n "$NAMESPACE" \
  --no-headers 2>/dev/null | wc -l | tr -d ' ' || echo "0")
if [[ "$TLS_SECRET" -gt 0 ]]; then
  _check "D09" "TLS-Zertifikat (workspace-wildcard-tls) vorhanden" "pass"
else
  _check "D09" "TLS-Zertifikat (workspace-wildcard-tls) vorhanden" "warn" \
    "Secret nicht gefunden (normal in Dev ohne cert-manager)"
fi

# ── Check 10: Passwortrichtlinie in Keycloak (Art. 32) ───────────
echo "▸ Prüfe Passwortrichtlinie..."
if [[ -n "$KC_TOKEN" ]]; then
  PWD_POLICY=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -c keycloak -- \
    curl -s -H "Authorization: Bearer ${KC_TOKEN}" \
    "http://localhost:8080/admin/realms/workspace" 2>/dev/null \
    | jq -r '.passwordPolicy // empty' 2>/dev/null || echo "")
  if [[ -n "$PWD_POLICY" ]]; then
    _check "D10" "Passwortrichtlinie in Keycloak-Realm konfiguriert" "pass" \
      "Policy: ${PWD_POLICY}"
  else
    _check "D10" "Passwortrichtlinie in Keycloak-Realm konfiguriert" "warn" \
      "passwordPolicy ist leer"
  fi
else
  _check "D10" "Passwortrichtlinie in Keycloak-Realm konfiguriert" "warn" \
    "Keycloak-Token nicht verfügbar (siehe D04)"
fi

# ── Check 11: Backup-CronJob aktiv (Art. 32 — Verfügbarkeit) ─────
echo "▸ Prüfe Backup-CronJob..."
BACKUP_JOB=$(kubectl get cronjob -n "$NAMESPACE" --no-headers 2>/dev/null \
  | grep -c "backup" || echo "0")
if [[ "$BACKUP_JOB" -gt 0 ]]; then
  _check "D11" "Backup-CronJob aktiv (Art. 32 — Datenverfügbarkeit)" "pass"
else
  _check "D11" "Backup-CronJob aktiv (Art. 32 — Datenverfügbarkeit)" "fail" \
    "Kein Backup-CronJob im Namespace ${NAMESPACE} gefunden"
fi

# ── Check 12: NetworkPolicy Default-Deny aktiv (Art. 32) ─────────
echo "▸ Prüfe NetworkPolicy Default-Deny..."
NP_DENY=$(kubectl get networkpolicy default-deny-ingress -n "$NAMESPACE" \
  --no-headers 2>/dev/null | wc -l | tr -d ' ' || echo "0")
if [[ "$NP_DENY" -gt 0 ]]; then
  _check "D12" "NetworkPolicy Default-Deny-Ingress aktiv (Art. 32 — Netzwerksegmentierung)" "pass"
else
  _check "D12" "NetworkPolicy Default-Deny-Ingress aktiv (Art. 32 — Netzwerksegmentierung)" "fail" \
    "NetworkPolicy 'default-deny-ingress' fehlt in Namespace ${NAMESPACE}"
fi

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "═══ Ergebnis ═══"
echo "  ✅ ${PASS} bestanden   ⚠️ ${WARN} Warnung(en)   ❌ ${FAIL} fehlgeschlagen"
TOTAL=$((PASS + WARN + FAIL))
SCORE=$(( PASS * 100 / TOTAL ))
echo "  DSGVO-Compliance-Score: ${SCORE}%"
echo ""

if [[ "$OUTPUT_FORMAT" == "--json" ]]; then
  echo "["
  for i in "${!RESULTS[@]}"; do
    echo "  ${RESULTS[$i]}$([ $i -lt $((${#RESULTS[@]}-1)) ] && echo ",")"
  done
  echo "]"
fi

[[ $FAIL -eq 0 ]]
