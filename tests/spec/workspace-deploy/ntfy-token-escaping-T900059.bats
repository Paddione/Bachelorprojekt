#!/usr/bin/env bats
# tests/spec/workspace-deploy/ntfy-token-escaping-T900059.bats
# SSOT: openspec/specs/workspace-deploy.md
# Covers T900059 (chore, NTFY/PUSHOVER-Teilscope): k3d/ntfy.yaml Z48/50 must
# carry the runtime tokens as $${...} (escaped), so a future envsubst
# allowlist/render path cannot silently substitute them to empty strings.
# After the pipeline unescape-sed (Taskfile workspace:deploy dev branch +
# scripts/flux-render-artifact.sh) the applied manifest holds exactly the
# literal ${...} the container shell expands at runtime — no behavior change.
#
# Pruefmodus: Querschnitt (Source-Grep + Offline-Render) — das Ergebnis
# manifestiert sich im Quelltext bzw. im gerenderten Output, nicht in einem
# laufenden Cluster; grep ist hier das angemessene Mittel.

load '../test_helper'

NTFY_MANIFEST="${PROJECT_DIR}/k3d/ntfy.yaml"
SCHEMA="${PROJECT_DIR}/environments/schema.yaml"
TASKFILE="${PROJECT_DIR}/Taskfile.yml"
FLUX_RENDER="${PROJECT_DIR}/scripts/flux-render-artifact.sh"

# Full deploy-pipeline over the two token lines: re-quote sed, envsubst with
# today's deploy-like allowlist (PROD_DOMAIN + SMTP set, NTFY_TOKEN_* and
# PUSHOVER_* bewusst NICHT enthalten), unescape sed. Must yield the literal
# ${...} placeholders the ntfy init-container shell expands at runtime.
_render_token_lines() {
  grep -E 'ntfy token add' "$NTFY_MANIFEST" \
    | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
    | PROD_DOMAIN=example.org SMTP_HOST=smtp.example.org SMTP_PORT=587 \
      SMTP_USER=x POCKET_ID_SMTP_TLS=starttls \
      envsubst '$PROD_DOMAIN $SMTP_HOST $SMTP_PORT $SMTP_USER $POCKET_ID_SMTP_TLS' \
    | sed -E 's/\$\$([a-zA-Z0-9_({!?])/$\1/g'
}

@test "T900059: k3d/ntfy.yaml carries both tokens escaped as \$/$\${...} (revert guard)" {
  # Positiv-Anker: die escapte Form MUSS da sein — sonst bestuende die
  # Negativ-Aussage unten vakuos (z. B. wenn die Zeilen ganz fehlen).
  run grep -c -F '"$${NTFY_TOKEN_OPENCODE}"' "$NTFY_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]
  run grep -c -F '"$${NTFY_TOKEN_AGY}"' "$NTFY_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]

  # Negativ-Aussage: keine unescapte single-${}-Form mehr (Revert auf
  # "${NTFY_TOKEN_...}" ohne Escape muss rot werden).
  local unescaped
  unescaped="$(sed 's/\$\$//g' "$NTFY_MANIFEST" | grep -F '"${NTFY_TOKEN_' || true)"
  [ -z "$unescaped" ]
}

@test "T900059: ntfy tokens survive the full deploy pipeline as literal \${...}" {
  local rendered
  rendered="$(_render_token_lines)"
  [[ "$rendered" == *'ntfy token add opencode "${NTFY_TOKEN_OPENCODE}"'* ]]
  [[ "$rendered" == *'ntfy token add agy "${NTFY_TOKEN_AGY}"'* ]]
  local emptied
  emptied="$(printf '%s\n' "$rendered" | grep -c 'ntfy token add [^ ]* ""' || true)"
  [ "$emptied" -eq 0 ]
}

@test "T900059: schema.yaml provides NTFY_TOKEN_* and PUSHOVER_* (verify-only)" {
  for key in NTFY_TOKEN_OPENCODE NTFY_TOKEN_AGY PUSHOVER_USER PUSHOVER_TOKEN; do
    run grep -qE "^[[:space:]]+- name: ${key}$" "$SCHEMA"
    [ "$status" -eq 0 ] || {
      echo "FAIL: environments/schema.yaml misses entry: $key"
      return 1
    }
  done
}

@test "T900059: both render pipelines keep the \$'\$'-unescape stage (escape resolves)" {
  # Taskfile workspace:deploy dev branch (kustomize build k3d/ | ... | envsubst | sed | kubectl apply).
  # Pattern ohne Backslashes: das Unescape-sed ist das einzige mit der
  # Zeichenklasse ({!?] (T012503) — so umgeht der Test das
  # Double-Quote-Backslash-Problem von bash -c.
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build k3d\//,/kubectl apply/p' | grep -c -F '({!?])/$\1/g'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # Flux renderer (prod/GitOps path)
  run grep -c -F 's/\$\$([a-zA-Z0-9_({!?])/$\1/g' "$FLUX_RENDER"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
