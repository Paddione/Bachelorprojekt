#!/usr/bin/env bash
# Ensure a plan file has COMPLETE YAML frontmatter (domains + status) that
# scripts/plan-context.sh can route on.
#   - No frontmatter           → derive domains, prepend a full block.
#   - Frontmatter, complete     → no-op (idempotent).
#   - Frontmatter, incomplete   → repair IN PLACE: fill domains when []/null/
#                                 missing (re-derived from the body), and set
#                                 status: active when missing/null. All other
#                                 fields (title/ticket_id/pr_number) and any
#                                 deliberate non-active status are preserved.
# Usage: scripts/plan-frontmatter-hook.sh [--activate|--spec] <plan.md>
#
# --spec: prepend the spec frontmatter (ticket_id/plan_ref/status/date). Path
# convention (T002074): the design spec now lives at
#   openspec/changes/<slug>/design.md   (SSOT co-located with the change)
# not under docs/superpowers/specs/ any more (Alt-Bestand bleibt gültig). Both
# path worlds are accepted here — the mode only cares that the file exists.
set -euo pipefail

FORCE_ACTIVE=0
SPEC_MODE=0
if [[ "${1:-}" == "--activate" ]]; then FORCE_ACTIVE=1; shift; fi
if [[ "${1:-}" == "--spec" ]]; then SPEC_MODE=1; shift; fi
VALIDATE_MODE=0
if [[ "${1:-}" == "--validate" ]]; then VALIDATE_MODE=1; shift; fi
FILE="${1:?Usage: plan-frontmatter-hook.sh [--activate|--spec|--validate] <plan.md>}"

if [[ "$SPEC_MODE" -eq 1 ]]; then
  # Idempotent: only prepend when the file has no frontmatter yet.
  if [[ "$(head -1 "$FILE" | tr -d '\r')" == "---" ]]; then
    echo "Spec frontmatter already present in $FILE — nothing to do."
    exit 0
  fi
  tmpfile="$(mktemp)"
  {
    printf '%s\n' "---"
    printf 'ticket_id: null\n'
    printf 'plan_ref: null\n'
    printf 'status: active\n'
    printf 'date: %s\n' "$(date +%F)"
    printf '%s\n\n' "---"
    cat "$FILE"
  } > "$tmpfile"
  mv "$tmpfile" "$FILE"
  echo "Added spec frontmatter to $FILE"
  exit 0
fi

CANON_ROLES="infra website db ops test security"

# Derive canonical role tokens from content on stdin (mirrors CLAUDE.md routing).
_derive_domains() {
    local content; content="$(cat)"
    local domains=()
    grep -qiE 'website/|astro|svelte|component|homepage|kore|brand|css|ui|frontend' <<<"$content" && domains+=(website)
    grep -qiE 'k3d/|prod[-/]|manifest|kustomize|overlay|Taskfile|environments/|deploy.*k8s' <<<"$content" && domains+=(infra)
    grep -qiE 'database|postgresql|psql|schema|query|backup.*db|restore.*db|tickets\.|v_timeline' <<<"$content" && domains+=(db)
    grep -qiE 'pod |logs |kubectl|deployment|crash|CrashLoop|health.*check' <<<"$content" && domains+=(ops)
    grep -qiE 'tests/|\.bats|\.spec\.ts|playwright|runner\.sh|BATS|FA-|SA-|NFA-|AK-' <<<"$content" && domains+=(test)
    grep -qiE 'SealedSecret|Keycloak|OIDC|DSGVO|credentials|rotate|certificate|secret' <<<"$content" && domains+=(security)
    printf '%s\n' "${domains[@]}"
}

# space-separated roles -> "[a, b]"; empty -> "[]"
_domains_to_yaml() {
    local input="$1"
    if [[ -n "${input// }" ]]; then
        echo "[$(echo "$input" | tr ' ' '\n' | grep -v '^$' | sed 's/.*/, &/' | tr -d '\n' | sed 's/^, //')]"
    else
        echo "[]"
    fi
}

# true iff line 1 is exactly --- AND a closing --- exists on a later line
# (\r-tolerant: CRLF plans must not be misread as having no frontmatter)
_has_frontmatter() {
    [[ "$(head -1 "$FILE" | tr -d '\r')" == "---" ]] || return 1
    awk '{sub(/\r$/,"")} NR==1{next} /^---$/{found=1; exit} END{exit !found}' "$FILE"
}

