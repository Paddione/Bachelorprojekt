#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# export.sh — Selektiver Datenexport → ZIP
# ═══════════════════════════════════════════════════════════════════
# Exportiert Daten aus dem laufenden Homeoffice-Stack:
#
#   - Mattermost Nachrichten (JSONL via mmctl/API)
#   - Mattermost Dateien (aus Volume)
#   - Nextcloud Dateien (WebDAV)
#   - Nextcloud Kalender (CalDAV → .ics)
#   - Nextcloud Kontakte (CardDAV → .vcf)
#   - LLDAP Benutzer (GraphQL → CSV + LDIF)
#   - Keycloak Realm (REST API → JSON)
#
# Alles wird in ein datiertes ZIP-Archiv gepackt.
# ═══════════════════════════════════════════════════════════════════

export_check_deps() {
  local missing=()
  command -v jq   &>/dev/null || missing+=("jq")
  command -v zip  &>/dev/null || missing+=("zip")
  command -v curl &>/dev/null || missing+=("curl")
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Fehlende Tools: ${missing[*]}"
    error "Installieren mit: apt install ${missing[*]}"
    return 1
  fi
}

# ── Toggle-Menü ──────────────────────────────────────────────────────
EXPORT_MODULES=(
  "mm_messages|Mattermost Nachrichten (Channels, DMs → JSONL)"
  "mm_files|Mattermost Dateien (Uploads, Anhänge)"
  "nc_files|Nextcloud Dateien (User-Daten)"
  "nc_calendar|Nextcloud Kalender (→ .ics)"
  "nc_contacts|Nextcloud Kontakte (→ .vcf)"
  "lldap_users|LLDAP Benutzer (→ CSV + LDIF)"
  "kc_realm|Keycloak Realm (→ JSON)"
)
EXPORT_ENABLED=(1 1 1 1 1 1 1)

show_export_menu() {
  echo ""
  echo -e "${BOLD}Daten exportieren${NC}"
  echo -e "${CYAN}──────────────────${NC}"

  for i in "${!EXPORT_MODULES[@]}"; do
    local label="${EXPORT_MODULES[$i]#*|}"
    local check="☐"
    [[ "${EXPORT_ENABLED[$i]}" -eq 1 ]] && check="☑"
    echo -e "  ${BOLD}[$((i+1))]${NC} ${check} ${label}"
  done

  local all_on=true
  for e in "${EXPORT_ENABLED[@]}"; do [[ "$e" -eq 0 ]] && all_on=false; done
  $all_on && \
    echo -e "  ${BOLD}[8]${NC}   Alles abwählen" || \
    echo -e "  ${BOLD}[8]${NC}   Alles auswählen"

  echo ""
  echo -e "  ${BOLD}[s]${NC} Starten  ${BOLD}[q]${NC} Abbrechen"
  echo ""
}

run_export_menu() {
  while true; do
    show_export_menu
    prompt "Auswahl:"; read -r sel

    case "$sel" in
      [1-7])
        local idx=$((sel - 1))
        [[ "${EXPORT_ENABLED[$idx]}" -eq 1 ]] && EXPORT_ENABLED[$idx]=0 || EXPORT_ENABLED[$idx]=1
        ;;
      8)
        local all_on=true
        for e in "${EXPORT_ENABLED[@]}"; do [[ "$e" -eq 0 ]] && all_on=false; done
        local new_val=1; $all_on && new_val=0
        for i in "${!EXPORT_ENABLED[@]}"; do EXPORT_ENABLED[$i]=$new_val; done
        ;;
      s|S) return 0 ;;
      q|Q) return 1 ;;
      *) warn "Ungültige Auswahl" ;;
    esac
  done
}

