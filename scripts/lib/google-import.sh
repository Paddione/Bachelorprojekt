#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# google-import.sh — Google Takeout → Nextcloud
# ═══════════════════════════════════════════════════════════════════
# Importiert aus einem Google Takeout Export (takeout.google.com):
#
#   - Google Drive, Kalender, Kontakte → Nextcloud
#   - Drive        → Nextcloud (WebDAV upload)
#   - Kalender     → Nextcloud Calendar (CalDAV)
#   - Kontakte     → Nextcloud Contacts (CardDAV)
#
# Spracherkennung: erkennt deutsche UND englische Ordnernamen.
# ═══════════════════════════════════════════════════════════════════

google_check_deps() {
  local missing=()
  command -v jq      &>/dev/null || missing+=("jq")
  command -v python3 &>/dev/null || missing+=("python3")
  command -v unzip   &>/dev/null || missing+=("unzip")
  command -v curl    &>/dev/null || missing+=("curl")
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Fehlende Tools: ${missing[*]}"
    error "Installieren mit: apt install ${missing[*]}"
    return 1
  fi
}

google_prepare_source() {
  local source="$1"
  local workdir="${WORKDIR}/google-source"

  if [[ -f "$source" && "$source" == *.zip ]]; then
    info "Entpacke Google Takeout: $source"
    mkdir -p "$workdir"
    unzip -q "$source" -d "$workdir"
    local inner
    inner=$(find "$workdir" -maxdepth 1 -type d -iname "Takeout" | head -1)
    if [[ -n "$inner" ]]; then
      echo "$inner"
    else
      echo "$workdir"
    fi
  elif [[ -d "$source" ]]; then
    echo "$source"
  else
    error "Ungültige Google-Takeout-Quelle: $source"
    return 1
  fi
}

