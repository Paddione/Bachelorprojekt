#!/usr/bin/env bash
set -euo pipefail
# Purpose: Lint GitHub Actions workflows (T003008)
ACTIONLINT_VERSION=1.7.7
if ! command -v actionlint >/dev/null 2>&1; then
  if [ "${ACTIONLINT_AUTO_INSTALL:-0}" = "1" ]; then
    cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/actionlint/${ACTIONLINT_VERSION}"
    bin="${cache_dir}/actionlint"
    if [ ! -x "$bin" ]; then
      mkdir -p "$cache_dir"
      curl -sSfL "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" | tar -xz -C "$cache_dir" actionlint
    fi
    exec "$bin" -shellcheck= -pyflakes= -color
  fi
  echo "actionlint ${ACTIONLINT_VERSION} nicht gefunden. Installation:" >&2
  echo "  curl -sSfL https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz | tar -xz -C /tmp actionlint && install -m 0755 /tmp/actionlint ~/.local/bin/actionlint" >&2
  exit 1
fi
exec actionlint -shellcheck= -pyflakes= -color
