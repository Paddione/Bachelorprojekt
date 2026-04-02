#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# OpenClaw Mattermost Setup
# Creates an openclaw bot + admin-only channels in every team.
# Run via: task mcp:mattermost-setup
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

MM_URL="${MM_URL:-http://mattermost.homeoffice.svc.cluster.local:8065}"
MM_TOKEN="${MM_TOKEN:?MM_TOKEN env var required (use mmctl token generate)}"

api() {
  local method="$1" path="$2"; shift 2
  curl -sf -X "$method" -H "Authorization: Bearer $MM_TOKEN" -H "Content-Type: application/json" "$@" "$MM_URL/api/v4$path"
}

echo "=== 1. Creating OpenClaw Bot ==="
BOT=$(api POST /bots -d '{
  "username": "openclaw",
  "display_name": "OpenClaw",
  "description": "KI-Assistent für Cluster- und Service-Management. Alle Aktionen erfordern Admin-Genehmigung."
}' 2>/dev/null) || true

if echo "$BOT" | grep -q '"user_id"'; then
  BOT_USER_ID=$(echo "$BOT" | python3 -c "import sys,json; print(json.load(sys.stdin)['user_id'])")
  echo "  Bot created: user_id=$BOT_USER_ID"
else
  # Bot might already exist
  BOT_USER_ID=$(api GET "/bots?include_deleted=false" | python3 -c "
import sys,json
bots = json.load(sys.stdin)
for b in bots:
  if b['username'] == 'openclaw':
    print(b['user_id'])
    break
" 2>/dev/null)
  if [ -z "$BOT_USER_ID" ]; then
    echo "  ERROR: Could not create or find openclaw bot"
    exit 1
  fi
  echo "  Bot already exists: user_id=$BOT_USER_ID"
fi

# Generate bot token
BOT_TOKEN_RESP=$(api POST "/users/$BOT_USER_ID/tokens" -d '{"description": "openclaw-mcp"}' 2>/dev/null) || true
BOT_ACCESS_TOKEN=$(echo "$BOT_TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$BOT_ACCESS_TOKEN" ]; then
  echo "  Bot access token generated (save this!):"
  echo "  OPENCLAW_MM_BOT_TOKEN=$BOT_ACCESS_TOKEN"
fi

# Get admin user IDs (system_admin role)
echo ""
echo "=== 2. Identifying Admin Users ==="
ADMIN_IDS=$(api GET "/users?per_page=200" | python3 -c "
import sys,json
users = json.load(sys.stdin)
admins = [u for u in users if 'system_admin' in u.get('roles','')]
for a in admins:
    print(f'  Admin: {a[\"username\"]} ({a[\"id\"]})')
ids = [a['id'] for a in admins]
# Print IDs on a single line for bash
import sys
sys.stderr.write(','.join(ids))
" 2>/tmp/admin_ids.txt)
ADMIN_IDS=$(cat /tmp/admin_ids.txt)
echo "$ADMIN_IDS" | tr ',' '\n' | while read -r id; do echo "  $id"; done

# Channel header with MCP capabilities (easy German)
CHANNEL_HEADER="🤖 OpenClaw — KI-Assistent | Alle Aktionen benötigen Genehmigung"

CHANNEL_PURPOSE=$(cat << 'PURPOSEEOF'
## 🤖 OpenClaw — Kommunikationskanal

Dieser Kanal ist die Schnittstelle zwischen dem OpenClaw KI-Assistenten und den Administratoren.

### ⚠️ Genehmigungsworkflow
OpenClaw wird jede geplante Aktion **vor der Ausführung** hier beschreiben:
1. **Was** soll gemacht werden (einfache Beschreibung auf Deutsch)
2. **Warum** ist die Aktion nötig
3. **Auswirkung** — was ändert sich dadurch
4. **Vorgeschlagene Antwort**: ✅ Genehmigt / ❌ Abgelehnt / 🔄 Anpassen

Erst nach expliziter Admin-Genehmigung wird die Aktion ausgeführt.

---

### 🔧 Verfügbare MCP-Dienste

**Kubernetes (Cluster-Verwaltung)**
- Pods, Deployments und Services anzeigen
- Pod-Logs lesen
- Deployments neustarten oder skalieren
- IngressRoutes und Middlewares prüfen

**PostgreSQL (Datenbank-Abfragen)**
- Nur-Lesen-Zugriff auf: Mattermost, Keycloak, Nextcloud, Spacedeck
- SQL-Abfragen für Debugging und Analyse
- Datenbank wechseln: Mattermost (Standard), Keycloak, Nextcloud

**Mattermost (Team-Chat)**
- Nachrichten lesen und senden
- Kanäle auflisten und beitreten
- Nachrichten suchen, Threads lesen
- Dateien hochladen, Reaktionen setzen

**Nextcloud (Dateien & Kalender)**
- Dateien lesen, erstellen, verschieben, löschen (WebDAV)
- Kalender: Termine anzeigen und erstellen
- Kontakte verwalten (CardDAV)
- Notizen, Deck-Boards (Kanban), Tabellen
- Rezepte und Lesezeichen verwalten

**Keycloak (Benutzerverwaltung & SSO)**
- Benutzer anlegen, bearbeiten, löschen
- Gruppen und Rollen verwalten
- OIDC-Clients konfigurieren
- Passwörter zurücksetzen
- Authentifizierungsflows anzeigen
- ⚠️ Benötigt JWT-Token (wird automatisch geholt)

**Invoice Ninja (Rechnungen & Buchhaltung)**
- Kunden, Rechnungen, Angebote anzeigen
- Zahlungen und Ausgaben verwalten
- Projekte und Aufgaben einsehen
- Steuerberichte erstellen

**WordPress (Webseite)**
- Inhalte verwalten (Seiten, Beiträge, Medien)
- WordPress-Abilities-API für erweiterte Funktionen
- ⚠️ Authentifizierung über Application Password

---

### 💬 Beispiel-Interaktion

**OpenClaw:**
> 📋 **Aktion:** Nextcloud-Benutzer "neuer.mitarbeiter" anlegen
>
> **Beschreibung:** Ein neuer Benutzer soll in Nextcloud angelegt werden mit Standardgruppe "Mitarbeiter" und 5GB Speicherplatz.
>
> **Auswirkung:** Neuer Benutzer wird in Nextcloud erstellt. Keycloak-SSO wird automatisch verknüpft beim ersten Login.
>
> Vorgeschlagene Antworten:
> - ✅ **Genehmigt** — Benutzer wird angelegt
> - ❌ **Abgelehnt** — Aktion wird nicht ausgeführt
> - 🔄 **Anpassen** — z.B. "Bitte mit 10GB Speicher"

**Admin:** ✅ Genehmigt
PURPOSEEOF
)

echo ""
echo "=== 3. Creating openclaw channels ==="

# Get all teams
TEAMS=$(api GET "/teams")
TEAM_IDS=$(echo "$TEAMS" | python3 -c "import sys,json; [print(t['id'],t['name']) for t in json.load(sys.stdin)]")

echo "$TEAM_IDS" | while read -r team_id team_name; do
  echo ""
  echo "  Team: $team_name ($team_id)"

  # Create private channel
  CHANNEL=$(api POST /channels -d "{
    \"team_id\": \"$team_id\",
    \"name\": \"openclaw\",
    \"display_name\": \"🤖 OpenClaw\",
    \"type\": \"P\",
    \"header\": \"$CHANNEL_HEADER\",
    \"purpose\": \"KI-Assistent — nur für Admins\"
  }" 2>/dev/null) || true

  if echo "$CHANNEL" | grep -q '"id"'; then
    CHANNEL_ID=$(echo "$CHANNEL" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    echo "    Channel created: $CHANNEL_ID"
  else
    # Channel might already exist
    CHANNEL_ID=$(api GET "/teams/$team_id/channels/name/openclaw" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
    if [ -z "$CHANNEL_ID" ]; then
      echo "    ERROR: Could not create or find openclaw channel in team $team_name"
      continue
    fi
    echo "    Channel already exists: $CHANNEL_ID"
  fi

  # Update channel purpose with full MCP capabilities description
  api PUT "/channels/$CHANNEL_ID/patch" -d "{
    \"purpose\": $(echo "$CHANNEL_PURPOSE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
  }" > /dev/null 2>&1 && echo "    Purpose updated with MCP capabilities"

  # Add bot to channel
  api POST "/channels/$CHANNEL_ID/members" -d "{\"user_id\": \"$BOT_USER_ID\"}" > /dev/null 2>&1 && \
    echo "    Bot added to channel" || echo "    Bot already in channel"

  # Add all admin users to channel
  echo "$ADMIN_IDS" | tr ',' '\n' | while read -r admin_id; do
    [ -z "$admin_id" ] && continue
    api POST "/channels/$CHANNEL_ID/members" -d "{\"user_id\": \"$admin_id\"}" > /dev/null 2>&1
  done
  echo "    Admin users added to channel"

  # Post welcome message
  api POST /posts -d "{
    \"channel_id\": \"$CHANNEL_ID\",
    \"message\": \"## 🤖 OpenClaw ist bereit!\n\nHallo! Ich bin **OpenClaw**, euer KI-Assistent für das Homeoffice-Cluster.\n\n### So funktioniert es:\n1. Ich schlage Aktionen vor und erkläre sie auf Deutsch\n2. Ihr antwortet mit **✅ Genehmigt**, **❌ Abgelehnt** oder **🔄 Anpassen**\n3. Erst nach eurer Genehmigung führe ich die Aktion aus\n\n### Verfügbare Dienste:\n| Dienst | Funktion |\n|---|---|\n| 🏗️ Kubernetes | Pods, Logs, Deployments verwalten |\n| 🗄️ PostgreSQL | Datenbank-Abfragen (nur lesen) |\n| 💬 Mattermost | Nachrichten, Kanäle, Dateien |\n| 📁 Nextcloud | Dateien, Kalender, Kontakte, Deck |\n| 🔐 Keycloak | Benutzer, Gruppen, SSO |\n| 💰 Invoice Ninja | Rechnungen, Kunden, Ausgaben |\n| 🌐 WordPress | Webseite-Inhalte verwalten |\n\nSchreibt mir einfach, was ihr braucht — ich erkläre jeden Schritt bevor ich ihn ausführe.\",
    \"props\": {\"from_bot\": \"true\"}
  }" > /dev/null 2>&1 && echo "    Welcome message posted"
done

echo ""
echo "=== Done ==="
if [ -n "$BOT_ACCESS_TOKEN" ]; then
  echo ""
  echo "IMPORTANT: Update the openclaw-secrets with the bot token:"
  echo "  kubectl patch secret openclaw-secrets --type='json' \\"
  echo "    -p='[{\"op\":\"replace\",\"path\":\"/data/MATTERMOST_TOKEN\",\"value\":\"'$(echo -n "$BOT_ACCESS_TOKEN" | base64 -w0)'\"}]'"
  echo ""
  echo "  Then restart the MCP: task mcp:restart -- core"
fi
