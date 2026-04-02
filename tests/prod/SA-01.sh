#!/usr/bin/env bash
# SA-01: Transportverschlüsselung — TLS enforcement, cipher strength, HSTS
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"

# All service subdomains to check
SERVICES=("auth-${DOMAIN}" "chat-${DOMAIN}" "files-${DOMAIN}" "office-${DOMAIN}")

# T1: HTTPS is reachable on all services
for svc in "${SERVICES[@]}"; do
  STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://${svc}/" 2>/dev/null || echo "000")
  assert_match "$STATUS" "^(200|301|302|303|307|308|401|404)$" "SA-01" "T1-${svc%%.*}" "HTTPS erreichbar auf ${svc}"
done

# T2: HTTP → HTTPS redirect on all services
for svc in "${SERVICES[@]}"; do
  REDIRECT=$(curl -sk -o /dev/null -w '%{redirect_url}' --max-time 10 "http://${svc}/" 2>/dev/null || echo "")
  if [[ -n "$REDIRECT" ]]; then
    assert_contains "$REDIRECT" "https://" "SA-01" "T2-${svc%%.*}" "HTTP→HTTPS Redirect auf ${svc}"
  else
    # Some servers may not respond on port 80 at all (also acceptable)
    HTTP_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "http://${svc}/" 2>/dev/null || echo "000")
    if [[ "$HTTP_STATUS" == "000" ]]; then
      _log_result "SA-01" "T2-${svc%%.*}" "Port 80 geschlossen auf ${svc} (akzeptabel)" "pass" "0"
    else
      _log_result "SA-01" "T2-${svc%%.*}" "HTTP→HTTPS Redirect auf ${svc}" "fail" "0" "HTTP ${HTTP_STATUS} ohne Redirect"
    fi
  fi
done

# T3: TLS cipher strength (requires nmap)
if command -v nmap &>/dev/null; then
  NMAP_OUT=$(nmap --script ssl-enum-ciphers -p 443 "auth-${DOMAIN}" 2>/dev/null)

  # Check TLS 1.2+ is supported
  assert_contains "$NMAP_OUT" "TLSv1.2" "SA-01" "T3a" "TLS 1.2 unterstützt"

  # Check no SSLv3 or TLS 1.0
  assert_not_contains "$NMAP_OUT" "SSLv3" "SA-01" "T3b" "SSLv3 deaktiviert"
  assert_not_contains "$NMAP_OUT" "TLSv1.0" "SA-01" "T3c" "TLS 1.0 deaktiviert"

  # Check cipher grade (nmap rates A/B/C/D/F)
  if [[ "$NMAP_OUT" == *"least strength: A"* ]] || [[ "$NMAP_OUT" == *"least strength: B"* ]]; then
    _log_result "SA-01" "T3d" "Cipher-Stärke mindestens B" "pass" "0"
  elif [[ "$NMAP_OUT" == *"least strength:"* ]]; then
    GRADE=$(echo "$NMAP_OUT" | grep "least strength:" | head -1 | sed 's/.*least strength: //')
    _log_result "SA-01" "T3d" "Cipher-Stärke mindestens B" "fail" "0" "Cipher grade: ${GRADE}"
  else
    _log_result "SA-01" "T3d" "Cipher-Stärke mindestens B" "pass" "0" "Keine schwachen Cipher gefunden"
  fi
else
  skip_test "SA-01" "T3a" "TLS Cipher-Check" "nmap nicht installiert"
  skip_test "SA-01" "T3b" "SSLv3 Check" "nmap nicht installiert"
  skip_test "SA-01" "T3c" "TLS 1.0 Check" "nmap nicht installiert"
  skip_test "SA-01" "T3d" "Cipher-Stärke" "nmap nicht installiert"
fi

# T4: HSTS header present
for svc in "auth-${DOMAIN}" "chat-${DOMAIN}" "files-${DOMAIN}"; do
  HSTS=$(curl -sk -D - -o /dev/null --max-time 10 "https://${svc}/" 2>/dev/null | grep -i "strict-transport-security" || echo "")
  if [[ -n "$HSTS" ]]; then
    _log_result "SA-01" "T4-${svc%%.*}" "HSTS Header auf ${svc}" "pass" "0"
  else
    _log_result "SA-01" "T4-${svc%%.*}" "HSTS Header auf ${svc}" "fail" "0" "Strict-Transport-Security Header fehlt"
  fi
done

# T5: Certificate validity (not expired)
CERT_EXPIRY=$(echo | openssl s_client -servername "auth-${DOMAIN}" -connect "auth-${DOMAIN}:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [[ -n "$CERT_EXPIRY" ]]; then
  EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
  assert_gt "$DAYS_LEFT" 0 "SA-01" "T5" "TLS-Zertifikat gültig (${DAYS_LEFT} Tage verbleibend)"
else
  skip_test "SA-01" "T5" "Zertifikat-Gültigkeit" "Konnte Zertifikat nicht lesen"
fi
