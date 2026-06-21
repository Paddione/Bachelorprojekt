#!/usr/bin/env bash
# scripts/sessions-purge.sh — triggert den 30-Tage-Sessions-Purge via Website-Endpoint. [T000994]
#
# Ruft POST /api/admin/sessions/purge mit X-Cron-Token auf. Für Host-seitige
# Ausführung und als Referenz für den CronJob in k3d/admin-actions-cronjobs.yaml.
#
# Env-Vars:
#   SESSIONS_PURGE_URL   — Purge-Endpoint (Default: in-cluster Website-Service)
#   SESSIONS_CRON_TOKEN  — Shared secret (PFLICHT)
set -uo pipefail

URL="${SESSIONS_PURGE_URL:-http://website.workspace.svc.cluster.local:80/api/admin/sessions/purge}"
TOKEN="${SESSIONS_CRON_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "sessions-purge: SESSIONS_CRON_TOKEN required" >&2
  exit 2
fi

resp=$(curl -fsS -X POST "$URL" -H "X-Cron-Token: $TOKEN" --max-time 30) || {
  echo "sessions-purge: purge endpoint failed (curl exit $?)" >&2
  exit 1
}

printf '%s\n' "$resp"
