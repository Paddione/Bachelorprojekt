#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# nextcloud-api.sh — Shared Nextcloud WebDAV/CalDAV/CardDAV Helpers
# ═══════════════════════════════════════════════════════════════════
# Wird von teams-import.sh, google-import.sh und export.sh genutzt.
# Erwartet: NC_URL, NC_USER, NC_PASS als Variablen vom Aufrufer.
# ═══════════════════════════════════════════════════════════════════

nc_auth() {
  if [[ -z "${NC_URL:-}" || -z "${NC_USER:-}" || -z "${NC_PASS:-}" ]]; then
    error "Nextcloud-Zugangsdaten nicht gesetzt (NC_URL, NC_USER, NC_PASS)"
    return 1
  fi
}

# ── WebDAV (Dateien) ─────────────────────────────────────────────────

nc_mkdir() {
  local remote_path="$1"
  local webdav_base="${NC_URL%/}/remote.php/dav/files/${NC_USER}"
  curl -s -X MKCOL "${webdav_base}/${remote_path}" \
    -u "${NC_USER}:${NC_PASS}" >/dev/null 2>&1 || true
}

nc_mkdirs() {
  local remote_path="$1"
  local parts="" segment
  IFS='/' read -ra segments <<< "$remote_path"
  for segment in "${segments[@]}"; do
    [[ -z "$segment" ]] && continue
    parts="${parts:+${parts}/}${segment}"
    nc_mkdir "$parts"
  done
}

nc_upload_file() {
  local local_file="$1"
  local remote_path="$2"
  local webdav_base="${NC_URL%/}/remote.php/dav/files/${NC_USER}"

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde hochladen: $(basename "$local_file") → $remote_path"
    return 0
  fi

  local file_size
  file_size=$(stat -c%s "$local_file" 2>/dev/null || stat -f%z "$local_file" 2>/dev/null || echo 0)

  local curl_opts=(-s -o /dev/null -w "%{http_code}")
  if [[ "$file_size" -gt 10485760 ]]; then
    curl_opts=(--progress-bar -o /dev/null -w "%{http_code}")
  fi

  local http_code
  http_code=$(curl "${curl_opts[@]}" \
    -T "$local_file" \
    -u "${NC_USER}:${NC_PASS}" \
    "${webdav_base}/${remote_path}")

  [[ "$http_code" =~ ^2 ]]
}

nc_upload_files() {
  local local_dir="$1"
  local remote_base="$2"

  [[ ! -d "$local_dir" ]] && return 0
  local file_count
  file_count=$(find "$local_dir" -type f | wc -l)
  [[ "$file_count" -eq 0 ]] && return 0

  info "Lade ${file_count} Dateien in Nextcloud hoch: ${remote_base}/"

  nc_mkdir "$remote_base"

  local uploaded=0 failed=0
  while IFS= read -r file; do
    local rel_path="${file#${local_dir}/}"
    local remote_dir="${remote_base}/$(dirname "$rel_path")"

    nc_mkdirs "$remote_dir"

    if nc_upload_file "$file" "${remote_base}/${rel_path}"; then
      ((uploaded++)) || true
    else
      warn "Fehler beim Upload: $rel_path"
      ((failed++)) || true
    fi
  done < <(find "$local_dir" -type f)

  success "Dateien hochgeladen: ${uploaded} OK, ${failed} Fehler"
}

nc_download_file() {
  local remote_path="$1"
  local local_file="$2"
  local webdav_base="${NC_URL%/}/remote.php/dav/files/${NC_USER}"

  mkdir -p "$(dirname "$local_file")"
  local http_code
  http_code=$(curl -s -o "$local_file" -w "%{http_code}" \
    -u "${NC_USER}:${NC_PASS}" \
    "${webdav_base}/${remote_path}")

  [[ "$http_code" =~ ^2 ]]
}

