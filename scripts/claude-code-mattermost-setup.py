#!/usr/bin/env python3
"""Claude Code Mattermost channel setup — creates admin-only channels in every team."""

import json
import os
import sys
import urllib.request
import urllib.error

MM_URL = os.environ.get("MM_URL", "http://mattermost.workspace.svc.cluster.local:8065")
MM_TOKEN = os.environ["MM_TOKEN"]

def api(method, path, data=None):
    url = f"{MM_URL}/api/v4{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {MM_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        return {"error": True, "status": e.code, "message": err}

# ── 1. Find or verify claude-code bot ─────────────────────────────────────
print("=== 1. Claude Code Bot ===")
bots = api("GET", "/bots?include_deleted=false")
bot = next((b for b in bots if b["username"] == "claude-code"), None) if isinstance(bots, list) else None

if bot:
    bot_user_id = bot["user_id"]
    print(f"  Bot exists: {bot_user_id}")
else:
    result = api("POST", "/bots", {
        "username": "claude-code",
        "display_name": "Claude Code",
        "description": "KI-Assistent — alle Aktionen benötigen Admin-Genehmigung",
    })
    if "error" in result:
        print(f"  Could not create bot: {result}")
        sys.exit(1)
    bot_user_id = result["user_id"]
    print(f"  Bot created: {bot_user_id}")

# ── 2. Find admin users ────────────────────────────────────────────────
print("\n=== 2. Admin Users ===")
users = api("GET", "/users?per_page=200")
admins = [u for u in users if "system_admin" in u.get("roles", "")]
for a in admins:
    print(f"  {a['username']} ({a['id']})")
admin_ids = [a["id"] for a in admins]

# ── 3. Get teams ───────────────────────────────────────────────────────
print("\n=== 3. Teams ===")
teams = api("GET", "/teams")
for t in teams:
    print(f"  {t['name']} ({t['id']})")

# ── Channel header and welcome message ─────────────────────────────────
HEADER = "🤖 Claude Code — KI-Assistent | Alle Aktionen benötigen Genehmigung"

PURPOSE = """KI-Assistent für Cluster- und Service-Management. Nur für Admins.
Workflow: Claude Code beschreibt → Admin genehmigt → Aktion wird ausgeführt.
Antworten: ✅ Genehmigt | ❌ Abgelehnt | 🔄 Anpassen"""

WELCOME = """## 🤖 Claude Code ist bereit!

Hallo! Ich bin **Claude Code**, euer KI-Assistent für das Workspace-Cluster.

### So funktioniert es:
1. Ich schlage Aktionen vor und erkläre sie **auf Deutsch**
2. Ihr antwortet mit **✅ Genehmigt**, **❌ Abgelehnt** oder **🔄 Anpassen**
3. Erst nach eurer Genehmigung führe ich die Aktion aus

### Verfügbare Dienste:

| Dienst | Funktion |
|---|---|
| 🏗️ **Kubernetes** | Pods, Logs, Deployments anzeigen & neustarten |
| 🗄️ **PostgreSQL** | Datenbank-Abfragen (nur lesen) — Mattermost, Keycloak, Nextcloud |
| 💬 **Mattermost** | Nachrichten lesen & senden, Kanäle, Dateien, Suche |
| 📁 **Nextcloud** | Dateien (WebDAV), Kalender, Kontakte, Notizen, Deck-Boards |
| 🔐 **Keycloak** | Benutzer & Gruppen verwalten, Rollen, OIDC-Clients, SSO |
| 💰 **Invoice Ninja** | Kunden, Rechnungen, Angebote, Zahlungen, Ausgaben |
| 🌐 **Website** | Astro-basierte Coaching-Website (${BRAND_NAME}) |

---

### 💬 Beispiel-Interaktion:

> 📋 **Aktion:** Deployment `nextcloud` neustarten
>
> **Beschreibung:** Das Nextcloud-Deployment im Namespace `workspace` wird neugestartet. Alle aktiven Sitzungen werden kurz unterbrochen (~30 Sekunden).
>
> **Auswirkung:** Benutzer sehen kurzzeitig eine Fehlermeldung, danach funktioniert alles normal.
>
> **Antworten:**
> - ✅ **Genehmigt** — Neustart wird ausgeführt
> - ❌ **Abgelehnt** — Nichts passiert
> - 🔄 **Anpassen** — z.B. "Bitte erst nach 18 Uhr"

---
Schreibt mir einfach, was ihr braucht! 🐾"""

# ── 4. Create channels in each team ────────────────────────────────────
print("\n=== 4. Creating Channels ===")
for team in teams:
    tid = team["id"]
    tname = team["name"]
    print(f"\n  Team: {tname}")

    # Check if channel exists
    existing = api("GET", f"/teams/{tid}/channels/name/claude-code")
    if "error" not in existing and "id" in existing:
        cid = existing["id"]
        print(f"    Channel already exists: {cid}")
    else:
        result = api("POST", "/channels", {
            "team_id": tid,
            "name": "claude-code",
            "display_name": "🤖 Claude Code",
            "type": "P",
            "header": HEADER,
            "purpose": PURPOSE,
        })
        if "error" in result:
            print(f"    ERROR creating channel: {result.get('message','unknown')}")
            continue
        cid = result["id"]
        print(f"    Channel created: {cid}")

    # Update header/purpose (idempotent)
    api("PUT", f"/channels/{cid}/patch", {"header": HEADER, "purpose": PURPOSE})
    print("    Header & purpose updated")

    # Add bot to channel
    r = api("POST", f"/channels/{cid}/members", {"user_id": bot_user_id})
    print(f"    Bot {'added' if 'error' not in r else 'already in channel'}")

    # Add admin users
    for aid in admin_ids:
        api("POST", f"/channels/{cid}/members", {"user_id": aid})
    print(f"    {len(admin_ids)} admin(s) added")

    # Post welcome message (only if channel was just created)
    if "error" in existing:
        api("POST", "/posts", {
            "channel_id": cid,
            "message": WELCOME,
            "props": {"from_bot": "true"},
        })
        print("    Welcome message posted")

print("\n=== Done ===")
print(f"\nBot user ID: {bot_user_id}")
print("Channels created in all teams with admin-only access.")
