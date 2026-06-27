# Non-interactive promote phases. Sourced by feature-promote.sh and vda.sh promote.
# No prompt/select — pure execution functions.

# In dry-run mode, side-effect commands are echoed with a [dry-run] prefix
# instead of executed. Read-only commands (kubectl get, etc.) still run so
# diagnostic output stays accurate.
run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

svc_image_repo() {
  local svc="$1" cluster="$2"
  case "$svc" in
    website)
      # Shared brand-neutral image since T001229 Phase 2 (WEBSITE_IMAGE=website,
      # PR #2167): both brands deploy the same ghcr.io/paddione/website.
      echo "ghcr.io/paddione/website" ;;
    brett) echo "ghcr.io/paddione/workspace-brett" ;;

    docs)  echo "ghcr.io/paddione/workspace-docs" ;;
  esac
}

svc_deployment() {
  case "$1" in
    website) echo "website" ;;
    brett)   echo "brett" ;;
    docs)    echo "docs" ;;
  esac
}

# Dev context/namespace per cluster.
dev_ctx() { case "$1" in mentolder) echo "k3d-mentolder-dev" ;; korczewski) echo "k3d-mentolder-dev" ;; esac; }
dev_ns()  { case "$1" in mentolder) echo "workspace-dev"    ;; korczewski) echo "workspace-korczewski-dev" ;; esac; }

# Prod context resolved via env-resolve.sh → always "fleet".
prod_ctx() {
  source "${REPO}/scripts/env-resolve.sh" "$1" >/dev/null 2>&1; echo "${ENV_CONTEXT:-fleet}"; }
prod_ns() {
  local svc="$1" cluster="$2"
  if [[ "$svc" == "website" ]]; then
    [[ "$cluster" == "mentolder" ]] && echo "website" || echo "website-korczewski"
  else
    [[ "$cluster" == "mentolder" ]] && echo "workspace" || echo "workspace-korczewski"
  fi
}

default_smoke_grep() {
  case "$1" in
    website) echo 'fa-fragebogen|.*-auth-setup|fa-07-' ;;
    brett)   echo 'brett-duel-mode|fa-27-brett' ;;
    docs)    echo '' ;;
  esac
}

resolve_smoke_grep() {
  local svc="$1" cfg="${REPO}/tests/e2e/smoke/${svc}.txt"
  if [[ -n "${SMOKE_GREP_OVERRIDE:-}" ]]; then echo "$SMOKE_GREP_OVERRIDE"; return; fi
  if [[ -f "$cfg" ]]; then
    grep -vE '^\s*(#|$)' "$cfg" | paste -sd '|' -
    return
  fi
  default_smoke_grep "$svc"
}

roll() {
  local stage="$1" cluster="$2" full="$3" svc="${SERVICE:-}"
  local ctx ns deploy
  deploy=$(svc_deployment "$svc")
  if [[ "$stage" == "dev" ]]; then
    ctx=$(dev_ctx "$cluster"); ns=$(dev_ns "$cluster")
  else
    ctx=$(prod_ctx "$cluster"); ns=$(prod_ns "$svc" "$cluster")
  fi

  echo "▸ ${stage}/${cluster}: set image deploy/${deploy} → ${full}"
  if ! run kubectl --context "$ctx" -n "$ns" set image "deploy/${deploy}" "${deploy}=${full}"; then
    echo "✗ set image failed on ${stage}/${cluster} (deploy/${deploy} may not exist yet)" >&2
    return 1
  fi

  if run kubectl --context "$ctx" -n "$ns" rollout status "deploy/${deploy}" --timeout="${ROLLBACK_TIMEOUT:-180s}"; then
    return 0
  fi

  echo "✗ Rollout FAILED on ${stage}/${cluster} — auto-rolling back…" >&2
  run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" || true
  run kubectl --context "$ctx" -n "$ns" rollout status "deploy/${deploy}" --timeout=120s || true
  echo "↩ Rolled back ${stage}/${cluster} to previous ReplicaSet." >&2
  return 1
}

