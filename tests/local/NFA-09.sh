#!/usr/bin/env bash
# NFA-09: Statisches DNS — beide Produktionscluster nutzen statische IPs.
# DDNS-CronJob entfällt; DNS-Einträge werden einmalig in ipv64.net gesetzt.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

PROJECT_DIR="${SCRIPT_DIR}/.."

# ── T1: Kein DDNS-CronJob-Manifest vorhanden (statische IP) ─────
assert_eq "$(test -f "${PROJECT_DIR}/prod/ddns-updater.yaml" && echo "exists" || echo "missing")" "missing" \
  "NFA-09" "T1" "Kein DDNS-Updater-Manifest (statische IPs, kein CronJob nötig)"

# ── T2: cert-manager Wildcard-Cert-Manifest vorhanden ───────────
assert_eq "$(test -f "${PROJECT_DIR}/prod/wildcard-certificate.yaml" && echo "exists" || echo "missing")" "exists" \
  "NFA-09" "T2" "Wildcard-TLS-Manifest vorhanden (cert-manager)"

# ── T3: ClusterIssuer verwendet ipv64 DNS-01 ────────────────────
IPV64_REF=$(grep -c "ipv64" "${PROJECT_DIR}/prod/cluster-issuer.yaml" 2>/dev/null || echo "0")
assert_gt "$IPV64_REF" "0" "NFA-09" "T3" "ClusterIssuer nutzt ipv64 DNS-01 Solver"
