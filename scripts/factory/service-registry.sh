#!/usr/bin/env bash
# scripts/factory/service-registry.sh
# SSOT: maps each k3d/<file>.yaml to an `app:` slug for partial-deploy label-selection.
# Sourced by the workspace:partial-deploy task and by scripts/factory/pipeline.js.
# CONTRACT (enforced by tests/local/FA-SF-60): every k3d/*.yaml (except kustomization.yaml)
# is EITHER a SERVICE_REGISTRY key OR an INFRA_FILES entry. Add new k3d files here.

# k3d/<file>.yaml -> app slug. Multiple files may share a slug.
declare -A SERVICE_REGISTRY=(
  [k3d/brett.yaml]="brett"
  [k3d/oauth2-proxy-brett.yaml]="brett"
  [k3d/brain.yaml]="brain"
  [k3d/oauth2-proxy-brain.yaml]="brain"
  [k3d/nextcloud.yaml]="nextcloud"
  [k3d/nextcloud-redis.yaml]="nextcloud"
  [k3d/shared-db.yaml]="shared-db"
  [k3d/livekit.yaml]="livekit"
  [k3d/vaultwarden.yaml]="vaultwarden"
  [k3d/vaultwarden-seed-job.yaml]="vaultwarden"
  [k3d/vaultwarden-seed-credentials.yaml]="vaultwarden"
  [k3d/mailpit.yaml]="mailpit"
  [k3d/mail-ingressroute-dev.yaml]="mailpit"
  [k3d/oauth2-proxy-mailpit.yaml]="mailpit"
  [k3d/docs.yaml]="docs"
  [k3d/oauth2-proxy-docs.yaml]="docs"
  [k3d/whiteboard.yaml]="whiteboard"
  [k3d/talk-hpb.yaml]="talk"
  [k3d/talk-recording.yaml]="talk"
  [k3d/backup-cronjob.yaml]="backup"
  [k3d/backup-config.yaml]="backup"
  [k3d/backup-pvc.yaml]="backup"
  [k3d/backup-secrets.yaml]="backup"
  [k3d/pvc-backup-cronjob.yaml]="backup"
  [k3d/pvc-backup-rbac.yaml]="backup"
  [k3d/knowledge-ingest-cronjob.yaml]="knowledge"
  [k3d/notify-unread-cronjob.yaml]="cronjobs"
  [k3d/admin-actions-cronjobs.yaml]="cronjobs"
  [k3d/cronjob-monthly-billing.yaml]="cronjobs"
  [k3d/cronjob-dunning-detection.yaml]="cronjobs"
  [k3d/cronjob-systemtest-cleanup.yaml]="cronjobs"
  [k3d/tests-retention-cronjob.yaml]="cronjobs"
  [k3d/cronjob-scheduled-publish.yaml]="cronjobs"
  [k3d/error-log-retention-cronjob.yaml]="cronjobs"
  [k3d/einvoice-sidecar.yaml]="einvoice"
  [k3d/oauth2-proxy-comfy.yaml]="oauth2-proxy"
  [k3d/oauth2-proxy-traefik.yaml]="traefik"
  [k3d/traefik-config.yaml]="traefik"
  [k3d/traefik-dashboard-dev.yaml]="traefik"
  [k3d/ingress.yaml]="traefik"
  [k3d/claude-code-config.yaml]="claude-code"
  [k3d/claude-code-mcp-browser.yaml]="claude-code"
  [k3d/claude-code-mcp-github.yaml]="claude-code"
  [k3d/claude-code-mcp-ops.yaml]="claude-code"
  [k3d/claude-code-rbac.yaml]="claude-code"
  [k3d/sessions-server.yaml]="sessions-server"
  [k3d/pentest-flags.yaml]="pentest"
  [k3d/recovery-browser.yaml]="recovery"
  [k3d/recovery-pvc.yaml]="recovery"
  [k3d/website.yaml]="website"
  [k3d/website-rbac.yaml]="website"
  [k3d/website-schema.yaml]="website"
  [k3d/website-seller-config.yaml]="website"
  [k3d/website-dev-secrets.yaml]="website"
  [k3d/website-allow-egress-monitoring.yaml]="website"
  [k3d/website-content-token-secret.yaml]="website"
  [k3d/cicd-deploy-sa.yaml]="cicd"
  [k3d/llm-gpu.yaml]="llm-gateway"
  [k3d/mediaviewer-widget.yaml]="mediaviewer-widget"
  [k3d/oauth2-proxy-mediaviewer.yaml]="mediaviewer-widget"
  [k3d/oauth2-proxy-videovault.yaml]="videovault"
  [k3d/videovault-uploads-pvc.yaml]="videovault"
  [k3d/videovault.yaml]="videovault"
  # Pocket ID migration (#2042/#2057) + new services — classified to match app: labels
  [k3d/pocket-id.yaml]="pocket-id"
  [k3d/pocket-id-client-seed.yaml]="pocket-id"
  [k3d/pocket-id-client-seed-rbac.yaml]="pocket-id"
  [k3d/pocket-id-client-seed-website-rbac.yaml]="pocket-id"
  [k3d/studio.yaml]="studio-server"
  [k3d/oauth2-proxy-studio.yaml]="studio-server"
  [k3d/mentolder-web.yaml]="mentolder-web"
  [k3d/ntfy.yaml]="ntfy"
  [k3d/terminal-sidekick.yaml]="terminal-sidekick"
  [k3d/oauth2-proxy-terminal.yaml]="terminal-sidekick"
  # RustDesk feature (#2403/#2407)
  [k3d/downloads.yaml]="downloads"
  [k3d/oauth2-proxy-downloads.yaml]="downloads"
  [k3d/oauth2-proxy-rustdesk-web.yaml]="rustdesk-web"
)

