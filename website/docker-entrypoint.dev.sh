#!/usr/bin/env bash
# Entrypoint des lokalen Dev-Containers (T003055).
#
# Aufgabe: die .env des Hosts unverändert brauchbar machen. website/.env zeigt auf
# 127.0.0.1-Ports, die von `kubectl port-forward` auf der WSL-Distro bereitgestellt
# werden. Im Container ist 127.0.0.1 ein anderer Netzwerk-Namespace — die Adressen
# müssen deshalb zur Laufzeit auf host.docker.internal umgeschrieben werden.
#
# Bewusst hier statt in compose.dev.yaml: die URLs enthalten Zugangsdaten. Ein
# Override in der Compose-Datei müsste sie im Klartext wiederholen und damit ins
# Repository schreiben. Dieses Skript ersetzt nur den Host-Teil und lässt
# Benutzername und Passwort unberührt.
set -euo pipefail

log() { printf '[dev-entrypoint] %s\n' "$*" >&2; }

# ── 1. Secret-Guard ───────────────────────────────────────────────────────────
# website/src/lib/auth.ts wirft beim Import, wenn diese Variable fehlt — allerdings
# erst tief im Vite-Modulgraphen, mit einem Stacktrace voller node_modules-Frames.
# Der Guard hier bricht früher und mit einer Meldung ab, die die Ursache benennt.
if [[ -z "${POCKET_ID_WEBSITE_SECRET:-}${WEBSITE_OIDC_SECRET:-}" ]]; then
  log "FATAL: POCKET_ID_WEBSITE_SECRET ist nicht gesetzt."
  log "       Der Container bekommt seine Variablen aus website/.env via env_file."
  log "       Pruefen: existiert website/.env und enthaelt sie den Schluessel?"
  log "       Vorlage: website/.env.example"
  exit 1
fi

# ── 2. Loopback-Adressen auf den Docker-Host umbiegen ─────────────────────────
# NUR serverseitig ausgehende Verbindungen. SITE_URL und POCKET_ID_FRONTEND_URL
# bleiben absichtlich unangetastet: sie werden an den Browser ausgeliefert
# (OIDC-Redirect, Links). Fuer den Browser auf deinem Host ist localhost korrekt —
# host.docker.internal waere dort nicht aufloesbar und wuerde den Login brechen.
HOST_ALIAS="${DEV_CONTAINER_HOST_ALIAS:-host.docker.internal}"

rewrite_loopback() {
  local var_name="$1"
  local value="${!var_name:-}"
  [[ -n "$value" ]] || return 0

  local rewritten="${value//127.0.0.1/$HOST_ALIAS}"
  rewritten="${rewritten//localhost/$HOST_ALIAS}"

  if [[ "$rewritten" != "$value" ]]; then
    export "$var_name=$rewritten"
    # Nur den Host-Teil loggen — der Rest der URL enthaelt Zugangsdaten.
    log "$var_name -> $HOST_ALIAS (war Loopback)"
  fi
}

for var in DATABASE_URL SESSIONS_DATABASE_URL POCKET_ID_URL; do
  rewrite_loopback "$var"
done

# ── 3. Abhaengigkeiten gegen das Lockfile pruefen ─────────────────────────────
# Kontext: node_modules liegt in einem ANONYMEN VOLUME, nicht im Bind-Mount. Das
# ist notwendig, damit die im Container fuer musl gebauten Binaries nicht von den
# glibc-Binaries deines Hosts ueberdeckt werden. Der Preis: das Volume ueberlebt
# `docker compose up` und veraltet still, sobald jemand pnpm-lock.yaml aendert
# (Branch-Wechsel, git pull, Renovate-PR). Das Bind-Mount-Lockfile und die
# installierten Pakete laufen dann auseinander, ohne dass etwas sichtbar bricht —
# bis ein Import zur Laufzeit fehlschlaegt.
#
# Strategie: Hash des Lockfiles neben den installierten Paketen ablegen und bei
# jedem Start vergleichen. Kostet im Normalfall einen sha256sum (~Millisekunden)
# und installiert nur nach, wenn sich wirklich etwas geaendert hat. Die Alternative
# "immer installieren" waere ebenso korrekt, kostete aber 10-30 s bei JEDEM Start.
#
# Die Stempeldatei liegt bewusst IM Volume (/app/node_modules/...), nicht im
# Bind-Mount: sie beschreibt den Zustand des Volumes. Ein `docker compose down -v`
# entfernt beide gemeinsam, wodurch der naechste Start sauber neu installiert.
# Der Erststempel entsteht bereits im Image (siehe Dockerfile.dev), damit der
# allererste Start nicht unnoetig nachinstalliert.
ensure_dependencies_current() {
  local lockfile="/app/pnpm-lock.yaml"
  local stamp="/app/node_modules/.dev-container-lock-hash"

  if [[ ! -f "$lockfile" ]]; then
    log "WARN: $lockfile fehlt — ueberspringe Abhaengigkeitspruefung."
    return 0
  fi

  local current
  current="$(sha256sum "$lockfile" | cut -d' ' -f1)"

  if [[ -f "$stamp" && "$(cat "$stamp")" == "$current" ]]; then
    return 0
  fi

  log "pnpm-lock.yaml weicht vom Volume-Stand ab — installiere nach..."
  pnpm install --frozen-lockfile
  printf '%s\n' "$current" >"$stamp"
  log "Abhaengigkeiten sind wieder auf dem Stand des Lockfiles."
}

ensure_dependencies_current

# ── 4. Uebergabe an das CMD ───────────────────────────────────────────────────
log "starte: $*"
exec "$@"