google_detect_content() {
  local source_dir="$1"
  local content=()

  [[ -d "${source_dir}/Google Chat" ]]                             && content+=("chat")
  [[ -d "${source_dir}/Drive" ]]                                   && content+=("drive")
  [[ -d "${source_dir}/Kalender" || -d "${source_dir}/Calendar" ]] && content+=("calendar")
  [[ -d "${source_dir}/Kontakte" || -d "${source_dir}/Contacts" ]] && content+=("contacts")

  if [[ ${#content[@]} -eq 0 ]]; then
    warn "Keine bekannten Google-Daten gefunden in: $source_dir"
    return 1
  fi

  printf '%s\n' "${content[@]}"
}

# ── Google Chat → Mattermost JSONL ───────────────────────────────────
google_import_chat() {
  local source_dir="$1"
  local chat_dir="${source_dir}/Google Chat"
  local output_jsonl="${WORKDIR}/google-chat-import.jsonl"

  [[ ! -d "$chat_dir" ]] && { warn "Kein Google Chat Verzeichnis gefunden"; return 0; }

  info "Konvertiere Google Chat → Mattermost JSONL..."

python3 - "$chat_dir" "$output_jsonl" << 'PYEOF'
import json, sys, os, re, glob
from datetime import datetime, timezone

chat_dir   = sys.argv[1]
out_jsonl  = sys.argv[2]

lines = []
lines.append(json.dumps({"type":"version","version":1}))

lines.append(json.dumps({
    "type": "team",
    "team": {
        "name":         "google-import",
        "display_name": "Google Import",
        "type":         "O",
    }
}))

def sanitize(name):
    return re.sub(r"[^a-z0-9_\-]", "-", name.lower()).strip("-")[:64] or "channel"

def ts_to_ms(ts_str):
    ts_str = str(ts_str).strip()
    for fmt in [
        "%A, %B %d, %Y at %I:%M:%S %p %Z",
        "%A, %d. %B %Y um %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
    ]:
        try:
            dt = datetime.strptime(ts_str[:50], fmt)
            return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
        except:
            pass
    try:
        us = int(ts_str)
        if us > 1e15:
            return int(us / 1000)
        elif us > 1e12:
            return int(us)
        elif us > 1e9:
            return int(us * 1000)
    except:
        pass
    return 0

users_seen = set()

def ensure_user(name, email=""):
    if not name or name in users_seen:
        return re.sub(r"[^a-z0-9._\-]", ".", (name or "unknown").lower())
    users_seen.add(name)
    uname = re.sub(r"[^a-z0-9._\-]", ".", name.lower())
    lines.append(json.dumps({
        "type": "user",
        "user": {
            "username":  uname,
            "email":     email or f"{uname}@import.local",
            "roles":     "system_user",
        }
    }))
    return uname

channels_created = set()

for subdir_name in ["Groups", "DMs"]:
    subdir = os.path.join(chat_dir, subdir_name)
    if not os.path.isdir(subdir):
        continue

    for entry in os.scandir(subdir):
        if not entry.is_dir():
            continue

        ch_name = sanitize(entry.name)
        ch_type = "O" if subdir_name == "Groups" else "P"

        if ch_name not in channels_created:
            lines.append(json.dumps({
                "type": "channel",
                "channel": {
                    "team":         "google-import",
                    "name":         ch_name,
                    "display_name": entry.name[:64],
                    "type":         ch_type,
                }
            }))
            channels_created.add(ch_name)

        for msg_file in glob.glob(os.path.join(entry.path, "**", "messages.json"), recursive=True):
            try:
                with open(msg_file, encoding="utf-8", errors="replace") as f:
                    data = json.load(f)
            except:
                continue

            messages = data if isinstance(data, list) else data.get("messages", [])

            for msg in messages:
                if not isinstance(msg, dict):
                    continue

                creator = msg.get("creator", {})
                if isinstance(creator, dict):
                    sender_name = creator.get("name", "") or creator.get("email", "unknown")
                    sender_email = creator.get("email", "")
                elif isinstance(creator, str):
                    sender_name = creator
                    sender_email = creator if "@" in creator else ""
                else:
                    sender_name = "unknown"
                    sender_email = ""

                uname = ensure_user(sender_name, sender_email)

                text = msg.get("text", "") or ""
                if not text.strip():
                    continue

                ts = msg.get("created_date", "") or msg.get("date", "") or ""
                create_at = ts_to_ms(ts) if ts else 0

                attachments = []
                for att in msg.get("attached_files", []) or []:
                    att_name = att.get("export_name", "") or att.get("original_name", "")
                    if att_name:
                        attachments.append({"path": att_name})

                lines.append(json.dumps({
                    "type": "post",
                    "post": {
                        "team":        "google-import",
                        "channel":     ch_name,
                        "user":        uname,
                        "message":     text,
                        "create_at":   create_at,
                        "attachments": attachments,
                    }
                }))

with open(out_jsonl, "w") as f:
    f.write("\n".join(lines) + "\n")

post_count = len([l for l in lines if '"post"' in l])
print(f"Konvertiert: {post_count} Nachrichten in {len(channels_created)} Kanälen")
PYEOF

  success "Google Chat Konvertierung abgeschlossen"
  echo "$output_jsonl"
}

# ── Google Drive → Nextcloud ─────────────────────────────────────────
google_import_drive() {
  local source_dir="$1"
  local drive_dir="${source_dir}/Drive/My Drive"
  [[ ! -d "$drive_dir" ]] && drive_dir="${source_dir}/Drive"
  [[ ! -d "$drive_dir" ]] && { warn "Kein Google Drive Verzeichnis gefunden"; return 0; }

  nc_upload_files "$drive_dir" "Google-Drive-Import"
}

# ── Google Kalender → Nextcloud ──────────────────────────────────────
google_import_calendar() {
  local source_dir="$1"
  local cal_dir=""
  [[ -d "${source_dir}/Kalender" ]] && cal_dir="${source_dir}/Kalender"
  [[ -d "${source_dir}/Calendar" ]] && cal_dir="${source_dir}/Calendar"
  [[ -z "$cal_dir" ]] && { warn "Kein Kalender-Verzeichnis gefunden"; return 0; }

  local imported=0
  while IFS= read -r ics_file; do
    [[ -z "$ics_file" ]] && continue
    local cal_name
    cal_name=$(basename "${ics_file%.ics}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')
    local display_name
    display_name=$(basename "${ics_file%.ics}")

    nc_upload_calendar "$ics_file" "google-${cal_name}" "Google: ${display_name}"
    ((imported++)) || true
  done < <(find "$cal_dir" -name "*.ics" -type f 2>/dev/null)

  [[ $imported -eq 0 ]] && warn "Keine .ics Dateien gefunden in $cal_dir"
}

# ── Google Kontakte → Nextcloud ──────────────────────────────────────
google_import_contacts() {
  local source_dir="$1"
  local contacts_dir=""
  [[ -d "${source_dir}/Kontakte" ]]  && contacts_dir="${source_dir}/Kontakte"
  [[ -d "${source_dir}/Contacts" ]] && contacts_dir="${source_dir}/Contacts"
  [[ -z "$contacts_dir" ]] && { warn "Kein Kontakte-Verzeichnis gefunden"; return 0; }

  local merged_vcf="${WORKDIR}/google-contacts-merged.vcf"
  : > "$merged_vcf"

  while IFS= read -r vcf_file; do
    cat "$vcf_file" >> "$merged_vcf"
    echo "" >> "$merged_vcf"
  done < <(find "$contacts_dir" -name "*.vcf" -type f 2>/dev/null)

  if [[ -s "$merged_vcf" ]]; then
    nc_upload_contacts "$merged_vcf" "google-import"
  else
    warn "Keine .vcf Dateien gefunden in $contacts_dir"
  fi
}

# ── Haupt-Einstiegspunkt ────────────────────────────────────────────
run_google_import() {
  local source="$1"
  local do_chat="${2:-true}"
  local do_drive="${3:-true}"
  local do_calendar="${4:-true}"
  local do_contacts="${5:-true}"
  local mm_url="$6" mm_user="$7" mm_pass="$8"
  local nc_url="$9" nc_user="${10}" nc_pass="${11}"

  google_check_deps || return 1

  local source_dir
  source_dir=$(google_prepare_source "$source") || return 1

  info "Takeout-Verzeichnis: $source_dir"

  local content
  content=$(google_detect_content "$source_dir") || return 1
  success "Gefundene Datentypen: $(echo "$content" | tr '\n' ', ' | sed 's/,$//')"

  # Google Chat → Mattermost
  if [[ "$do_chat" == "true" ]] && echo "$content" | grep -q "chat"; then
    local jsonl_file
    jsonl_file=$(google_import_chat "$source_dir") || true

    if [[ -n "$jsonl_file" && -f "$jsonl_file" && -n "$mm_url" ]]; then
      info "Import-Datei: $jsonl_file ($(du -sh "$jsonl_file" | cut -f1))"
      slack_upload "$jsonl_file" "$mm_url" "$mm_user" "$mm_pass" 2>/dev/null || \
        warn "Mattermost-Upload fehlgeschlagen — JSONL liegt unter: $jsonl_file"
    fi
  fi

  # Nextcloud-Importe
  if [[ -n "$nc_url" ]]; then
    NC_URL="$nc_url" NC_USER="$nc_user" NC_PASS="$nc_pass"
    export NC_URL NC_USER NC_PASS

    if [[ "$do_drive" == "true" ]] && echo "$content" | grep -q "drive"; then
      google_import_drive "$source_dir"
    fi

    if [[ "$do_calendar" == "true" ]] && echo "$content" | grep -q "calendar"; then
      google_import_calendar "$source_dir"
    fi

    if [[ "$do_contacts" == "true" ]] && echo "$content" | grep -q "contacts"; then
      google_import_contacts "$source_dir"
    fi
  fi
}
