#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# export.sh — Selektiver Datenexport → ZIP
# ═══════════════════════════════════════════════════════════════════
# Exportiert Daten aus dem laufenden Workspace-Stack:
#
#   - Nextcloud Dateien (WebDAV)
#   - Nextcloud Kalender (CalDAV → .ics)
#   - Nextcloud Kontakte (CardDAV → .vcf)
#   - Keycloak Benutzer (Admin API → CSV + LDIF)
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
  "nc_files|Nextcloud Dateien (User-Daten)"
  "nc_calendar|Nextcloud Kalender (→ .ics)"
  "nc_contacts|Nextcloud Kontakte (→ .vcf)"
  "kc_users|Keycloak Benutzer (→ CSV + LDIF)"
  "kc_realm|Keycloak Realm (→ JSON)"
)
EXPORT_ENABLED=(1 1 1 1 1)

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
    echo -e "  ${BOLD}[6]${NC}   Alles abwählen" || \
    echo -e "  ${BOLD}[6]${NC}   Alles auswählen"

  echo ""
  echo -e "  ${BOLD}[s]${NC} Starten  ${BOLD}[q]${NC} Abbrechen"
  echo ""
}

run_export_menu() {
  while true; do
    show_export_menu
    prompt "Auswahl:"; read -r sel

    case "$sel" in
      [1-5])
        local idx=$((sel - 1))
        [[ "${EXPORT_ENABLED[$idx]}" -eq 1 ]] && EXPORT_ENABLED[$idx]=0 || EXPORT_ENABLED[$idx]=1
        ;;
      6)
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

# ── Keycloak Benutzer ───────────────────────────────────────────────
export_keycloak_users() {
  local output_dir="$1"
  mkdir -p "${output_dir}/keycloak"
  info "Exportiere Keycloak-Benutzer..."

  local kc_url="https://${KC_DOMAIN:-}"
  local kc_admin="${KC_ADMIN:-admin}"
  local kc_pass="${KC_PASS:-${KEYCLOAK_ADMIN_PASSWORD:-}}"

  if [[ -z "${KC_DOMAIN:-}" ]]; then
    warn "KC_DOMAIN nicht gesetzt — Benutzer-Export übersprungen"
    return 0
  fi

  if [[ -z "$kc_pass" ]]; then
    warn "Keycloak Admin-Passwort nicht gesetzt — Benutzer-Export übersprungen"
    return 0
  fi

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde Keycloak-Benutzer und -Gruppen exportieren"
    return 0
  fi

  local token
  token=$(curl -s -X POST "${kc_url}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=${kc_admin}" \
    -d "password=${kc_pass}" \
    -d "grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

  if [[ -z "$token" ]]; then
    warn "Keycloak-Login fehlgeschlagen"
    return 1
  fi

  local auth="Authorization: Bearer ${token}"

  # Benutzer abrufen
  local users_json
  users_json=$(curl -s "${kc_url}/admin/realms/workspace/users?max=1000" \
    -H "$auth" 2>/dev/null)

  # CSV
  local csv_file="${output_dir}/keycloak/users.csv"
  echo "username,email,display_name,groups,first_name,last_name" > "$csv_file"

  local user_count=0
  echo "$users_json" | jq -c '.[]' 2>/dev/null | while read -r user; do
    local uid email fn ln
    uid=$(echo "$user" | jq -r '.username')
    email=$(echo "$user" | jq -r '.email // ""')
    fn=$(echo "$user" | jq -r '.firstName // ""')
    ln=$(echo "$user" | jq -r '.lastName // ""')
    local display_name="${fn} ${ln}"
    [[ "$display_name" == " " ]] && display_name="$uid"

    # Gruppen des Users abrufen
    local user_id
    user_id=$(echo "$user" | jq -r '.id')
    local user_groups
    user_groups=$(curl -s "${kc_url}/admin/realms/workspace/users/${user_id}/groups" \
      -H "$auth" 2>/dev/null | jq -r '[.[].name] | join(";")' 2>/dev/null)

    echo "\"${uid}\",\"${email}\",\"${display_name}\",\"${user_groups}\",\"${fn}\",\"${ln}\"" >> "$csv_file"
  done

  # LDIF
  local ldif_file="${output_dir}/keycloak/users.ldif"
  : > "$ldif_file"
  echo "$users_json" | jq -c '.[]' 2>/dev/null | while read -r user; do
    local uid email fn ln
    uid=$(echo "$user" | jq -r '.username')
    email=$(echo "$user" | jq -r '.email // ""')
    fn=$(echo "$user" | jq -r '.firstName // ""')
    ln=$(echo "$user" | jq -r '.lastName // ""')
    local cn="${fn} ${ln}"
    [[ "$cn" == " " ]] && cn="$uid"

    cat >> "$ldif_file" <<LDIF
dn: uid=${uid},ou=people,dc=workspace
objectClass: inetOrgPerson
uid: ${uid}
mail: ${email}
cn: ${cn}
givenName: ${fn}
sn: ${ln:-${uid}}

LDIF
  done

  user_count=$(echo "$users_json" | jq 'length' 2>/dev/null || echo 0)
  success "Keycloak-Benutzer exportiert: ${user_count} Benutzer → CSV + LDIF"

  # Gruppen
  local groups_json
  groups_json=$(curl -s "${kc_url}/admin/realms/workspace/groups" \
    -H "$auth" 2>/dev/null)
  echo "$groups_json" > "${output_dir}/keycloak/groups.json" 2>/dev/null
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
    warn "[DRY-RUN] Würde Keycloak Realm 'workspace' exportieren"
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
  realm_json=$(curl -s "${KC_URL}/admin/realms/workspace" \
    -H "Authorization: Bearer ${access_token}" 2>/dev/null)

  if echo "$realm_json" | jq -e '.realm' &>/dev/null; then
    echo "$realm_json" | jq '.' > "${output_dir}/realm-workspace.json"
    success "Keycloak Realm exportiert: realm-workspace.json"
  else
    warn "Keycloak Realm 'workspace' nicht gefunden oder Zugriff verweigert"
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
  local export_name="workspace-export-${date_stamp}"
  local output_dir="${WORKDIR}/${export_name}"
  mkdir -p "$output_dir"

  header "Export gestartet..."
  $DRY_RUN && warn "DRY-RUN Modus — keine Daten werden tatsächlich exportiert"

  [[ "${EXPORT_ENABLED[0]}" -eq 1 ]] && export_nc_files "$output_dir"
  [[ "${EXPORT_ENABLED[1]}" -eq 1 ]] && export_nc_calendar "$output_dir"
  [[ "${EXPORT_ENABLED[2]}" -eq 1 ]] && export_nc_contacts "$output_dir"
  [[ "${EXPORT_ENABLED[3]}" -eq 1 ]] && export_keycloak_users "$output_dir"
  [[ "${EXPORT_ENABLED[4]}" -eq 1 ]] && export_keycloak_realm "$output_dir"

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
