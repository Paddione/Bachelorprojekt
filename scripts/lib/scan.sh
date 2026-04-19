#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scan.sh — Lokale Scan-Logik für Migrations-Quellen
# Wird von migrate.sh als Library genutzt (nicht direkt ausführen)
# ═══════════════════════════════════════════════════════════════════

# ── Betriebssystem erkennen ──────────────────────────────────────────
detect_os() {
  if [[ -n "${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
    echo "wsl"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  else
    echo "linux"
  fi
}

OS_TYPE=$(detect_os)

# Windows-Benutzerprofil aus WSL auflösen
get_windows_home() {
  if [[ "$OS_TYPE" == "wsl" ]]; then
    WIN_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n')
    echo "/mnt/c/Users/${WIN_USER}"
  fi
}

# ── Slack ────────────────────────────────────────────────────────────
scan_slack() {
  local found=()
  local search_paths=()

  case "$OS_TYPE" in
    macos)
      search_paths+=(
        "$HOME/Library/Application Support/Slack"
        "$HOME/Library/Containers/com.tinyspeck.slackmacgap"
      )
      ;;
    linux)
      search_paths+=(
        "$HOME/.config/Slack"
        "$HOME/snap/slack/current/.config/Slack"
        "$HOME/.var/app/com.slack.Slack"
      )
      ;;
    wsl)
      WIN_HOME=$(get_windows_home)
      search_paths+=(
        "${WIN_HOME}/AppData/Roaming/Slack"
        "${WIN_HOME}/AppData/Local/slack"
        "$HOME/.config/Slack"
      )
      ;;
  esac

  # Export-ZIPs suchen (manuell heruntergeladen)
  local zip_paths=(
    "$HOME/Downloads"
    "$HOME/Desktop"
    "${WIN_HOME:-}/Downloads"
    "${WIN_HOME:-}/Desktop"
  )
  for dir in "${zip_paths[@]}"; do
    [[ -d "$dir" ]] && while IFS= read -r zip; do
      found+=("zip:$zip")
    done < <(find "$dir" -maxdepth 2 -name "*.zip" 2>/dev/null | xargs grep -l "channels.json" 2>/dev/null || true)
  done

  # Cache-Verzeichnisse mit Workspaces
  for path in "${search_paths[@]}"; do
    [[ ! -d "$path" ]] && continue
    if [[ -d "${path}/storage" ]] || [[ -d "${path}/Cache" ]]; then
      # Workspace-Namen aus lokaler Config lesen
      local workspaces=""
      workspaces=$(find "$path" -name "*.slack.com" -maxdepth 4 -type d 2>/dev/null | \
        sed 's|.*/||' | sort -u | tr '\n' ', ' | sed 's/,$//')
      found+=("cache:${path}|${workspaces:-Unbekannt}")
    fi
  done

  printf '%s\n' "${found[@]}"
}

# ── Microsoft Teams ──────────────────────────────────────────────────
scan_teams() {
  local found=()
  local search_paths=()

  case "$OS_TYPE" in
    macos)
      search_paths+=(
        "$HOME/Library/Application Support/Microsoft/Teams"
        "$HOME/Library/Containers/com.microsoft.teams2"
      )
      ;;
    linux)
      search_paths+=(
        "$HOME/.config/Microsoft/Microsoft Teams"
        "$HOME/snap/teams/current"
        "$HOME/.var/app/com.microsoft.Teams"
      )
      ;;
    wsl)
      WIN_HOME=$(get_windows_home)
      search_paths+=(
        "${WIN_HOME}/AppData/Roaming/Microsoft/Teams"
        "${WIN_HOME}/AppData/Local/Microsoft/Teams"
        "${WIN_HOME}/AppData/Local/Packages/MSTeams_8wekyb3d8bbwe"  # Teams 2.0
      )
      ;;
  esac

  # GDPR-Export-ZIPs suchen
  local zip_paths=(
    "$HOME/Downloads"
    "$HOME/Desktop"
    "${WIN_HOME:-}/Downloads"
    "${WIN_HOME:-}/Desktop"
  )
  for dir in "${zip_paths[@]}"; do
    [[ -d "$dir" ]] && while IFS= read -r f; do
      # Teams GDPR export enthält manifest.json und messages.json
      case "$f" in
        *.zip)
          unzip -l "$f" 2>/dev/null | grep -q "messages" && found+=("gdpr_zip:$f") ;;
        */manifest.json)
          grep -q "microsoft\|teams" "$f" 2>/dev/null && found+=("gdpr_dir:$(dirname "$f")") ;;
      esac
    done < <(find "$dir" -maxdepth 3 \( -name "*.zip" -o -name "manifest.json" \) 2>/dev/null || true)
  done

  # Lokaler Cache
  for path in "${search_paths[@]}"; do
    [[ ! -d "$path" ]] && continue
    # Konversations-Cache
    local chat_db
    chat_db=$(find "$path" -name "*.db" -name "*IndexedDB*" 2>/dev/null | head -1)
    if [[ -n "$chat_db" ]] || [[ -d "${path}/storage" ]]; then
      found+=("cache:${path}")
    fi
  done

  printf '%s\n' "${found[@]}"
}

