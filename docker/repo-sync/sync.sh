#!/bin/sh
# docker/repo-sync/sync.sh — haelt den Checkout auf dem dev-pod-repo-PVC aktuell.
#
# Dieser Container ist der EINZIGE Schreiber des Volumes (Spec: "The repository
# checkout is supplied read-only from a single writer"). Alle konsumierenden
# Container mounten dasselbe Volume mit readOnly: true.
#
# Der Checkout ueberlebt einen Neustart: existiert er bereits, wird nur
# fetch+reset gefahren. Ein Neustart haengt damit nicht daran, dass das
# git-Remote gerade erreichbar ist — die Server starten gegen den vorhandenen
# Stand und der naechste Tick holt nach.
set -u

REPO_DIR="${REPO_DIR:-/workspace/repo}"
REPO_URL="${REPO_URL:-https://github.com/paddione/Bachelorprojekt.git}"
REPO_REF="${REPO_REF:-main}"
INTERVAL="${SYNC_INTERVAL_SECONDS:-300}"

log() { echo "[repo-sync] $*"; }

if [ ! -d "$REPO_DIR/.git" ]; then
  log "kein Checkout unter $REPO_DIR — clone $REPO_URL ($REPO_REF)"
  if ! git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$REPO_DIR"; then
    log "FEHLER: clone fehlgeschlagen — der Sidecar laeuft weiter und versucht es erneut"
  fi
fi

while true; do
  if [ -d "$REPO_DIR/.git" ]; then
    if git -C "$REPO_DIR" fetch --depth 1 origin "$REPO_REF" 2>&1 \
       && git -C "$REPO_DIR" reset --hard "origin/$REPO_REF" 2>&1; then
      log "synchronisiert auf $(git -C "$REPO_DIR" rev-parse --short HEAD)"
    else
      log "WARN: fetch/reset fehlgeschlagen — bestehender Checkout bleibt unveraendert"
    fi
  else
    log "WARN: $REPO_DIR ist kein git-Checkout — erneuter clone-Versuch"
    git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$REPO_DIR" || true
  fi
  sleep "$INTERVAL"
done
