#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# teams-import.sh — Microsoft Teams → Nextcloud
# ═══════════════════════════════════════════════════════════════════
# Importiert aus zwei Quellen:
#
# A) GDPR-Datenexport (empfohlen — vollständig):
#    myaccount.microsoft.com → Privacy → Download your data
#    Enthält: Chats, Dateien, Kalender, Kontakte
#
# B) Lokaler Teams-Cache (Fallback — nur Nachrichten-Snippets):
#    Liest den IndexedDB/leveldb Cache der Teams-App aus.
#    Unvollständig, aber nützlich wenn kein GDPR-Export verfügbar.
#
# Ausgabe:
#   - Dateien, Kalender, Kontakte → Nextcloud (WebDAV/CalDAV/CardDAV)
#   - Dateien/Attachments       → Nextcloud (WebDAV upload)
#   - Kalender                  → .ics Datei (Nextcloud Calendar)
#   - Kontakte                  → .vcf Datei (Nextcloud Contacts)
# ═══════════════════════════════════════════════════════════════════

teams_check_deps() {
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

# ZIP entpacken oder Verzeichnis validieren
teams_prepare_source() {
  local source="$1"
  local workdir="${WORKDIR}/teams-source"

  if [[ -f "$source" && "$source" == *.zip ]]; then
    info "Entpacke Teams GDPR-Export: $source"
    mkdir -p "$workdir"
    unzip -q "$source" -d "$workdir"
    # GDPR-Export hat meist ein Unterverzeichnis
    local inner
    inner=$(find "$workdir" -maxdepth 2 -name "manifest.json" | head -1)
    if [[ -n "$inner" ]]; then
      echo "$(dirname "$inner")"
    else
      echo "$workdir"
    fi
  elif [[ -d "$source" ]]; then
    echo "$source"
  else
    error "Ungültige Teams-Quelle: $source"
    return 1
  fi
}

# Erkennt ob Quelle ein GDPR-Export oder Cache ist
teams_detect_type() {
  local source_dir="$1"
  if [[ -f "${source_dir}/manifest.json" ]] || \
     [[ -d "${source_dir}/Teams Chat" ]] || \
     [[ -d "${source_dir}/Teams Chats" ]]; then
    echo "gdpr"
  elif find "$source_dir" -name "*.db" -o -name "*.ldb" 2>/dev/null | grep -q .; then
    echo "cache"
  else
    echo "unknown"
  fi
}

# GDPR-Export → Mattermost JSONL + Nextcloud-Dateien
teams_convert_gdpr() {
  local source_dir="$1"
  local output_jsonl="${WORKDIR}/teams-import.jsonl"
  local files_dir="${WORKDIR}/teams-files"
  mkdir -p "$files_dir"

  info "Verarbeite Teams GDPR-Export..."

python3 - "$source_dir" "$output_jsonl" "$files_dir" << 'PYEOF'
import json, sys, os, re, glob, shutil
from datetime import datetime, timezone

src        = sys.argv[1]
out_jsonl  = sys.argv[2]
files_dir  = sys.argv[3]

lines = []
lines.append(json.dumps({"type":"version","version":1}))

# ── Team & Kanal anlegen ─────────────────────────────────────────────
lines.append(json.dumps({
    "type": "team",
    "team": {
        "name":         "teams-import",
        "display_name": "Teams Import",
        "type":         "O",
    }
}))

def sanitize(name):
    return re.sub(r"[^a-z0-9_\-]", "-", name.lower()).strip("-") or "channel"

def ts_to_ms(ts_str):
    """Diverse Teams-Zeitstempel-Formate → Millisekunden"""
    ts_str = str(ts_str).strip()
    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(ts_str[:26], fmt)
            return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
        except: pass
    return 0

users_seen = set()

def ensure_user(username, email=""):
    if username in users_seen:
        return
    users_seen.add(username)
    uname = re.sub(r"[^a-z0-9._\-]", ".", username.lower())
    lines.append(json.dumps({
        "type": "user",
        "user": {
            "username":  uname,
            "email":     email or f"{uname}@import.local",
            "roles":     "system_user",
        }
    }))
    return uname

def import_messages(messages, channel_name, team="teams-import"):
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        # Sender
        sender = msg.get("from","") or msg.get("Creator","") or msg.get("sender","unknown")
        sender_uname = re.sub(r"[^a-z0-9._\-]", ".", sender.lower().split("@")[0]) or "unknown"
        sender_email = msg.get("fromEmail","") or (sender if "@" in sender else "")
        ensure_user(sender_uname, sender_email)

        content = msg.get("body","") or msg.get("content","") or msg.get("Content","") or ""
        # HTML-Tags entfernen
        content = re.sub(r"<[^>]+>", "", content).strip()
        if not content:
            continue

        ts = msg.get("createdDateTime","") or msg.get("Date","") or msg.get("timestamp","")
        create_at = ts_to_ms(ts) if ts else 0

        # Anhänge
        attachments = []
        for att in msg.get("attachments",[]) or []:
            att_name = att.get("name","")
            att_url  = att.get("contentUrl","") or att.get("url","")
            if att_name:
                attachments.append({"path": att_name})

        lines.append(json.dumps({
            "type": "post",
            "post": {
                "team":        team,
                "channel":     channel_name,
                "user":        sender_uname,
                "message":     content,
                "create_at":   create_at,
                "attachments": attachments,
            }
        }))

# ── Teams Chat-Ordner suchen ─────────────────────────────────────────
chat_dirs = []
for pattern in ["Teams Chat*", "Teams Chats*", "Teams_Chat*", "chats"]:
    chat_dirs.extend(glob.glob(os.path.join(src, pattern)))
    chat_dirs.extend(glob.glob(os.path.join(src, "**", pattern), recursive=True))
chat_dirs = list(set(chat_dirs))

channels_created = set()

for chat_dir in chat_dirs:
    if not os.path.isdir(chat_dir):
        continue
    for entry in os.scandir(chat_dir):
        if not os.path.isdir(entry.path):
            continue
        ch_name = sanitize(entry.name)
        if ch_name not in channels_created:
            lines.append(json.dumps({
                "type": "channel",
                "channel": {
                    "team":         "teams-import",
                    "name":         ch_name,
                    "display_name": entry.name[:64],
                    "type":         "P",  # Private by default für Teams-Chats
                }
            }))
            channels_created.add(ch_name)

        # Nachrichten aus JSON-Dateien
        for msg_file in glob.glob(os.path.join(entry.path, "*.json")):
            try:
                with open(msg_file, encoding="utf-8", errors="replace") as f:
                    data = json.load(f)
                msgs = data if isinstance(data, list) else data.get("messages", data.get("value", []))
                import_messages(msgs, ch_name)
            except: pass

        # Dateien kopieren
        for f in glob.glob(os.path.join(entry.path, "**"), recursive=True):
            if os.path.isfile(f) and not f.endswith(".json"):
                dest = os.path.join(files_dir, ch_name, os.path.basename(f))
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                try: shutil.copy2(f, dest)
                except: pass

# ── Kalender (iCal) ──────────────────────────────────────────────────
cal_output = os.path.join(os.path.dirname(out_jsonl), "teams-calendar.ics")
ics_lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Teams Import//EN"]
for cal_file in glob.glob(os.path.join(src, "**", "*.ics"), recursive=True):
    try:
        with open(cal_file, encoding="utf-8", errors="replace") as f:
            content = f.read()
        # VEVENT-Blöcke extrahieren
        events = re.findall(r"BEGIN:VEVENT.*?END:VEVENT", content, re.DOTALL)
        ics_lines.extend(events)
    except: pass
ics_lines.append("END:VCALENDAR")
if len(ics_lines) > 3:
    with open(cal_output, "w") as f:
        f.write("\n".join(ics_lines))
    print(f"Kalender: {len(ics_lines)-3} Einträge → {cal_output}")

# ── Kontakte (vCard) ──────────────────────────────────────────────────
contacts_output = os.path.join(os.path.dirname(out_jsonl), "teams-contacts.vcf")
vcards = []
for vcf_file in glob.glob(os.path.join(src, "**", "*.vcf"), recursive=True):
    try:
        with open(vcf_file, encoding="utf-8", errors="replace") as f:
            vcards.append(f.read())
    except: pass
if vcards:
    with open(contacts_output, "w") as f:
        f.write("\n".join(vcards))
    print(f"Kontakte: {len(vcards)} Einträge → {contacts_output}")

with open(out_jsonl, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"Nachrichten: {len([l for l in lines if '\"post\"' in l])} Posts in {len(channels_created)} Kanälen")
PYEOF

  success "Konvertierung abgeschlossen"
  echo "$output_jsonl"
}

# Dateien per WebDAV in Nextcloud hochladen (delegiert an nextcloud-api.sh)
teams_upload_files() {
  local files_dir="$1"
  local nc_url="$2"
  local nc_user="$3"
  local nc_pass="$4"

  NC_URL="$nc_url" NC_USER="$nc_user" NC_PASS="$nc_pass" \
    nc_upload_files "$files_dir" "Teams-Import"
}

# Kalender-Datei in Nextcloud Calendar importieren (delegiert an nextcloud-api.sh)
teams_upload_calendar() {
  local ics_file="$1"
  local nc_url="$2"
  local nc_user="$3"
  local nc_pass="$4"

  NC_URL="$nc_url" NC_USER="$nc_user" NC_PASS="$nc_pass" \
    nc_upload_calendar "$ics_file" "teams-import" "Teams Import"
}

# Kontakte in Nextcloud Contacts importieren (delegiert an nextcloud-api.sh)
teams_upload_contacts() {
  local vcf_file="$1"
  local nc_url="$2"
  local nc_user="$3"
  local nc_pass="$4"

  NC_URL="$nc_url" NC_USER="$nc_user" NC_PASS="$nc_pass" \
    nc_upload_contacts "$vcf_file" "teams-import"
}

# Haupt-Einstiegspunkt
run_teams_import() {
  local source="$1"
  local mm_url="$2" mm_user="$3" mm_pass="$4"
  local nc_url="$5" nc_user="$6" nc_pass="$7"

  teams_check_deps || return 1

  local source_dir
  source_dir=$(teams_prepare_source "$source") || return 1

  local source_type
  source_type=$(teams_detect_type "$source_dir")
  info "Erkannter Export-Typ: $source_type"

  if [[ "$source_type" == "unknown" ]]; then
    warn "Konnte Export-Typ nicht eindeutig erkennen — versuche GDPR-Format..."
  fi

  local jsonl_file
  jsonl_file=$(teams_convert_gdpr "$source_dir") || return 1

  echo ""
  info "Import-Datei: $jsonl_file ($(du -sh "$jsonl_file" | cut -f1))"
  echo ""

  # Mattermost-Zugangsdaten abfragen wenn nicht gesetzt
  if [[ -n "${mm_url}" ]]; then
    # Mattermost: Slack-Upload-Funktion wiederverwenden (gleiches Format)
    slack_upload "$jsonl_file" "$mm_url" "$mm_user" "$mm_pass" 2>/dev/null || \
    warn "Mattermost-Upload fehlgeschlagen — JSONL-Datei liegt unter: $jsonl_file"
  fi

  # Nextcloud-Uploads
  if [[ -n "${nc_url}" ]]; then
    teams_upload_files  "${WORKDIR}/teams-files"              "$nc_url" "$nc_user" "$nc_pass"
    teams_upload_calendar "${WORKDIR}/teams-calendar.ics"    "$nc_url" "$nc_user" "$nc_pass"
    teams_upload_contacts "${WORKDIR}/teams-contacts.vcf"    "$nc_url" "$nc_user" "$nc_pass"
  fi
}
