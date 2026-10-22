#!/usr/bin/env bash
# scripts/lib/agent-sandbox.sh — fuehrt einen Coding-Agenten mit Shell-Tool in
# einer bubblewrap-Sandbox aus. Gedacht fuer Messlaeufe, die ein Modell mit
# --no-approve und bash-Tool unbeaufsichtigt arbeiten lassen (pi-swarm.sh,
# harness-ctx-compare.sh): was das Modell per bash ausfuehrt, darf nur den
# eigenen Worktree veraendern und keine Zugangsdaten des Betreibers lesen.
#
#   agent_sandbox_run <arbeitsverzeichnis> [--rw <pfad>]... [--env <NAME>]... [--timeout <sek>] -- <befehl> [args...]
#
# Grenzen der Sandbox:
#   - Dateisystem: alles read-only; schreibbar sind nur das Arbeitsverzeichnis
#     (ohne dessen .git) und jedes --rw. /tmp ist leer und privat.
#   - Alles, was der Agent geschrieben hat, ist danach unvertrauenswuerdig:
#     Tests darauf ebenfalls per agent_sandbox_run ausfuehren, nie direkt.
#   - $HOME ist ein leeres tmpfs (keine ~/.ssh, ~/.config, ~/.kube, Tokens).
#     Laufzeit-Verzeichnisse unter $HOME, in denen der Befehl selbst, node oder
#     bun liegen (z. B. ~/.bun, ~/.nvm), werden read-only zurueckgebunden;
#     weitere per AGENT_SANDBOX_RO="pfad1:pfad2".
#   - Umgebung: geleert bis auf PATH, HOME, LANG, LC_ALL, TERM, TMPDIR und die
#     per --env durchgereichten Namen.
#   - /run und /mnt sind leere tmpfs: dort liegen Docker-API (/run/docker.sock),
#     D-Bus, /run/WSL und die Windows-Laufwerke (/mnt/c) — read-only verhindert
#     kein connect() auf einen Unix-Socket. Einzige Ausnahme ist das Verzeichnis,
#     auf das /etc/resolv.conf zeigt (z. B. /run/systemd/resolve), read-only.
#     Ein Worktree unter /mnt bleibt nutzbar (--bind legt den Mountpunkt neu an).
#   - Netz: bleibt geteilt — der Agent muss den lokalen Modell-Proxy auf
#     127.0.0.1 erreichen. Ausgehende Verbindungen sind NICHT gesperrt. TCP-Dienste
#     auf localhost und abstrakte Unix-Sockets (teilen den Netz-Namespace) bleiben
#     erreichbar.
#
# Ohne lauffaehiges bwrap bricht der Aufruf ab (Exit 3). AGENT_SANDBOX=off
# schaltet die Sandbox bewusst ab und warnt dabei auf stderr.

# Exit 0, wenn Agenten gestartet werden duerfen (bwrap lauffaehig oder bewusst
# AGENT_SANDBOX=off); sonst Meldung und Exit 3. Fuer Skripte, die vor dem Start
# teurer Vorbereitung (Proxys, Worktrees) abbrechen wollen.
agent_sandbox_check() {
  [ "${AGENT_SANDBOX:-on}" = "off" ] && return 0
  if ! command -v bwrap >/dev/null 2>&1 || ! bwrap --ro-bind / / --dev /dev --proc /proc true 2>/dev/null; then
    echo "FEHLER: bwrap (bubblewrap) fehlt oder darf keine Namespaces anlegen — Agent wird nicht gestartet." >&2
    echo "        Installieren: apt install bubblewrap. Bewusst ohne Sandbox: AGENT_SANDBOX=off" >&2
    return 3
  fi
}