# content after the closing frontmatter --- (for derivation); whole file if none
_body() {
    if _has_frontmatter; then
        awk 'BEGIN{n=0} {sub(/\r$/,"")} /^---$/{n++; next} n>=2{print}' "$FILE"
    else
        cat "$FILE"
    fi
}

# Derive the ticket id (TNNNN…) from the plan body (**Ticket:** TNNNN) or, as a
# fallback, from the filename slug (…-tNNNN.md). Empty when nothing derivable —
# callers MUST only fill ticket_id when this is non-empty (preserves idempotency
# for slug-less plans whose ticket_id is a deliberate null).
_derive_ticket_id() {
    local tid
    tid="$(grep -m1 -ioE 'ticket:[*[:space:]]*T[0-9]{4,}' "$FILE" 2>/dev/null \
        | grep -oiE 'T[0-9]{4,}' | head -1 | tr '[:lower:]' '[:upper:]')"
    if [[ -z "$tid" ]]; then
        tid="$(basename "$FILE" .md | grep -oiE 't[0-9]{4,}' | head -1 | tr '[:lower:]' '[:upper:]')"
    fi
    printf '%s' "$tid"
}

# value of KEY inside the frontmatter block (first pair of ---); empty if absent
_fm_field() {
    awk -v key="$1" '
        BEGIN{f=0}
        /^---$/{f++; next}
        f==1 && $0 ~ "^"key":" { sub("^"key":[ \t]*","",$0); print; exit }
    ' "$FILE" | tr -d '\r'
}

slug="$(basename "$FILE" .md)"
title="$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || true)"
[[ -n "$title" ]] || title="$slug"

# ── --validate: structural schema gate (used by the plan paths) ──
if [[ "$VALIDATE_MODE" -eq 1 ]]; then
  if ! _has_frontmatter; then
    echo "VALIDATE: $FILE has no frontmatter block" >&2; exit 1
  fi
  # Auto-fill a missing title from the first H1 (fixes the plan-context.sh empty-header bug).
  if [[ -z "$(_fm_field title)" ]]; then
    h1="$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || true)"
    [[ -n "$h1" ]] || h1="$(basename "$FILE" .md)"
    tmp="$(mktemp)"
    awk -v t="$h1" 'BEGIN{f=0;done=0}{sub(/\r$/,"")}
      NR==1 && $0=="---"{print;f=1;next}
      f==1 && $0=="---" && done==0{print "title: " t; done=1; print; f=0; next}
      {print}' "$FILE" > "$tmp"
    mv "$tmp" "$FILE"
  fi
  rc=0
  for key in title ticket_id domains status; do
    v="$(_fm_field "$key" | tr -d ' \t\r')"
    case "$v" in ""|"null") [[ "$key" == "ticket_id" ]] || { echo "VALIDATE: $FILE missing/empty '$key'" >&2; rc=1; } ;; esac
    [[ "$key" == "domains" && ( "$v" == "[]" ) ]] && { echo "VALIDATE: $FILE has empty domains []" >&2; rc=1; }
  done
  exit $rc
fi

# ── Case A: no frontmatter → derive, optional interactive override, prepend ──
if ! _has_frontmatter; then
    derived="$(_body | _derive_domains | tr '\n' ' ' | sed 's/ *$//')"
    domains_input="$derived"
    if [[ -t 0 && -z "${BATS_TEST_FILENAME:-}" && -z "${CI:-}" ]]; then
        echo "Derived domains for $(basename "$FILE"): [${derived:-none}]"
        echo "Press Enter to accept, or type override (space-separated from: $CANON_ROLES):"
        read -r override_input
        [[ -n "$override_input" ]] && domains_input="$override_input"
    fi
    domains_yaml="$(_domains_to_yaml "$domains_input")"
    [[ "$domains_yaml" == "[]" ]] && \
        echo "WARNING: no domain signals found — plan will be invisible to every role until domains are set." >&2
    tmpfile="$(mktemp)"
    {
        printf '%s\n' "---"
        printf 'title: %s\n' "$title"
        tid_new="$(_derive_ticket_id)"
        if [[ -n "$tid_new" ]]; then printf 'ticket_id: %s\n' "$tid_new"; else printf 'ticket_id: null\n'; fi
        printf 'domains: %s\n' "$domains_yaml"
        printf 'status: active\n'
        printf 'pr_number: null\n'
        printf 'file_locks: []\n'
        printf 'shared_changes: false\n'
        printf 'batch_id: null\n'
        printf 'parent_feature: null\n'
        printf 'depends_on_plans: []\n'
        printf '%s\n\n' "---"
        cat "$FILE"
    } > "$tmpfile"
    mv "$tmpfile" "$FILE"
    echo "Added frontmatter to $FILE"
    exit 0
