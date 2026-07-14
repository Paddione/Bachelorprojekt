#!/usr/bin/env bash
# scripts/factory/provider-config.sh — operator CLI for tickets.provider_config / provider_health.
# SOURCE lib.sh for factory_resolve + factory_psql. Apply per-brand: BRAND=mentolder|korczewski.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"; factory_resolve

usage() { cat >&2 <<'EOF'
Usage:
  provider-config.sh set --source S --tier sonnet|haiku --priority N --provider P --model M [--base-url U] [--max-concurrent K]
  provider-config.sh list [--source S]
  provider-config.sh reset --provider P
  provider-config.sh health
EOF
exit 2; }

cmd="${1:-}"; shift || true
case "$cmd" in
  set)
    src= tier= prio= prov= model= burl= maxc=3
    while [[ $# -gt 0 ]]; do case "$1" in
      --source) src="$2"; shift 2;; --tier) tier="$2"; shift 2;;
      --priority) prio="$2"; shift 2;; --provider) prov="$2"; shift 2;;
      --model) model="$2"; shift 2;; --base-url) burl="$2"; shift 2;;
      --max-concurrent) maxc="$2"; shift 2;; *) usage;; esac; done
    [[ -n "$src" && -n "$tier" && -n "$prio" && -n "$prov" && -n "$model" ]] || usage
    if [[ "$tier" == "opus" ]]; then echo "WARNING: opus tier — ensure a provider_config row exists for this source/tier." >&2; fi
    factory_psql \
      -v src="$src" -v tier="$tier" -v prio="$prio" -v prov="$prov" \
      -v model="$model" -v burl="${burl:-}" -v maxc="$maxc" <<'SQL'
INSERT INTO tickets.provider_config (source,tier,priority,provider,model_id,base_url,max_concurrent,updated_at)
VALUES (:'src', :'tier', :'prio'::int, :'prov', :'model', NULLIF(:'burl',''), :'maxc'::int, now())
ON CONFLICT (source,tier,priority) DO UPDATE
SET provider=EXCLUDED.provider, model_id=EXCLUDED.model_id, base_url=EXCLUDED.base_url,
    max_concurrent=EXCLUDED.max_concurrent, enabled=true, updated_at=now();
SQL
    echo "ok";;
  list)
    src=
    while [[ $# -gt 0 ]]; do case "$1" in --source) src="$2"; shift 2;; *) usage;; esac; done
    if [[ -n "$src" ]]; then
      factory_psql -v src="$src" <<'SQL'
SELECT source,tier,priority,provider,model_id,COALESCE(base_url,''),max_concurrent,enabled
FROM tickets.provider_config WHERE source=:'src' ORDER BY tier,priority;
SQL
    else
      factory_psql <<'SQL'
SELECT source,tier,priority,provider,model_id,COALESCE(base_url,''),max_concurrent,enabled
FROM tickets.provider_config ORDER BY source,tier,priority;
SQL
    fi;;
  reset)
    prov=
    while [[ $# -gt 0 ]]; do case "$1" in --provider) prov="$2"; shift 2;; *) usage;; esac; done
    [[ -n "$prov" ]] || usage
    factory_psql -v prov="$prov" <<'SQL'
INSERT INTO tickets.provider_health (provider,failure_count,cooldown_until,updated_at)
VALUES (:'prov',0,NULL,now())
ON CONFLICT (provider) DO UPDATE SET failure_count=0, cooldown_until=NULL, active_agents=0, updated_at=now();
SQL
    echo "reset $prov";;
  health)
    factory_psql <<'SQL'
SELECT provider,failure_count,COALESCE(to_char(cooldown_until,'YYYY-MM-DD HH24:MI'),'healthy'),active_agents
FROM tickets.provider_health ORDER BY provider;
SQL
    ;;
  *) usage;;
esac
