#!/usr/bin/env bash
# Seed default admin shortcuts (bookmarks) into the website DB.
# Idempotent — skips rows whose URL already exists.
# Usage:
#   ./scripts/seed-admin-shortcuts.sh                    # active kubectl context
#   ./scripts/seed-admin-shortcuts.sh --context mentolder
#   ./scripts/seed-admin-shortcuts.sh --context korczewski
set -euo pipefail

CTX_FLAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) CTX_FLAG="--context $2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Honour WORKSPACE_NAMESPACE when set by the caller (env-resolve.sh / Taskfile)
# so `task workspace:shortcuts:seed ENV=korczewski` targets workspace-korczewski.
NAMESPACE="${WORKSPACE_NAMESPACE:-workspace}"

run_sql() {
  local sql="$1"
  # shellcheck disable=SC2086
  kubectl $CTX_FLAG exec -n "$NAMESPACE" deploy/shared-db -- \
    psql -U postgres -d website -c "$sql" 2>/dev/null
}

echo "▶ Seeding admin shortcuts (context: ${CTX_FLAG:-<active>}) …"

SQL="
CREATE TABLE IF NOT EXISTS admin_shortcuts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url        TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin_shortcuts (url, label, sort_order)
SELECT url, label, sort_order FROM (VALUES
  ('https://console.hetzner.com/',      'Hetzner Console', 1),
  ('https://app.filen.io/#/drive/',     'Filen Drive',     2),
  ('https://dashboard.stripe.com/',     'Stripe',          3),
  ('https://app.mailbox.org/appsuite/', 'Mailbox.org',     4)
) AS v(url, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM admin_shortcuts a WHERE a.url = v.url
);
"

run_sql "$SQL"

echo "✓ Done."