nc_download_files() {
  local remote_base="$1"
  local local_dir="$2"
  local webdav_base="${NC_URL%/}/remote.php/dav/files/${NC_USER}"

  mkdir -p "$local_dir"
  info "Lade Nextcloud-Dateien herunter..."

  local propfind_result
  propfind_result=$(curl -s -X PROPFIND \
    -u "${NC_USER}:${NC_PASS}" \
    -H "Depth: infinity" \
    -H "Content-Type: application/xml" \
    --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>' \
    "${webdav_base}/${remote_base}" 2>/dev/null)

  local files=()
  while IFS= read -r href; do
    [[ -z "$href" ]] && continue
    [[ "$href" == */ ]] && continue
    local rel="${href#*/remote.php/dav/files/${NC_USER}/}"
    [[ -n "$rel" && "$rel" != "$href" ]] && files+=("$rel")
  done < <(echo "$propfind_result" | grep -oP '(?<=<d:href>)[^<]+' || true)

  local downloaded=0 failed=0
  for rel in "${files[@]}"; do
    if ${DRY_RUN:-false}; then
      warn "[DRY-RUN] Würde herunterladen: $rel"
      ((downloaded++)) || true
      continue
    fi

    if nc_download_file "$rel" "${local_dir}/${rel}"; then
      ((downloaded++)) || true
    else
      ((failed++)) || true
    fi
  done

  success "Dateien heruntergeladen: ${downloaded} OK, ${failed} Fehler"
}

# ── CalDAV (Kalender) ────────────────────────────────────────────────

nc_create_calendar() {
  local cal_name="$1"
  local display_name="${2:-$cal_name}"
  local caldav_url="${NC_URL%/}/remote.php/dav/calendars/${NC_USER}/${cal_name}/"

  curl -s -X MKCOL "$caldav_url" \
    -u "${NC_USER}:${NC_PASS}" \
    -H "Content-Type: application/xml" \
    --data "<?xml version=\"1.0\"?><d:mkcol xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:caldav\"><d:set><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>${display_name}</d:displayname></d:prop></d:set></d:mkcol>" \
    >/dev/null 2>&1 || true
}

nc_upload_calendar() {
  local ics_file="$1"
  local cal_name="${2:-import}"
  local display_name="${3:-Import}"

  [[ ! -f "$ics_file" ]] && return 0
  info "Importiere Kalender in Nextcloud: $(basename "$ics_file")"

  nc_create_calendar "$cal_name" "$display_name"

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde Kalender hochladen: $ics_file"
    return 0
  fi

  local caldav_url="${NC_URL%/}/remote.php/dav/calendars/${NC_USER}/${cal_name}/"
  local ics_name
  ics_name="$(basename "${ics_file%.ics}").ics"

  curl -s -X PUT "${caldav_url}${ics_name}" \
    -u "${NC_USER}:${NC_PASS}" \
    -H "Content-Type: text/calendar" \
    -T "$ics_file" >/dev/null && success "Kalender importiert: $ics_name" || warn "Kalender-Upload fehlgeschlagen: $ics_name"
}

nc_export_calendars() {
  local output_dir="$1"
  local caldav_base="${NC_URL%/}/remote.php/dav/calendars/${NC_USER}/"

  mkdir -p "$output_dir"
  info "Exportiere Nextcloud-Kalender..."

  local propfind_result
  propfind_result=$(curl -s -X PROPFIND \
    -u "${NC_USER}:${NC_PASS}" \
    -H "Depth: 1" \
    -H "Content-Type: application/xml" \
    --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
    "$caldav_base" 2>/dev/null)

  local exported=0
  while IFS= read -r href; do
    [[ -z "$href" ]] && continue
    [[ "$href" == */ ]] || continue
    local cal_name="${href%/}"
    cal_name="${cal_name##*/}"
    [[ "$cal_name" == "inbox" || "$cal_name" == "outbox" || "$cal_name" == "trashbin" || -z "$cal_name" ]] && continue

    if ${DRY_RUN:-false}; then
      warn "[DRY-RUN] Würde exportieren: Kalender '${cal_name}'"
      ((exported++)) || true
      continue
    fi

    local export_url="${NC_URL%/}/remote.php/dav/calendars/${NC_USER}/${cal_name}?export"
    local http_code
    http_code=$(curl -s -o "${output_dir}/${cal_name}.ics" -w "%{http_code}" \
      -u "${NC_USER}:${NC_PASS}" \
      "$export_url")

    if [[ "$http_code" =~ ^2 ]]; then
      ((exported++)) || true
    else
      warn "Kalender-Export fehlgeschlagen: $cal_name (HTTP $http_code)"
      rm -f "${output_dir}/${cal_name}.ics"
    fi
  done < <(echo "$propfind_result" | grep -oP '(?<=<d:href>)[^<]+' || true)

  success "Kalender exportiert: $exported"
}

# ── CardDAV (Kontakte) ───────────────────────────────────────────────

nc_create_addressbook() {
  local book_name="$1"
  local carddav_url="${NC_URL%/}/remote.php/dav/addressbooks/users/${NC_USER}/${book_name}/"

  curl -s -X MKCOL "$carddav_url" \
    -u "${NC_USER}:${NC_PASS}" >/dev/null 2>&1 || true
}

nc_upload_contacts() {
  local vcf_file="$1"
  local book_name="${2:-import}"

  [[ ! -f "$vcf_file" ]] && return 0
  info "Importiere Kontakte in Nextcloud: $(basename "$vcf_file")"

  nc_create_addressbook "$book_name"

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde Kontakte hochladen: $vcf_file"
    return 0
  fi

  local carddav_url="${NC_URL%/}/remote.php/dav/addressbooks/users/${NC_USER}/${book_name}/"
  local vcf_name
  vcf_name="$(basename "${vcf_file%.vcf}").vcf"

  curl -s -X PUT "${carddav_url}${vcf_name}" \
    -u "${NC_USER}:${NC_PASS}" \
    -H "Content-Type: text/vcard" \
    -T "$vcf_file" >/dev/null && success "Kontakte importiert: $vcf_name" || warn "Kontakte-Upload fehlgeschlagen: $vcf_name"
}

nc_export_contacts() {
  local output_dir="$1"
  local carddav_base="${NC_URL%/}/remote.php/dav/addressbooks/users/${NC_USER}/"

  mkdir -p "$output_dir"
  info "Exportiere Nextcloud-Kontakte..."

  local propfind_result
  propfind_result=$(curl -s -X PROPFIND \
    -u "${NC_USER}:${NC_PASS}" \
    -H "Depth: 1" \
    -H "Content-Type: application/xml" \
    --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
    "$carddav_base" 2>/dev/null)

  local exported=0
  while IFS= read -r href; do
    [[ -z "$href" ]] && continue
    [[ "$href" == */ ]] || continue
    local book_name="${href%/}"
    book_name="${book_name##*/}"
    [[ -z "$book_name" ]] && continue

    if ${DRY_RUN:-false}; then
      warn "[DRY-RUN] Würde exportieren: Adressbuch '${book_name}'"
      ((exported++)) || true
      continue
    fi

    local report_result
    report_result=$(curl -s -X REPORT \
      -u "${NC_USER}:${NC_PASS}" \
      -H "Depth: 1" \
      -H "Content-Type: application/xml" \
      --data '<?xml version="1.0"?><c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><c:address-data/></d:prop></c:addressbook-query>' \
      "${carddav_base}${book_name}/" 2>/dev/null)

    local vcards
    vcards=$(echo "$report_result" | grep -oP '(?<=<c:address-data>).*?(?=</c:address-data>)' | \
      sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' || true)

    if [[ -n "$vcards" ]]; then
      echo "$vcards" > "${output_dir}/${book_name}.vcf"
      ((exported++)) || true
    fi
  done < <(echo "$propfind_result" | grep -oP '(?<=<d:href>)[^<]+' || true)

  success "Adressbücher exportiert: $exported"
}