observe_prod() {
  local cluster="$1" full="$2" svc="${SERVICE:-}"
  local deploy ns ctx prev_rev live grep_pat
  deploy=$(svc_deployment "$svc")

  source "${REPO}/scripts/env-resolve.sh" "$cluster" >/dev/null
  ctx="$ENV_CONTEXT"
  ns=$(prod_ns "$svc" "$cluster")

  case "$cluster" in
    mentolder)  live="https://web.mentolder.de" ;;
    korczewski) live="https://web.korczewski.de" ;;
  esac

  prev_rev=$(run kubectl --context "$ctx" -n "$ns" rollout history "deploy/${deploy}" \
              2>/dev/null | awk 'NF && $1 ~ /^[0-9]+$/ {r=$1} END{print r-1}')
  [[ -z "$prev_rev" || "$prev_rev" -lt 1 ]] && prev_rev=""

  echo "▸ Canary observe prod/${cluster}: post-deploy-watch + smoke (${live}, rev=${prev_rev:-<none>})"

  if ! post_deploy_watch "$cluster" "$deploy" "$ns" "$ctx" "${live}/api/health"; then
    echo "✗ post-deploy-watch FAILED on prod/${cluster} — rollback already triggered" >&2
    return 1
  fi

  grep_pat=$(resolve_smoke_grep "$svc")
  if [[ -n "$grep_pat" ]]; then
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  [dry-run] playwright --grep '${grep_pat}' against ${live}"
    elif ! smoke_one "$cluster" "$grep_pat"; then
      echo "✗ Canary RED on prod/${cluster} — rolling back ${deploy} to revision ${prev_rev:-previous}…" >&2
      if [[ -n "$prev_rev" ]]; then
        run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" --to-revision="$prev_rev" || true
      else
        run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" || true
      fi
      run kubectl --context "$ctx" -n "$ns" rollout status "deploy/${deploy}" --timeout=120s || true
      notify_pushover "Deploy FAIL ${cluster}" "Playwright smoke failed on ${deploy} — rolled back to rev ${prev_rev:-previous}" "1"
      echo "↩ Canary rolled prod/${cluster} back (rev=${prev_rev:-previous})." >&2
      return 1
    fi
  fi

  echo "✓ Canary GREEN on prod/${cluster}."
  return 0
}

smoke_one() {
  local cluster="$1" grep_pat="$2"
  [[ -z "$grep_pat" ]] && return 0
  local url
  case "$cluster" in
    mentolder)  url="https://dev.mentolder.de" ;;
    korczewski) url="https://dev.korczewski.de" ;;
  esac
  echo "▸ Smoke ${url} (grep: ${grep_pat})"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "  [dry-run] (cd tests/e2e && WEBSITE_URL=$url playwright test --grep '$grep_pat' --reporter=line)"
    return 0
  fi
  if [[ ! -d "${REPO}/tests/e2e/node_modules" ]]; then
    ( cd "${REPO}/tests/e2e" && npm ci && ./node_modules/.bin/playwright install chromium )
  fi
  ( cd "${REPO}/tests/e2e" && WEBSITE_URL="$url" \
      ./node_modules/.bin/playwright test --grep "$grep_pat" --reporter=line )
}

promote_phase_build() {
  local svc="$1" cluster="$2" tag="$3"
  local repo full
  repo=$(svc_image_repo "$svc" "$cluster")
  full="${repo}:${tag}"

  echo "▸ Build ${full}" >&2
  case "$svc" in
    website) run docker build -t "$full" "${REPO}/website/" >&2 ;;
    brett)   run docker build -t "$full" "${REPO}/brett/" >&2 ;;
    docs)
      run node "${REPO}/scripts/build-docs.mjs" >&2
      run docker build -t "$full" -f "${REPO}/scripts/docs.Dockerfile" "${REPO}" >&2
      ;;
  esac
  echo "$full"
}

promote_phase_push() {
  local full="$1"
  echo "▸ Push ${full}" >&2
  run docker push "$full" >&2
}

promote_phase_dev_deploy() {
  local svc="$1" cluster="$2" full="$3"
  SERVICE="$svc" roll dev "$cluster" "$full"
}

promote_phase_smoke() {
  local svc="$1" cluster="$2"
  local grep_pat
  grep_pat=$(resolve_smoke_grep "$svc")
  smoke_one "$cluster" "$grep_pat"
}

promote_phase_prod_deploy() {
  local svc="$1" cluster="$2" full="$3"
  SERVICE="$svc" roll prod "$cluster" "$full"
}

promote_phase_observe() {
  local svc="$1" cluster="$2" full="$3"
  SERVICE="$svc" observe_prod "$cluster" "$full"
}
