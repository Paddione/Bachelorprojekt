#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# slack-import.sh — Slack → Mattermost Konverter
# ═══════════════════════════════════════════════════════════════════
# Konvertiert einen Slack-Export (ZIP oder entpacktes Verzeichnis)
# in das Mattermost Bulk Import Format (JSONL) und lädt es hoch.
#
# Slack Export besorgen:
#   Workspace Admin → Settings & Permissions → Import/Export Data
#   → Export → Export Type: All Messages → Download
#
# Dokumentation:
#   https://docs.mattermost.com/onboard/migrating-to-mattermost.html
# ═══════════════════════════════════════════════════════════════════

# Wird als Library von migrate.sh geladen — nicht direkt ausführen

slack_check_deps() {
  local missing=()
  command -v jq      &>/dev/null || missing+=("jq")
  command -v python3 &>/dev/null || missing+=("python3")
  command -v unzip   &>/dev/null || missing+=("unzip")
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Fehlende Tools: ${missing[*]}"
    error "Installieren mit: apt install ${missing[*]}"
    return 1
  fi
}

# ZIP entpacken wenn nötig, gibt den Pfad zum entpackten Verzeichnis zurück
slack_prepare_source() {
  local source="$1"
  local workdir="${WORKDIR}/slack-source"

  if [[ -f "$source" && "$source" == *.zip ]]; then
    info "Entpacke Slack-Export: $source"
    mkdir -p "$workdir"
    unzip -q "$source" -d "$workdir"
    # Manche Exports haben ein verschachteltes Unterverzeichnis
    local inner
    inner=$(find "$workdir" -maxdepth 1 -mindepth 1 -type d | head -1)
    if [[ -n "$inner" ]] && [[ -f "${inner}/channels.json" ]]; then
      echo "$inner"
    else
      echo "$workdir"
    fi
  elif [[ -d "$source" ]] && [[ -f "${source}/channels.json" ]]; then
    echo "$source"
  else
    error "Ungültige Slack-Export-Quelle: $source"
    error "Erwartet: ZIP-Datei oder Verzeichnis mit channels.json"
    return 1
  fi
}

# Slack Export → Mattermost JSONL konvertieren
slack_convert() {
  local source_dir="$1"
  local output_file="${WORKDIR}/slack-import.jsonl"
  local attachments_dir="${WORKDIR}/slack-attachments"

  info "Lese Slack-Export aus: $source_dir"

  # channels.json + users.json validieren
  [[ ! -f "${source_dir}/channels.json" ]] && { error "channels.json nicht gefunden"; return 1; }
  [[ ! -f "${source_dir}/users.json" ]]    && { error "users.json nicht gefunden"; return 1; }

  mkdir -p "$attachments_dir"
  : > "$output_file"

  python3 - "$source_dir" "$output_file" "$attachments_dir" << 'PYEOF'
import json, sys, os, re
from datetime import datetime, timezone

src   = sys.argv[1]
out   = sys.argv[2]
att_d = sys.argv[3]

with open(f"{src}/channels.json") as f: channels = json.load(f)
with open(f"{src}/users.json")    as f: users    = json.load(f)

# User-Map: Slack ID → Mattermost-freundlicher Username
user_map = {}
for u in users:
    uid   = u.get("id","")
    uname = re.sub(r"[^a-z0-9._\-]", ".", u.get("name","user").lower())
    user_map[uid] = {
        "username":     uname,
        "email":        u.get("profile",{}).get("email", f"{uname}@import.local"),
        "display_name": u.get("real_name") or u.get("name",""),
        "first_name":   u.get("profile",{}).get("first_name",""),
        "last_name":    u.get("profile",{}).get("last_name",""),
    }

lines = []

# Version
lines.append(json.dumps({"type":"version","version":1}))

# User
for uid, u in user_map.items():
    lines.append(json.dumps({
        "type": "user",
        "user": {
            "username":    u["username"],
            "email":       u["email"],
            "nickname":    u["display_name"],
            "first_name":  u["first_name"],
            "last_name":   u["last_name"],
            "auth_service":"",
            "roles":       "system_user",
        }
    }))

# Team (ein Team pro Import)
lines.append(json.dumps({
    "type": "team",
    "team": {
        "name":         "slack-import",
        "display_name": "Slack Import",
        "type":         "O",
    }
}))

# Channels + Posts
for ch in channels:
    ch_name = re.sub(r"[^a-z0-9_\-]", "-", ch.get("name","channel").lower())
    ch_purpose = ch.get("purpose",{}).get("value","")
    ch_type    = "O" if not ch.get("is_private") else "P"

    lines.append(json.dumps({
        "type": "channel",
        "channel": {
            "team":         "slack-import",
            "name":         ch_name,
            "display_name": ch.get("name",""),
            "type":         ch_type,
            "header":       ch_purpose[:1024],
            "purpose":      ch_purpose[:250],
        }
    }))

    # Nachrichten (eine JSON-Datei pro Tag)
    ch_dir = os.path.join(src, ch["name"])
    if not os.path.isdir(ch_dir):
        continue

    msg_files = sorted(f for f in os.listdir(ch_dir) if f.endswith(".json"))
    for mf in msg_files:
        with open(os.path.join(ch_dir, mf)) as f:
            messages = json.load(f)
        for msg in messages:
            if msg.get("subtype") in ("channel_join","channel_leave","bot_message"):
                continue
            user_id = msg.get("user","")
            user    = user_map.get(user_id, {"username":"unknown"})
            ts      = float(msg.get("ts","0"))
            text    = msg.get("text","")

            # Slack user/channel mentions umwandeln
            for uid2, u2 in user_map.items():
                text = text.replace(f"<@{uid2}>", f"@{u2['username']}")
            text = re.sub(r"<#[A-Z0-9]+\|([^>]+)>", r"~\1", text)
            text = re.sub(r"<(https?://[^|>]+)\|([^>]+)>", r"[\2](\1)", text)
            text = re.sub(r"<(https?://[^>]+)>", r"\1", text)

            post_obj = {
                "type": "post",
                "post": {
                    "team":         "slack-import",
                    "channel":      ch_name,
                    "user":         user["username"],
                    "message":      text,
                    "create_at":    int(ts * 1000),
                    "replies":      [],
                    "attachments":  [],
                }
            }

            # Thread-Antworten
            if "replies" in msg:
                for reply in msg.get("replies",[]):
                    pass  # Werden durch eigene Nachrichten mit thread_ts erfasst

            lines.append(json.dumps(post_obj))

with open(out, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"Konvertiert: {len(lines)} Einträge")
PYEOF

  local line_count
  line_count=$(wc -l < "$output_file")
  success "Konvertierung abgeschlossen: ${line_count} Zeilen in $output_file"
  echo "$output_file"
}

