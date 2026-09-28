# Credentials finden

Was ein Agent tut, wenn ihm ein Token, Passwort oder API-Key fehlt. Die Quellen werden in
fester Reihenfolge abgefragt. Enthaelt **keine** Credentials.

## Grundregeln

1. **Nie einen Wert ausgeben.** Nicht in die Konsole, nicht in Tickets, Commits, PRs oder
   Logs. Geprueft wird nur, ob ein Schluessel existiert; gelesen wird direkt in eine
   Variable. Zum Vergleichen zweier Werte den Hash nehmen (`sha256sum | cut -c1-12`).
2. **Nie einen Wert erfinden oder neu erzeugen**, um weiterzukommen. Ein neu gewuerfeltes
   Secret ist eine Rotation und gehoert dem Operator.
3. **Schluesselnamen sind SSOT in `environments/schema.yaml`.** Wer den genauen Namen nicht
   kennt, sucht dort zuerst.

## Suchreihenfolge

### 1. Lokale Dienst-Konfiguration (`~/.config/<dienst>/*.env` und `.env`)

Tokens fuer lokal laufende MCP-Server und Werkzeuge liegen je Dienst in einer
`EnvironmentFile`, `chmod 600`, ausserhalb des Repos.

| Datei | Schluessel |
|---|---|
| `~/.config/bge-mcp/server.env` | `BGE_MCP_TOKEN` |
| `~/.config/mcp-postgres/server.env` | `MCP_POSTGRES_TOKEN` |
| `~/.config/mcp-cors-proxy/server.env` | `MCP_KUBERNETES_TOKEN` |
| `~/.config/comfy-image-mcp/server.env` | `COMFY_IMAGE_MCP_TOKEN` |
| `~/.config/warden-mcp/server.env` | `BW_HOST`, `BW_CLIENTID`, `BW_CLIENTSECRET`, `BW_PASSWORD` |
| `~/.config/langfuse/agent-tracing.env` | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` |
| `~/.config/llm-proxy/proxy.env` | Sammeldatei des llm-proxy (u. a. `LLM_PROXY_ADMIN_TOKEN`) |
| `~/.config/mailbox-mcp/.env` | `MAILBOX_EMAIL`, `MAILBOX_PASSWORD` |

```bash
grep -l '^\(export \)\?BGE_MCP_TOKEN=' ~/.config/*/*.env ~/.config/*/.env 2>/dev/null   # wo liegt der Schluessel?
set -a; . ~/.config/bge-mcp/server.env; set +a               # laden, ohne auszugeben
```

Die Tabelle ist eine Momentaufnahme. Massgeblich ist der `grep` oben. `*.env` allein verfehlt
Dateien, die nur `.env` heissen (Shell-Globs lassen fuehrende Punkte aus).

### 2. git-crypt-Dateien (`environments/.secrets/<env>.yaml`)

Deploy- und Plattform-Secrets. Welche Datei zaehlt:

| Datei | Zweck |
|---|---|
| `fleet-mentolder.yaml` | Prod mentolder (aktiv) |
| `fleet-korczewski.yaml` | Prod korczewski (eingefroren, T002479) |
| `dev.yaml` | devmesh |
| `dev-tools.yaml` | Entwickler-Werkzeuge (`GITHUB_PERSONAL_ACCESS_TOKEN`, `OPENCODE_API_KEY`, ...) |
| `staging.yaml` | Staging |
| `mentolder.yaml`, `korczewski.yaml` | **Legacy, nicht als Quelle nutzen.** Teilweise veraltet (T900789). |

Erst pruefen, ob das Repo entsperrt ist. Gesperrt sind die Dateien Binaerdaten:

```bash
grep -q '^[A-Z]' environments/.secrets/dev.yaml && echo entsperrt || echo gesperrt
```

Gesperrt: `docs/runbooks/git-crypt-key-distribution.md` (Abschnitt Onboarding). Nicht selbst
entsperren, wenn kein Key vorhanden ist, sondern Schritt 5.

```bash
grep -n -A4 'name: FILEN_PASSWORD$' environments/schema.yaml   # Bedeutung und Pflicht
grep -l '^FILEN_PASSWORD:' environments/.secrets/*.yaml         # in welchen Dateien
# lesen, ohne auszugeben (YAML-Parser, damit Quoting korrekt aufgeloest wird):
FILEN_PASSWORD=$(python3 -c 'import sys,yaml;print(yaml.safe_load(open(sys.argv[1]))[sys.argv[2]])' \
  environments/.secrets/fleet-mentolder.yaml FILEN_PASSWORD)
```

In einem Worktree gilt dasselbe, sofern er ueber `scripts/worktree-create.sh` angelegt wurde.

### 3. Cluster-Secrets (nur lesend)

Was im Cluster laeuft, ist der Ist-Zustand. Nuetzlich zum Abgleich, wenn Datei und Laufzeit
auseinanderlaufen koennten.

```bash
kubectl --context fleet -n workspace get secret workspace-secrets -o json | jq -r '.data | keys[]'
kubectl --context fleet -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.FILEN_PASSWORD}' | base64 -d | sha256sum | cut -c1-12   # Hash-Abgleich
```

Kontexte: `fleet` (Prod), `devmesh` (Dev). Nie `kubectl edit`/`apply` auf Secrets; die Quelle
ist die SealedSecret aus Schritt 2 (`task env:seal`).

### 4. Vaultwarden (`warden`-MCP)

Persoenliche Logins und Konten bei Drittanbietern, die in keiner Deploy-Datei stehen (Web-UIs,
Anbieter-Konsolen). Werkzeuge `keychain_search_items`, dann `keychain_get_username` /
`keychain_get_password`. Jeder Aufruf fragt beim Nutzer nach (permissions.ask); Schreiben nur
nach Rueckfrage (`docs/agent-guide/registry/capabilities.yaml`, `tresor-zugriff`).

### 5. Nichts gefunden: anhalten und fragen

Keine der Quellen liefert den Schluessel, oder die Quelle ist gesperrt. Dann **stoppen** und
den Nutzer fragen. Die Frage nennt den Schluesselnamen, die geprueften Quellen und wofuer der
Wert gebraucht wird, nicht mehr.

## Nicht als Quelle nutzen

- **`git stash`**: Stashes koennen Secrets enthalten, die nie gemergt wurden. Sie sind kein
  Speicherort. Gefundenes gehoert per PR in die git-crypt-Datei oder wird verworfen.
- **Shell-History, Logs, `.env`-Dateien in Worktrees** anderer Sessions.
- **`mentolder.yaml` und `korczewski.yaml`** unter `environments/.secrets/` (Schritt 2).
