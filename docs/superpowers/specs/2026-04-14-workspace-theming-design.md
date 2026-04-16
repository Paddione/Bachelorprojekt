# Design: Workspace Theming — Dark Navy + Gold

**Datum:** 2026-04-14
**Ticket:** BR-20260414-2568
**Betrifft:** mentolder + korczewski (beide Cluster)

---

## Ziel

Alle Workspace-Services sollen visuell zur mentolder/korczewski-Homepage passen: Dark Navy als Hintergrund, Gold als Akzentfarbe, konsistente Typographie.

---

## Palette

| Variable      | Hex       | Verwendung                   |
|---------------|-----------|------------------------------|
| `--bg`        | `#0f1623` | Haupthintergrund             |
| `--bg-light`  | `#1a2235` | Karten, Sidebar-Hover        |
| `--bg-dark`   | `#0a0f1a` | Sidebar-Header, Topbar       |
| `--bg-darker` | `#070c15` | Team-Bar (Mattermost)        |
| `--border`    | `#243049` | Trennlinien                  |
| `--accent`    | `#e8c870` | Goldakzent, Links, Buttons   |
| `--text`      | `#e8e8f0` | Primärtext                   |
| `--muted`     | `#aabbcc` | Sekundärtext                 |
| `--muted-dark`| `#6b7a8d` | Tertiärtext, Timestamps      |
| Status Up     | `#4caf50` | Online-Indikator, Up-Status  |
| Status Down   | `#ef4444` | Fehler, Down-Status          |
| Status Away   | `#ff9800` | Abwesend                     |

---

## Ansatz

**Approach A** (gewählt): ConfigMap-Änderungen für Docs + MCP, OCC-Befehle in `workspace:post-setup` für Nextcloud, neuer Task `workspace:theme` + Skript für Mattermost.

Alle Änderungen landen in den Manifesten (`k3d/`, `deploy/`, `docs-site/`) und im Taskfile → reproduzierbar bei jedem Deployment.

---

## Feature 1 — Docs (Docsify)

### Was ändert sich

`docs-site/index.html` — CDN-Link `vue.css` wird durch inline `<style>` ersetzt:

```css
:root {
  --theme-color: #e8c870;
  --sidebar-width: 260px;
}
body { background: #0f1623; color: #e8e8f0; }
.sidebar { background: #0a0f1a; border-right: 1px solid #243049; }
.sidebar-toggle { background: #0a0f1a; }
.sidebar-toggle span { background-color: #e8c870; }
.app-nav { background: #0a0f1a; }
h1, h2, h3, h4, h5, h6 { color: #e8e8f0; }
a { color: #e8c870; }
a:hover { color: #f0d88a; }
.sidebar ul li a { color: #aabbcc; }
.sidebar ul li.active > a { color: #e8c870; border-right: 2px solid #e8c870; }
pre, code { background: #1a2235; color: #e8e8f0; }
blockquote { border-left: 4px solid #e8c870; color: #aabbcc; background: #1a2235; }
hr { border-color: #243049; }
table tr:nth-child(2n) { background: #1a2235; }
.content { padding: 30px 40px; }
```

### Deployment

Kein separater Deploy-Schritt nötig — `docs-site/index.html` wird als ConfigMap in `k3d/docs.yaml` gemountet. Nach Änderung: `task workspace:deploy` oder `kubectl rollout restart`.

---

## Feature 2 — MCP Status Page

### Was ändert sich

`deploy/mcp/mcp-status.yaml` — CSS-Farben im inline `<style>` Block anpassen:

| Alt (Tailwind Slate)     | Neu (Mentolder Palette) |
|--------------------------|-------------------------|
| `background: #0f172a`    | `background: #0f1623`   |
| `color: #e2e8f0`         | `color: #e8e8f0`        |
| `.card { background: #1e293b }` | `#1a2235`        |
| `color: #94a3b8` (headings) | `color: #e8c870`     |
| `color: #64748b` (footer) | `color: #6b7a8d`      |
| `color: #94a3b8` (timestamp) | `color: #6b7a8d`  |
| `.dot.unknown { background: #64748b }` | `#6b7a8d` |