# Infra: namespace/network/secrets/controller — ALWAYS full-deploy, never partial.
INFRA_FILES=(
  "k3d/namespace.yaml"
  "k3d/network-policies.yaml"
  "k3d/network-policies-dev.yaml"
  "k3d/configmap-domains.yaml"
  "k3d/secrets.yaml"
  "k3d/sealed-secrets-controller.yaml"
  "k3d/seed.yaml"
  "k3d/clean-seed.yaml"
)

# resolve_partial_services <csv-of-touched-files>
# Echos a comma-separated, de-duped slug list IFF a partial deploy is safe:
#   - all touched k3d/*.yaml files map to a slug (no infra, no unknown k3d file)
#   - there is at least one touched k3d service file
#   - the distinct slug count is <= PARTIAL_DEPLOY_MAX (default 5)
# Otherwise echos nothing (caller falls back to full workspace:deploy) and returns 1.
resolve_partial_services() {
  local csv="${1:-}"
  local max="${PARTIAL_DEPLOY_MAX:-5}"
  local -a files slugs=()
  IFS=',' read -r -a files <<< "$csv"
  local f saw_k3d=0
  for f in "${files[@]}"; do
    [ -z "$f" ] && continue
    case "$f" in
      k3d/*.yaml) saw_k3d=1 ;;
      *) continue ;;  # non-k3d changes are deployed by the full path anyway
    esac
    # infra touched -> abort partial
    local inf
    for inf in "${INFRA_FILES[@]}"; do [ "$inf" = "$f" ] && return 1; done
    # kustomization.yaml change -> structural, force full deploy
    [ "$f" = "k3d/kustomization.yaml" ] && return 1
    local slug="${SERVICE_REGISTRY[$f]:-}"
    [ -z "$slug" ] && return 1  # unknown k3d file -> fail safe to full deploy
    slugs+=("$slug")
  done
  [ "$saw_k3d" -eq 1 ] || return 1
  # de-dupe
  local uniq; uniq=$(printf '%s\n' "${slugs[@]}" | sort -u)
  local count; count=$(printf '%s\n' "$uniq" | grep -c .)
  [ "$count" -le "$max" ] || return 1
  printf '%s' "$(printf '%s\n' "$uniq" | paste -sd, -)"
}