# ── Mattermost Nachrichten ───────────────────────────────────────────
export_mm_messages() {
  local output_dir="$1"
  mkdir -p "${output_dir}/mattermost"
  info "Exportiere Mattermost-Nachrichten..."

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde Mattermost-Nachrichten exportieren"
    return 0
  fi

  # Methode 1: mmctl (bevorzugt)
  if command -v mmctl &>/dev/null; then
    mmctl export create --format jsonl 2>/dev/null || true
    sleep 3
    local export_file
    export_file=$(mmctl export list --json 2>/dev/null | jq -r '.[-1].data.path // empty')
    if [[ -n "$export_file" ]]; then
      mmctl export download "$export_file" --output "${output_dir}/mattermost/messages.jsonl" 2>/dev/null
      success "Mattermost-Nachrichten exportiert (mmctl)"
      return 0
    fi
  fi

  # Methode 2: REST API Fallback
  if [[ -n "${MM_URL:-}" && -n "${MM_ADMIN:-}" && -n "${MM_PASS:-}" ]]; then
    local token
    token=$(curl -s -X POST "${MM_URL}/api/v4/users/login" \
      -H "Content-Type: application/json" \
      -d "{\"login_id\":\"${MM_ADMIN}\",\"password\":\"${MM_PASS}\"}" \
      -D - 2>/dev/null | grep -i "^token:" | awk '{print $2}' | tr -d '\r')

    if [[ -n "$token" ]]; then
      local teams
      teams=$(curl -s "${MM_URL}/api/v4/teams" \
        -H "Authorization: Bearer ${token}" 2>/dev/null)

      local jsonl="${output_dir}/mattermost/messages.jsonl"
      echo '{"type":"version","version":1}' > "$jsonl"

      echo "$teams" | jq -r '.[].id' 2>/dev/null | while read -r team_id; do
        [[ -z "$team_id" ]] && continue
        local channels
        channels=$(curl -s "${MM_URL}/api/v4/teams/${team_id}/channels" \
          -H "Authorization: Bearer ${token}" 2>/dev/null)

        echo "$channels" | jq -c '.[]' 2>/dev/null | while read -r ch; do
          local ch_id
          ch_id=$(echo "$ch" | jq -r '.id')

          local posts
          posts=$(curl -s "${MM_URL}/api/v4/channels/${ch_id}/posts?per_page=200" \
            -H "Authorization: Bearer ${token}" 2>/dev/null)

          echo "$posts" | jq -c '.posts // {} | to_entries[] | .value' 2>/dev/null | while read -r post; do
            echo "$post" | jq -c '{type:"post",post:.}' >> "$jsonl"
          done
        done
      done

      success "Mattermost-Nachrichten exportiert (API)"
    else
      warn "Mattermost-Login fehlgeschlagen"
    fi
  else
    warn "Mattermost-Export übersprungen — Zugangsdaten nicht konfiguriert"
  fi
}

# ── Mattermost Dateien ───────────────────────────────────────────────
export_mm_files() {
  local output_dir="$1"
  local storage="${STORAGE_PATH:-./data}"
  local mm_data="${storage}/mattermost"

  if [[ ! -d "$mm_data" ]]; then
    warn "Mattermost-Datenverzeichnis nicht gefunden: $mm_data"
    return 0
  fi

  info "Exportiere Mattermost-Dateien..."

  if ${DRY_RUN:-false}; then
    local count
    count=$(find "$mm_data" -type f 2>/dev/null | wc -l)
    warn "[DRY-RUN] Würde ${count} Dateien exportieren aus $mm_data"
    return 0
  fi

  mkdir -p "${output_dir}/mattermost/files"
  cp -r "${mm_data}/." "${output_dir}/mattermost/files/" 2>/dev/null || true
  local count
  count=$(find "${output_dir}/mattermost/files" -type f 2>/dev/null | wc -l)
  success "Mattermost-Dateien exportiert: ${count} Dateien"
}

# ── Nextcloud Dateien ────────────────────────────────────────────────
export_nc_files() {
  local output_dir="$1"
  nc_auth || return 1
  nc_download_files "" "${output_dir}/nextcloud/files"
}

# ── Nextcloud Kalender ───────────────────────────────────────────────
export_nc_calendar() {
  local output_dir="$1"
  nc_auth || return 1
  nc_export_calendars "${output_dir}/nextcloud/calendars"
}

# ── Nextcloud Kontakte ───────────────────────────────────────────────
export_nc_contacts() {
  local output_dir="$1"
  nc_auth || return 1
  nc_export_contacts "${output_dir}/nextcloud/contacts"
}