# ── Nextcloud (bestehender Client-Sync) ──────────────────────────────
scan_nextcloud() {
  local found=()

  case "$OS_TYPE" in
    macos)
      local nc_conf="$HOME/Library/Preferences/Nextcloud"
      [[ -d "$nc_conf" ]] && found+=("client:$nc_conf")
      ;;
    linux)
      local nc_conf="$HOME/.config/Nextcloud"
      [[ -d "$nc_conf" ]] && found+=("client:$nc_conf")
      ;;
    wsl)
      WIN_HOME=$(get_windows_home)
      [[ -d "${WIN_HOME}/AppData/Roaming/Nextcloud" ]] && \
        found+=("client:${WIN_HOME}/AppData/Roaming/Nextcloud")
      ;;
  esac

  printf '%s\n' "${found[@]}"
}

# ── Google Takeout ──────────────────────────────────────────────────
scan_google() {
  local found=()

  # Suchpfade für Takeout-Downloads
  local zip_paths=(
    "$HOME/Downloads"
    "$HOME/Desktop"
  )
  if [[ "$OS_TYPE" == "wsl" ]]; then
    WIN_HOME=$(get_windows_home)
    zip_paths+=("${WIN_HOME}/Downloads" "${WIN_HOME}/Desktop")
  fi

  for dir in "${zip_paths[@]}"; do
    [[ -d "$dir" ]] || continue

    # Takeout-ZIPs (heißen typischerweise "takeout-*.zip")
    while IFS= read -r zip; do
      [[ -z "$zip" ]] && continue
      # Prüfe ob ZIP Google-Takeout-Struktur enthält
      if unzip -l "$zip" 2>/dev/null | grep -qiE "(Google Chat|Drive|Kalender|Calendar|Kontakte|Contacts)"; then
        found+=("takeout_zip:$zip")
      fi
    done < <(find "$dir" -maxdepth 2 -iname "takeout-*.zip" -o -iname "*google*takeout*.zip" 2>/dev/null || true)

    # Entpackte Takeout-Ordner
    while IFS= read -r takeout_dir; do
      [[ -z "$takeout_dir" ]] && continue
      if [[ -d "${takeout_dir}/Google Chat" ]] || \
         [[ -d "${takeout_dir}/Drive" ]] || \
         [[ -d "${takeout_dir}/Kalender" ]] || \
         [[ -d "${takeout_dir}/Calendar" ]] || \
         [[ -d "${takeout_dir}/Kontakte" ]] || \
         [[ -d "${takeout_dir}/Contacts" ]]; then
        found+=("takeout_dir:$takeout_dir")
      fi
    done < <(find "$dir" -maxdepth 2 -type d -iname "Takeout" 2>/dev/null || true)
  done

  printf '%s\n' "${found[@]}"
}

# ── Ergebnis formatieren ─────────────────────────────────────────────
# Gibt eine Liste von gefundenen Quellen zurück:
# FORMAT: "app_key|display_label|path|details"
scan_all() {
  local results=()

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    local kind="${hit%%:*}" path="${hit#*:}"
    results+=("slack_${kind}|💬 Slack (${kind})|${path}")
  done < <(scan_slack)

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    local kind="${hit%%:*}" path="${hit#*:}"
    results+=("teams_${kind}|📹 Teams (${kind})|${path}")
  done < <(scan_teams)

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    local kind="${hit%%:*}" path="${hit#*:}"
    results+=("nc_${kind}|☁️  Nextcloud (${kind})|${path}")
  done < <(scan_nextcloud)

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    local kind="${hit%%:*}" path="${hit#*:}"
    results+=("google_${kind}|🔵 Google Takeout (${kind})|${path}")
  done < <(scan_google)

  printf '%s\n' "${results[@]}"
}
