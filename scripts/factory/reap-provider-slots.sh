#!/usr/bin/env bash
# scripts/factory/reap-provider-slots.sh [--dry-run]
# Gibt Provider-Slots frei, deren Claim aelter als die TTL ist [T002281].
#
# WARUM ES DAS GIBT: route-provider.sh claimt atomar (active_agents + 1); freigegeben
# wird ueber release-slot.sh. Von den zwei Aufrufern des Routers hatte einer den Release
# schlicht vergessen - deepseek stand dadurch auf active_agents=3 = max_concurrent und
# wurde von der Kandidaten-Kette still uebersprungen, ohne jede Fehlermeldung. Ein reiner
# Aufrufer-Fix macht den Leak unsichtbar, nicht unmoeglich: der naechste Aufrufer wird es
# wieder vergessen. Dieser Reaper ist das Netz darunter.
#
# TTL-WAHL: Default 30 Minuten, bewusst konservativ. Zu kurz gewaehlt gibt der Reaper
# Slots noch LAUFENDER Anfragen frei und hebt die Concurrency-Begrenzung faktisch auf -
# der Zaehler faellt dann unter die Zahl der echten In-Flight-Requests. Eine
# LLM-Anfrage der Factory laeuft im Minutenbereich; 30 Minuten liegen sicher darueber.
#
# IDEMPOTENZ: Zeilen ohne Claim (claimed_at IS NULL) bleiben unberuehrt, ebenso
# active_agents=0. Mehrfache Laeufe sind folgenlos.
#
# Usage:
#   bash scripts/factory/reap-provider-slots.sh              # raeumt ab
#   bash scripts/factory/reap-provider-slots.sh --dry-run    # zeigt nur, was faellig waere
# Env:
#   PROVIDER_SLOT_TTL_MIN   TTL in Minuten (Default 30)
#   BRAND                   Ziel-Brand (Default mentolder, via lib.sh)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"; factory_resolve

TTL_MIN="${PROVIDER_SLOT_TTL_MIN:-30}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

if $DRY_RUN; then
  factory_psql -v ttl="$TTL_MIN" <<'SQL'
SELECT provider||' | active='||active_agents||' | claimed_at='||COALESCE(claimed_at::text,'NULL')
FROM tickets.provider_health
WHERE active_agents > 0
  AND claimed_at IS NOT NULL
  AND claimed_at < now() - (:'ttl' || ' minutes')::interval;
SQL
  exit 0
fi

# Ein einzelnes UPDATE statt Read-then-Write: der Zaehler wird sonst zwischen SELECT und
# UPDATE von einem parallelen Claim veraendert.
#
# NULLSETZUNG STATT DEKREMENT [T002359]: die Zeile wird nur angefasst, wenn ihr JUENGSTER
# Claim aelter als die TTL ist — dann sind alle auf ihr gehaltenen Slots verwaist, nicht nur
# einer. Das alte, um genau eins dekrementierende GREATEST() in Kombination mit
# `claimed_at = NULL` machte die Zeile nach dem ERSTEN Lauf unerreichbar, weil
# `claimed_at IS NOT NULL` nie wieder matchte: der Zaehler blieb bei drei verwaisten
# Claims auf zwei stehen, fuer immer.
REAPED=$(factory_psql -v ttl="$TTL_MIN" <<'SQL'
WITH stale AS (
  UPDATE tickets.provider_health
     SET active_agents   = 0,
         reserved_tokens = 0,
         claimed_at      = NULL,
         updated_at      = now()
   WHERE active_agents > 0
     AND claimed_at IS NOT NULL
     AND claimed_at < now() - (:'ttl' || ' minutes')::interval
  RETURNING provider
)
SELECT count(*) FROM stale;
SQL
)

if [[ "${REAPED:-0}" -gt 0 ]]; then
  echo "reap-provider-slots: $REAPED verwaiste(n) Slot(s) freigegeben (TTL ${TTL_MIN}min)."
else
  echo "reap-provider-slots: nichts faellig (TTL ${TTL_MIN}min)."
fi
