#!/usr/bin/env bash
# scripts/factory/seal-factory-secrets.sh [T016433]
# Erzeugt das SealedSecret factory-runner-secrets (ns workspace-dev) aus dem
# lokalen Operator-Umfeld. Klartext-Werte verlassen diese Maschine NICHT:
# kubectl erzeugt das Secret nur als dry-run-JSON im Speicher, kubeseal
# verschlüsselt es direkt — nichts wird an den API-Server geschickt und
# nichts auf Platte/ins Repo geschrieben.
#
# Voraussetzungen:
#   * ~/.config/factory/autopilot.env existiert (Env-Quelle des Dispatchers)
#   * bp-secrets.key (git-crypt) unter $GIT_CRYPT_KEY_PATH
#   * kubeseal installiert; sealed-secrets-controller im Cluster erreichbar
set -euo pipefail

ENV_FILE="${FACTORY_ENV_SOURCE:-$HOME/.config/factory/autopilot.env}"
GIT_CRYPT_KEY_PATH="${GIT_CRYPT_KEY_PATH:-$HOME/secrets/bp-secrets.key}"
NS="workspace-dev"
OUT="${1:?Usage: seal-factory-secrets.sh <out-sealedsecret.yaml>}"

[ -f "$ENV_FILE" ] || { echo "Fehlt: $ENV_FILE" >&2; exit 1; }
[ -f "$GIT_CRYPT_KEY_PATH" ] || { echo "Fehlt: $GIT_CRYPT_KEY_PATH" >&2; exit 1; }
command -v kubeseal >/dev/null || { echo "kubeseal nicht installiert" >&2; exit 1; }
command -v kubectl >/dev/null || { echo "kubectl nicht installiert" >&2; exit 1; }

echo "Verschlüssele (Klartext bleibt lokal)…" >&2

kubectl create secret generic factory-runner-secrets \
  --namespace "$NS" \
  --from-file=autopilot.env="$ENV_FILE" \
  --from-file=bp-secrets.key="$GIT_CRYPT_KEY_PATH" \
  --dry-run=client -o json \
| kubeseal --scope strict --format yaml >"$OUT"

chmod 600 "$OUT"
unset ENV_FILE GIT_CRYPT_KEY_PATH
echo "OK: $OUT geschrieben. Inhalt prüfen und committen (nur Sealed-Daten)." >&2