fi

# ── Case B/C: frontmatter present → check the routing-critical fields ──
dom_raw="$(_fm_field domains | tr -d ' \t\r')"
st_raw="$(_fm_field status | tr -d ' \t\r')"
fl_raw="$(_fm_field file_locks | tr -d ' \t\r')"
tid_raw="$(_fm_field ticket_id | tr -d ' \t\r')"

needs_domains=0
case "$dom_raw" in ""|"[]"|"null") needs_domains=1 ;; esac
needs_status=0
case "$st_raw" in ""|"null") needs_status=1 ;; esac
[[ "$FORCE_ACTIVE" -eq 1 ]] && needs_status=1
needs_batch=0
[[ -z "$fl_raw" ]] && needs_batch=1
# Fill a null/missing ticket_id ONLY when one is derivable — a slug-less plan
# with a deliberate `ticket_id: null` must stay a clean no-op (idempotency).
tid_derived="$(_derive_ticket_id)"
needs_ticket=0
case "$tid_raw" in ""|"null") [[ -n "$tid_derived" ]] && needs_ticket=1 ;; esac

if [[ "$needs_domains" -eq 0 && "$needs_status" -eq 0 && "$needs_batch" -eq 0 && "$needs_ticket" -eq 0 ]]; then
    echo "Frontmatter already complete in $FILE — nothing to do."
    exit 0
fi

derived="$(_body | _derive_domains | tr '\n' ' ' | sed 's/ *$//')"
derived_yaml="$(_domains_to_yaml "$derived")"
[[ "$needs_domains" -eq 1 && "$derived_yaml" == "[]" ]] && \
    echo "WARNING: domains is empty and no signals found in $FILE — set domains manually." >&2

tmpfile="$(mktemp)"
awk -v derived="$derived_yaml" -v needs_dom="$needs_domains" \
    -v needs_st="$needs_status" -v needs_batch="$needs_batch" \
    -v tid="$tid_derived" -v needs_ticket="$needs_ticket" '
    BEGIN { infm=0; dom_seen=0; st_seen=0; batch_seen=0; tid_seen=0 }
    { sub(/\r$/,"") }
    NR==1 && $0=="---" { print; infm=1; next }
    infm==1 && $0=="---" {
        if (needs_dom==1    && dom_seen==0)    print "domains: " derived
        if (needs_st==1     && st_seen==0)     print "status: active"
        if (needs_ticket==1 && tid_seen==0)    print "ticket_id: " tid
        if (needs_batch==1 && batch_seen==0) {
            print "file_locks: []"
            print "shared_changes: false"
            print "batch_id: null"
            print "parent_feature: null"
            print "depends_on_plans: []"
        }
        print; infm=0; next
    }
    infm==1 && $0 ~ /^ticket_id:/ {
        tid_seen=1
        if (needs_ticket==1) { print "ticket_id: " tid } else { print }
        next
    }
    infm==1 && $0 ~ /^domains:/ {
        dom_seen=1
        if (needs_dom==1) { print "domains: " derived } else { print }
        next
    }
    infm==1 && $0 ~ /^status:/ {
        st_seen=1
        if (needs_st==1) { print "status: active" } else { print }
        next
    }
    infm==1 && $0 ~ /^file_locks:/ { batch_seen=1; print; next }
    { print }
' "$FILE" > "$tmpfile"
mv "$tmpfile" "$FILE"
echo "Repaired frontmatter in $FILE (domains=$derived_yaml needs_status=$needs_status needs_batch=$needs_batch)"