# JSONL per mmctl in Mattermost importieren
slack_upload() {
  local jsonl_file="$1"
  local mm_url="$2"
  local mm_user="$3"
  local mm_pass="$4"

  info "Lade Import in Mattermost hoch: $mm_url"

  # mmctl prüfen / herunterladen
  if ! command -v mmctl &>/dev/null; then
    info "mmctl nicht gefunden — lade aktuelle Version herunter..."
    local mmctl_url="https://releases.mattermost.com/mmctl/release/v9.7.0/linux_amd64.tar"
    if [[ "$(detect_os)" == "macos" ]]; then
      mmctl_url="https://releases.mattermost.com/mmctl/release/v9.7.0/darwin_amd64.tar"
    fi
    curl -sL "$mmctl_url" | tar -xf - -C "${WORKDIR}"
    export PATH="${WORKDIR}:$PATH"
  fi

  # Login
  mmctl auth login "$mm_url" --name slack-import \
    --username "$mm_user" --password "$mm_pass" 2>&1 | grep -v "^$" || true

  # JSONL hochladen
  local import_name="slack-$(date +%Y%m%d-%H%M%S).jsonl"
  cp "$jsonl_file" "${WORKDIR}/${import_name}"

  if $DRY_RUN; then
    warn "[DRY-RUN] Würde hochladen: $jsonl_file → Mattermost $mm_url"
    return 0
  fi

  mmctl import upload "${WORKDIR}/${import_name}" 2>&1
  local upload_id
  upload_id=$(mmctl import list --json 2>/dev/null | jq -r '.[-1].id // empty')

  if [[ -n "$upload_id" ]]; then
    mmctl import process "$upload_id" 2>&1
    success "Import gestartet (ID: $upload_id). Status: mmctl import job list"
  else
    warn "Upload abgeschlossen — prüfe Mattermost Admin → Site Configuration → Import"
  fi
}

# Haupt-Einstiegspunkt
run_slack_import() {
  local source="$1"
  local mm_url="$2"
  local mm_user="$3"
  local mm_pass="$4"

  slack_check_deps || return 1

  local source_dir
  source_dir=$(slack_prepare_source "$source") || return 1

  local jsonl_file
  jsonl_file=$(slack_convert "$source_dir") || return 1

  echo ""
  info "Import-Datei bereit: $jsonl_file"
  info "Größe: $(du -sh "$jsonl_file" | cut -f1)"
  echo ""

  if [[ -z "$mm_url" ]]; then
    echo -n "Mattermost URL (z.B. https://chat.example.com): "
    read -r mm_url
  fi
  if [[ -z "$mm_user" ]]; then
    echo -n "Mattermost Admin-User: "
    read -r mm_user
  fi
  if [[ -z "$mm_pass" ]]; then
    read -rsp "Mattermost Admin-Passwort: " mm_pass; echo
  fi

  slack_upload "$jsonl_file" "$mm_url" "$mm_user" "$mm_pass"
}