agent_sandbox_run() {
  local wd="$1"; shift
  local -a rw=() envs=() limit=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --rw) rw+=("$2"); shift 2 ;;
      --env) envs+=("$2"); shift 2 ;;
      --timeout) limit=(timeout "$2"); shift 2 ;;
      --) shift; break ;;
      *) echo "agent_sandbox_run: unbekannte Option '$1'" >&2; return 2 ;;
    esac
  done
  [ "$#" -gt 0 ] || { echo "agent_sandbox_run: kein Befehl nach --" >&2; return 2; }

  if [ "${AGENT_SANDBOX:-on}" = "off" ]; then
    echo "WARNUNG: AGENT_SANDBOX=off — Agent laeuft ohne Sandbox mit vollen Rechten" >&2
    ( cd "$wd" && exec "${limit[@]}" "$@" )
    return
  fi
  agent_sandbox_check || return

  local home="${HOME:-/root}" p top
  # --new-session: kein Zugriff auf das Terminal des Aufrufers (TIOCSTI).
  local -a args=(--die-with-parent --new-session --unshare-all --share-net
    --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --tmpfs /run --tmpfs /mnt --tmpfs "$home")

  # Laufzeit unter $HOME (Befehl, node, bun) read-only zurueckbinden.
  local -a ro=()
  for p in "$1" node bun; do
    p="$(command -v "$p" 2>/dev/null)" || continue
    p="$(realpath "$p" 2>/dev/null)" || continue
    case "$p" in
      "$home"/*) top="${p#"$home"/}"; ro+=("$home/${top%%/*}") ;;
    esac
  done
  # DNS: /etc/resolv.conf zeigt oft nach /run (systemd-resolved); das tmpfs
  # wuerde das Ziel verdecken, also dessen Verzeichnis read-only zurueckbinden.
  p="$(realpath /etc/resolv.conf 2>/dev/null)" && case "$p" in
    /run/*) ro+=("$(dirname "$p")") ;;
  esac
  # Python-User-Site (pip install --user) liegt unter $HOME und wuerde vom
  # tmpfs verdeckt; ohne sie fehlt z. B. ein per --user installiertes pytest.
  # Quelle ist der aufgeloeste Pfad, Ziel der Pfad, den python selbst erwartet.
  local site="" site_real=""
  case "$(basename "$1")" in
    python|python3*)
      site="$("$1" -c 'import site; print(site.getusersitepackages())' 2>/dev/null)" &&
        site_real="$(realpath "$site" 2>/dev/null)" || site="" ;;
  esac
  local IFS_OLD="$IFS"; IFS=':'
  for p in ${AGENT_SANDBOX_RO:-}; do [ -n "$p" ] && ro+=("$p"); done
  IFS="$IFS_OLD"

  # Git-Worktree: Objektbestand und Verwaltungsdaten nur lesbar. Schreibbar waeren
  # sie eine Hintertuer aus der Sandbox: eine umgebogene .git-Datei oder ein
  # core.fsmonitor in der Worktree-Config liefe beim naechsten git-Aufruf des
  # Betreibers ausserhalb der Sandbox. Der Agent kann lesen und diffen, aber nicht
  # committen; der Index wird nicht aufgefrischt.
  local gitdir common
  local -a ro_after=()
  if gitdir="$(git -C "$wd" rev-parse --absolute-git-dir 2>/dev/null)"; then
    common="$(cd "$wd" && realpath "$(git rev-parse --git-common-dir)")"
    ro+=("$common")
    ro_after+=("$gitdir")
    [ -e "$wd/.git" ] && ro_after+=("$wd/.git")
  fi

  for p in "${ro[@]}"; do [ -e "$p" ] && args+=(--ro-bind "$p" "$p"); done
  [ -n "$site" ] && [ -d "$site_real" ] && args+=(--ro-bind "$site_real" "$site")
  for p in "$wd" "${rw[@]}"; do args+=(--bind "$p" "$p"); done
  for p in "${ro_after[@]}"; do args+=(--ro-bind "$p" "$p"); done

  args+=(--clearenv --setenv HOME "$home" --setenv TMPDIR /tmp --setenv PWD "$wd")
  for p in PATH LANG LC_ALL TERM "${envs[@]}"; do
    [ -n "${!p+x}" ] && args+=(--setenv "$p" "${!p}")
  done
  args+=(--chdir "$wd")

  bwrap "${args[@]}" -- "${limit[@]}" "$@" </dev/null
}