# ── LLDAP Benutzer ───────────────────────────────────────────────────
export_lldap_users() {
  local output_dir="$1"
  mkdir -p "${output_dir}/lldap"
  info "Exportiere LLDAP-Benutzer..."

  if [[ -z "${LLDAP_URL:-}" || -z "${LLDAP_ADMIN:-}" || -z "${LLDAP_PASS:-}" ]]; then
    warn "LLDAP-Zugangsdaten nicht konfiguriert — Export übersprungen"
    return 0
  fi

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde LLDAP-Benutzer und -Gruppen exportieren"
    return 0
  fi

  local token
  token=$(curl -s -X POST "${LLDAP_URL}/auth/simple/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${LLDAP_ADMIN}\",\"password\":\"${LLDAP_PASS}\"}" 2>/dev/null | jq -r '.token // empty')

  if [[ -z "$token" ]]; then
    warn "LLDAP-Login fehlgeschlagen"
    return 1
  fi

  local users_json
  users_json=$(curl -s -X POST "${LLDAP_URL}/api/graphql" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d '{"query":"{ users { id email displayName firstName lastName groups { displayName } } }"}' 2>/dev/null)

  local groups_json
  groups_json=$(curl -s -X POST "${LLDAP_URL}/api/graphql" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d '{"query":"{ groups { id displayName users { id } } }"}' 2>/dev/null)

  # CSV
  local csv_file="${output_dir}/lldap/users.csv"
  echo "username,email,display_name,groups,first_name,last_name" > "$csv_file"
  echo "$users_json" | jq -r '.data.users[]? | [
    .id,
    .email,
    .displayName,
    ([.groups[]?.displayName] | join(";")),
    (.firstName // ""),
    (.lastName // "")
  ] | @csv' >> "$csv_file" 2>/dev/null

  # LDIF
  local ldif_file="${output_dir}/lldap/users.ldif"
  : > "$ldif_file"
  echo "$users_json" | jq -r '.data.users[]? | @base64' 2>/dev/null | while read -r encoded; do
    local user
    user=$(echo "$encoded" | base64 -d)
    local uid email cn fn ln
    uid=$(echo "$user" | jq -r '.id')
    email=$(echo "$user" | jq -r '.email // ""')
    cn=$(echo "$user" | jq -r '.displayName // .id')
    fn=$(echo "$user" | jq -r '.firstName // ""')
    ln=$(echo "$user" | jq -r '.lastName // ""')

    cat >> "$ldif_file" <<LDIF
dn: uid=${uid},ou=people,dc=homeoffice
objectClass: inetOrgPerson
uid: ${uid}
mail: ${email}
cn: ${cn}
givenName: ${fn}
sn: ${ln:-${uid}}

LDIF
  done

  local user_count
  user_count=$(echo "$users_json" | jq '.data.users | length' 2>/dev/null || echo 0)
  success "LLDAP exportiert: ${user_count} Benutzer → CSV + LDIF"

  echo "$groups_json" | jq '.data.groups' > "${output_dir}/lldap/groups.json" 2>/dev/null
}

# ── Keycloak Realm ───────────────────────────────────────────────────
export_keycloak_realm() {
  local output_dir="$1"
  mkdir -p "${output_dir}/keycloak"
  info "Exportiere Keycloak Realm..."

  if [[ -z "${KC_URL:-}" ]]; then
    KC_URL="https://${KC_DOMAIN:-}"
    [[ -z "${KC_DOMAIN:-}" ]] && { warn "KC_DOMAIN nicht gesetzt — Keycloak-Export übersprungen"; return 0; }
  fi

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde Keycloak Realm 'homeoffice' exportieren"
    return 0
  fi

  local kc_admin="${KC_ADMIN:-admin}"
  local kc_pass="${KC_PASS:-${KEYCLOAK_ADMIN_PASSWORD:-}}"

  if [[ -z "$kc_pass" ]]; then
    warn "Keycloak Admin-Passwort nicht gesetzt — Export übersprungen"
    return 0
  fi

  local token_response
  token_response=$(curl -s -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=${kc_admin}" \
    -d "password=${kc_pass}" \
    -d "grant_type=password" 2>/dev/null)

  local access_token
  access_token=$(echo "$token_response" | jq -r '.access_token // empty')

  if [[ -z "$access_token" ]]; then
    warn "Keycloak-Login fehlgeschlagen"
    return 1
  fi

  local realm_json
  realm_json=$(curl -s "${KC_URL}/admin/realms/homeoffice" \
    -H "Authorization: Bearer ${access_token}" 2>/dev/null)

  if echo "$realm_json" | jq -e '.realm' &>/dev/null; then
    echo "$realm_json" | jq '.' > "${output_dir}/keycloak/realm-homeoffice.json"
    success "Keycloak Realm exportiert: realm-homeoffice.json"
  else
    warn "Keycloak Realm 'homeoffice' nicht gefunden oder Zugriff verweigert"
  fi
}

# ── Manifest schreiben ───────────────────────────────────────────────
write_export_manifest() {
  local output_dir="$1"

  local modules=()
  for i in "${!EXPORT_MODULES[@]}"; do
    local key="${EXPORT_MODULES[$i]%%|*}"
    local enabled="false"
    [[ "${EXPORT_ENABLED[$i]}" -eq 1 ]] && enabled="true"
    modules+=("\"${key}\": ${enabled}")
  done

  cat > "${output_dir}/export-manifest.json" << MANIFEST
{
  "export_date": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "export_host": "$(hostname -f 2>/dev/null || hostname)",
  "modules": {
    $(IFS=','; echo "${modules[*]}" | sed 's/,/,\n    /g')
  },
  "versions": {
    "export_script": "1.0.0"
  }
}
MANIFEST
}

# ── Haupt-Einstiegspunkt ────────────────────────────────────────────
run_export() {
  export_check_deps || return 1

  run_export_menu || { info "Export abgebrochen"; return 0; }

  local any_selected=false
  for e in "${EXPORT_ENABLED[@]}"; do [[ "$e" -eq 1 ]] && any_selected=true; done
  if ! $any_selected; then
    warn "Kein Modul ausgewählt — Export abgebrochen"
    return 0
  fi

  local date_stamp
  date_stamp=$(date '+%Y-%m-%d')
  local export_name="homeoffice-export-${date_stamp}"
  local output_dir="${WORKDIR}/${export_name}"
  mkdir -p "$output_dir"

  header "Export gestartet..."
  $DRY_RUN && warn "DRY-RUN Modus — keine Daten werden tatsächlich exportiert"

  [[ "${EXPORT_ENABLED[0]}" -eq 1 ]] && export_mm_messages "$output_dir"
  [[ "${EXPORT_ENABLED[1]}" -eq 1 ]] && export_mm_files "$output_dir"
  [[ "${EXPORT_ENABLED[2]}" -eq 1 ]] && export_nc_files "$output_dir"
  [[ "${EXPORT_ENABLED[3]}" -eq 1 ]] && export_nc_calendar "$output_dir"
  [[ "${EXPORT_ENABLED[4]}" -eq 1 ]] && export_nc_contacts "$output_dir"
  [[ "${EXPORT_ENABLED[5]}" -eq 1 ]] && export_lldap_users "$output_dir"
  [[ "${EXPORT_ENABLED[6]}" -eq 1 ]] && export_keycloak_realm "$output_dir"

  write_export_manifest "$output_dir"

  if $DRY_RUN; then
    info "DRY-RUN beendet — kein ZIP erstellt"
    return 0
  fi

  local zip_file="${SCRIPT_DIR}/${export_name}.zip"
  info "Erstelle ZIP-Archiv..."
  (cd "$WORKDIR" && zip -qr "$zip_file" "$export_name/")

  local zip_size
  zip_size=$(du -sh "$zip_file" | cut -f1)

  echo ""
  success "Export abgeschlossen!"
  echo ""
  echo -e "  ${BOLD}Datei:${NC}  $zip_file"
  echo -e "  ${BOLD}Größe:${NC}  $zip_size"
  echo ""
}
