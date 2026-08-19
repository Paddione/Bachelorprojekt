#!/usr/bin/env bash
# mirror-image-to-gitlab.sh — spiegelt bereits gebaute Images in die GitLab Registry [T012415]
#
# Aufgerufen aus den .github/workflows/build-*.yml, NACH dem ghcr-Push. Das Image
# wird nicht neu gebaut: `docker buildx imagetools create` kopiert das Manifest
# serverseitig, beide Registries tragen damit denselben Digest.
#
# WARUM EIN EIGENER SCHRITT statt zusaetzlicher Eintraege in der `tags:`-Liste des
# Build-Schritts: Die Tag-Liste ist atomar. Waere ein GitLab-Tag darin, wuerde ein
# GitLab-Ausfall oder ein fehlendes Token den PRIMAEREN ghcr-Push mit umreissen —
# die Redundanz wuerde die Verfuegbarkeit senken statt sie zu erhoehen. Als eigener
# Schritt mit `continue-on-error: true` kann der Spiegel fehlschlagen, ohne den
# Build zu gefaehrden.
#
# Umgebung:
#   SOURCE_TAGS             Pflicht. Newline-getrennte Liste der ghcr-Tags.
#   GITLAB_REGISTRY_PREFIX  Registry-Praefix, z.B. registry.gitlab.com/<ns>/<projekt>
#   GITLAB_REGISTRY_TOKEN   Project-Access-Token mit Scope write_registry
#
# Fehlt eine der beiden GitLab-Variablen, endet das Skript bewusst mit 0 und einer
# sichtbaren Meldung: ein noch nicht eingerichteter Spiegel darf keinen Build
# rot faerben. Fehlt SOURCE_TAGS, ist das ein Aufruffehler und endet mit 1.

set -euo pipefail

if [[ -z "${SOURCE_TAGS:-}" ]]; then
  echo "ERROR: SOURCE_TAGS ist leer — der Aufrufer muss die gepushten ghcr-Tags uebergeben." >&2
  exit 1
fi

if [[ -z "${GITLAB_REGISTRY_PREFIX:-}" || -z "${GITLAB_REGISTRY_TOKEN:-}" ]]; then
  echo "SKIP: GitLab-Registry-Spiegel nicht konfiguriert (GITLAB_REGISTRY_PREFIX und/oder"
  echo "      GITLAB_REGISTRY_TOKEN fehlen). Der ghcr-Push ist davon unberuehrt."
  exit 0
fi

# Praefix normalisieren: fuehrendes Schema und abschliessender Slash sind haeufige
# Eingabefehler und wuerden sonst zu einem ungueltigen Ziel-Tag fuehren.
prefix="${GITLAB_REGISTRY_PREFIX#https://}"
prefix="${prefix#http://}"
prefix="${prefix%/}"

# Login ueber stdin — das Token darf weder als Argument noch im Log erscheinen.
printf '%s' "$GITLAB_REGISTRY_TOKEN" \
  | docker login "${prefix%%/*}" --username oauth2 --password-stdin

mirrored=0
failed=0

while read -r src; do
  [[ -n "$src" ]] || continue

  # ghcr.io/paddione/workspace-brett:latest -> <prefix>/workspace-brett:latest
  # Nur der letzte Pfadabschnitt samt Tag wird uebernommen; der GitLab-Namespace
  # steckt bereits im Praefix.
  image_and_tag="${src##*/}"
  dst="${prefix}/${image_and_tag}"

  echo "Spiegle: ${src} -> ${dst}"
  if docker buildx imagetools create --tag "$dst" "$src"; then
    mirrored=$((mirrored + 1))
  else
    echo "WARN: Spiegeln von ${src} fehlgeschlagen — der ghcr-Push bleibt gueltig." >&2
    failed=$((failed + 1))
  fi
done <<< "$SOURCE_TAGS"

echo "Spiegel-Ergebnis: ${mirrored} kopiert, ${failed} fehlgeschlagen."

# Auch bei Teilfehlern Exit 0: der Schritt laeuft ohnehin unter continue-on-error,
# und ein roter Schritt im Build-Log wuerde die Ursache nur verschleiern. Die
# Zaehlzeile oben ist das Signal, das ein Mensch liest.
exit 0
