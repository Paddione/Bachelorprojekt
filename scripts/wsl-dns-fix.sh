#!/usr/bin/env bash
# scripts/wsl-dns-fix.sh — pin stable upstream resolvers for WSL host processes.
#
# Symptom (beobachtet): `git push` und Subagenten-Calls scheitern transient mit
# "Could not resolve host: github.com". Ursache: resolv.conf zeigt auf den
# WSL-NAT-Gateway (10.255.255.254), dessen DNS flaky ist — es betrifft jeden
# Host-Prozess gleich.
#
# Fix: [network] generateResolvConf=false in /etc/wsl.conf (WSL ueberschreibt
# die Datei dann nicht mehr) + /etc/resolv.conf manuell mit stabilen
# Nameservern (dieselben, die die Factory-Sandbox ohnehin erlaubt).
#
# Benoetigt root via `sudo -n` (nicht-interaktiv — blockiert nie auf einem
# Passwort-Prompt). Idempotent; die Originals sind als *.bak.<epoch> sicherbar.
#
# Usage:
#   scripts/wsl-dns-fix.sh            # --check: Status berichten, nichts aendern
#   scripts/wsl-dns-fix.sh --apply    # Fix anwenden (root noetig)
set -uo pipefail

NAMESERVERS=(1.1.1.1 8.8.8.8)
WSL_CONF="/etc/wsl.conf"
RESOLV_CONF="/etc/resolv.conf"
WSL_NAT_GW='10.255.255.254'

is_wsl() {
  [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null
}

conf_generates_resolv() {
  # generateResolvConf fehlt => Default true => WSL generiert die Datei neu.
  [[ -f "$WSL_CONF" ]] || return 0
  if grep -qE '^[[:space:]]*generateResolvConf[[:space:]]*=' "$WSL_CONF"; then
    grep -qE '^[[:space:]]*generateResolvConf[[:space:]]*=[[:space:]]*false' "$WSL_CONF" \
      && return 1 || return 0
  fi
  return 0
}

resolv_needs_fix() {
  # Noch vom NAT-Gateway oder systemd-Stub erzeugt => unsere Resolver fehlen.
  if grep -qE '^[[:space:]]*nameserver[[:space:]]+('"${WSL_NAT_GW//./\.}"'|127\.0\.0\.53)' "$RESOLV_CONF" 2>/dev/null; then
    return 0
  fi
  for ns in "${NAMESERVERS[@]}"; do
    grep -qE "^[[:space:]]*nameserver[[:space:]]+${ns//./\.}" "$RESOLV_CONF" 2>/dev/null && return 1
  done
  return 0
}

needs_fix() {
  conf_generates_resolv || resolv_needs_fix
}

update_wsl_conf() {
  local tmp; tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  if [[ -f "$WSL_CONF" ]] && grep -qE '^[[:space:]]*generateResolvConf[[:space:]]*=' "$WSL_CONF"; then
    sed -E 's/^([[:space:]]*)generateResolvConf[[:space:]]*=.*/\1generateResolvConf = false/' "$WSL_CONF" > "$tmp"
  elif [[ -f "$WSL_CONF" ]] && grep -qE '^\[network\]' "$WSL_CONF"; then
    sed -E '/^\[network\]/a generateResolvConf = false' "$WSL_CONF" > "$tmp"
  else
    {
      [[ -f "$WSL_CONF" ]] && cat "$WSL_CONF"
      printf '\n[network]\ngenerateResolvConf = false\n'
    } > "$tmp"
  fi
  sudo -n tee "$WSL_CONF" < "$tmp" >/dev/null
}

write_resolv() {
  local search_line
  search_line="$(awk '/^search /{$1="";sub(/^[[:space:]]+/,"");print}' "$RESOLV_CONF" 2>/dev/null)"
  local tmp; tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  {
    echo "# Managed by scripts/wsl-dns-fix.sh — generateResolvConf=false in /etc/wsl.conf."
    [[ -n "$search_line" ]] && echo "search ${search_line}"
    for ns in "${NAMESERVERS[@]}"; do
      echo "nameserver ${ns}"
    done
  } > "$tmp"
  # resolv.conf ist in WSL oft ein Symlink auf /mnt/wsl/resolv.conf — als
  # Symlink wuerde der Tipp der generierten Datei wieder ueberschrieben.
  sudo -n rm -f "$RESOLV_CONF"
  sudo -n tee "$RESOLV_CONF" < "$tmp" >/dev/null
}

print_status() {
  if ! is_wsl; then
    echo "wsl-dns-fix: not WSL — nothing to do"
    return 0
  fi
  local resolv_hosts
  resolv_hosts="$(awk '/^[[:space:]]*nameserver/{printf "%s ",$2}' "$RESOLV_CONF" 2>/dev/null)"
  if needs_fix; then
    echo "wsl-dns-fix: FLAKY DNS CONFIG DETECTED"
    echo "  wsl.conf generateResolvConf: $(conf_generates_resolv && echo true || echo false)"
    echo "  resolv.conf nameservers:     ${resolv_hosts:-<none>} (NAT-Gateway ${WSL_NAT_GW}/systemd-Stub)"
    echo "  fix:  sudo scripts/wsl-dns-fix.sh --apply   (dann 'wsl --shutdown' aus Windows)"
    return 1
  fi
  echo "wsl-dns-fix: OK — resolv.conf pinned to stable resolvers (${resolv_hosts% })"
  return 0
}

case "${1:---check}" in
  --check)
    if ! is_wsl; then exit 0; fi
    if needs_fix; then
      print_status
      exit 1
    fi
    print_status
    ;;
  --apply)
    if ! is_wsl; then
      echo "wsl-dns-fix: not WSL — nothing to apply"
      exit 0
    fi
    if ! sudo -n true 2>/dev/null; then
      echo "wsl-dns-fix: root required (no passwordless sudo) — run with sudo: sudo $0 --apply" >&2
      exit 2
    fi
    if [[ -f "$WSL_CONF" ]]; then
      sudo -n cp -a "$WSL_CONF" "$WSL_CONF.bak.$(date +%s)"
    fi
    if [[ -e "$RESOLV_CONF" || -L "$RESOLV_CONF" ]]; then
      sudo -n cp -a "$RESOLV_CONF" "$RESOLV_CONF.bak.$(date +%s)"
    fi
    update_wsl_conf
    write_resolv
    echo "wsl-dns-fix: applied — resolv.conf pinned; restart WSL (wsl --shutdown) once so wsl.conf takes effect."
    ;;
  -h|--help)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "wsl-dns-fix: unknown option $1" >&2
    exit 2
    ;;
esac