`.dot.up` (#22c55e → #4caf50) und `.dot.down` (#ef4444) bleiben semantisch, nur leichte Anpassung bei "up".

### Deployment

`kustomize build k3d/ | kubectl apply -f -` oder `task workspace:deploy`.

---

## Feature 3 — Nextcloud

### OCC-Befehle

Hinzufügen zu `workspace:post-setup` in `Taskfile.yml` (nach den App-Installationen, vor dem Rollout-Restart):

```bash
echo "Applying Nextcloud branding..."
{{.NC_EXEC}} "php occ config:app:set theming name        --value='${BRAND_NAME}'"
{{.NC_EXEC}} "php occ config:app:set theming url         --value='https://web.${PROD_DOMAIN}'"
{{.NC_EXEC}} "php occ config:app:set theming color       --value='#e8c870'"
{{.NC_EXEC}} "php occ config:app:set theming enforce-theme --value=dark"
```

`BRAND_NAME` und `PROD_DOMAIN` kommen aus `.env` (bereits injiziert per `envsubst`). Für k3d-Dev: `mentolder` / `mentolder.localhost`.

### Zusätzlicher Standalone-Task

```yaml
workspace:theme:nextcloud:
  desc: Apply Nextcloud dark+gold branding (idempotent)
  vars:
    NC_EXEC: "kubectl exec -n workspace -c nextcloud deploy/nextcloud -- su -s /bin/bash www-data -c"
  cmds:
    - '{{.NC_EXEC}} "php occ config:app:set theming name         --value={{.BRAND_NAME | default \"mentolder\"}}"'
    - '{{.NC_EXEC}} "php occ config:app:set theming url          --value=https://web.{{.PROD_DOMAIN | default \"mentolder.localhost\"}}"'
    - '{{.NC_EXEC}} "php occ config:app:set theming color        --value=#e8c870"'
    - '{{.NC_EXEC}} "php occ config:app:set theming enforce-theme --value=dark"'
```

---

## Feature 4 — Mattermost

### Theme-JSON

```json
{
  "sidebarBg":              "#0f1623",
  "sidebarText":            "#e8e8f0",
  "sidebarUnreadText":      "#ffffff",
  "sidebarTextHoverBg":     "#1a2235",
  "sidebarTextActiveBorder":"#e8c870",
  "sidebarTextActiveColor": "#e8c870",
  "sidebarHeaderBg":        "#0a0f1a",
  "sidebarTeamBarBg":       "#070c15",
  "sidebarHeaderTextColor": "#e8e8f0",
  "onlineIndicator":        "#4caf50",
  "awayIndicator":          "#ff9800",
  "dndIndicator":           "#ef4444",
  "mentionBg":              "#e8c870",
  "mentionColor":           "#0f1623",
  "centerChannelBg":        "#0f1623",
  "centerChannelColor":     "#e8e8f0",
  "newMessageSeparator":    "#e8c870",
  "linkColor":              "#e8c870",
  "buttonBg":               "#e8c870",
  "buttonColor":            "#0f1623",
  "errorTextColor":         "#ef4444",
  "mentionHighlightBg":     "#1a2235",
  "mentionHighlightLink":   "#e8c870",
  "codeTheme":              "monokai"
}
```

### Skript: `scripts/set-mattermost-theme.sh`

```bash
#!/usr/bin/env bash
# Setzt das Dark+Gold-Theme als Standard für alle User in Mattermost.
# Usage: set-mattermost-theme.sh <mm-url> <admin-user> <admin-password>

set -euo pipefail
MM_URL="${1:-http://mattermost.workspace.svc.cluster.local:8065}"
MM_USER="${2:-admin}"
MM_PASS="${3:-${MATTERMOST_ADMIN_PASSWORD:-devadmin}}"

# Login → Token
TOKEN=$(curl -sf -X POST "$MM_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$MM_USER\",\"password\":\"$MM_PASS\"}" \
  -D - -o /dev/null | grep -i "^token:" | awk '{print $2}' | tr -d '\r')

[[ -z "$TOKEN" ]] && { echo "Login fehlgeschlagen"; exit 1; }

# Theme-JSON (einzeilig, escaped)
THEME='{"sidebarBg":"#0f1623","sidebarText":"#e8e8f0","sidebarUnreadText":"#ffffff","sidebarTextHoverBg":"#1a2235","sidebarTextActiveBorder":"#e8c870","sidebarTextActiveColor":"#e8c870","sidebarHeaderBg":"#0a0f1a","sidebarTeamBarBg":"#070c15","sidebarHeaderTextColor":"#e8e8f0","onlineIndicator":"#4caf50","awayIndicator":"#ff9800","dndIndicator":"#ef4444","mentionBg":"#e8c870","mentionColor":"#0f1623","centerChannelBg":"#0f1623","centerChannelColor":"#e8e8f0","newMessageSeparator":"#e8c870","linkColor":"#e8c870","buttonBg":"#e8c870","buttonColor":"#0f1623","errorTextColor":"#ef4444","mentionHighlightBg":"#1a2235","mentionHighlightLink":"#e8c870","codeTheme":"monokai"}'

# Alle User-IDs holen
USER_IDS=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$MM_URL/api/v4/users?per_page=200&active=true" \
  | python3 -c "import sys,json; print('\n'.join(u['id'] for u in json.load(sys.stdin) if not u.get('is_bot')))")

# Theme-Preference für jeden User setzen
for UID in $USER_IDS; do
  TEAM_IDS=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$MM_URL/api/v4/users/$UID/teams" \
    | python3 -c "import sys,json; print('\n'.join(t['id'] for t in json.load(sys.stdin)))")

  PREFS="["
  for TID in $TEAM_IDS; do
    PREFS+="{\"user_id\":\"$UID\",\"category\":\"theme\",\"name\":\"$TID\",\"value\":$(echo $THEME | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')},"
  done
  # Fallback: leerer Team-Name für globale Präferenz
  PREFS+="{\"user_id\":\"$UID\",\"category\":\"theme\",\"name\":\"\",\"value\":$(echo $THEME | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}"
  PREFS+="]"

  curl -sf -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PREFS" \
    "$MM_URL/api/v4/users/$UID/preferences" >/dev/null
  echo "Theme gesetzt: $UID"
done

# Env-Var-basierter Default für neue User (Banner-Farbe)
curl -sf -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"AnnouncementSettings":{"BannerColor":"#0f1623","BannerTextColor":"#e8c870"}}' \
  "$MM_URL/api/v4/config" >/dev/null

echo "Mattermost-Theme angewendet."
```

### Taskfile-Task

```yaml
workspace:theme:
  desc: Apply dark+gold theme to Mattermost and Nextcloud (idempotent, run after post-setup)
  vars:
    MM_URL: '{{.MM_URL | default "http://mattermost.workspace.svc.cluster.local:8065"}}'
  cmds:
    - echo "=== Mattermost Theme ==="
    - |
      kubectl exec -n workspace deploy/website -- \
        wget -q -O - --post-data='' \
        "{{.MM_URL}}/api/v4/system/ping" >/dev/null 2>&1 || \
        { echo "Mattermost nicht erreichbar"; exit 1; }
    - bash scripts/set-mattermost-theme.sh "{{.MM_URL}}"
    - echo "=== Nextcloud Theme ==="
    - task: workspace:theme:nextcloud
    - echo "Theme vollständig angewendet."
```

### Env-Var-Fallback für neue User (manifest-seitig)

In `k3d/mattermost.yaml` / `prod/patch-mattermost.yaml`:
```yaml
- name: MM_DISPLAYSETTINGS_DEFAULTTHEME
  value: "mattermostDark"          # Nächstes built-in, deckt neu registrierte User ab
- name: MM_ANNOUNCEMENTSETTINGS_BANNERCOLOR
  value: "#0f1623"
- name: MM_ANNOUNCEMENTSETTINGS_BANNERTEXTCOLOR
  value: "#e8c870"
```

`workspace:theme` setzt den vollen Custom-Theme für alle bestehenden User.

---

## Implementierungsreihenfolge

1. **MCP Status Page** — reines CSS, kein Risiko
2. **Docs** — reines CSS
3. **Mattermost** — Skript + Task + Manifest-Patch
4. **Nextcloud** — Taskfile-Erweiterung + Standalone-Task

---

## Nicht im Scope

- Logo-Uploads (Nextcloud, Mattermost) — kein Logo als Datei vorhanden
- Invoice Ninja, Vaultwarden, Keycloak — nicht im Bug-Report genannt
- Per-User-Override verhindern (AllowCustomThemes=false) — bewusst offen gelassen, User sollen Themes noch anpassen können
