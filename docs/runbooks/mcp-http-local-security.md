# Runbook: MCP-HTTP lokal absichern (Origin/Host/Auth) — [T900052]

Dieses Runbook dokumentiert den koordinierten Cutover der nativen lokalen
HTTP-MCP-Server auf eine gemeinsame fail-closed Sicherheitsgrenze: Host-
Validierung (DNS-Rebinding), exakte Browser-Origin-Allowlist, konstante-Zeit-
Bearer-Token pro Server. Quelle der gemeinsamen Logik:
`scripts/lib/mcp-http-security.mjs` (kein npm-Abhaengigkeitspaket).

> **WARNUNG:** Der Live-Server `factory-mcp-node` auf `:13003` laeuft aktuell
> **unauthentifiziert** und wird von opencode remote **ohne Authorization**
> konsumiert. Wird die Server-Integration eingecheckt, ohne dass Token in
> Client-Config + Prozess-Start-Env verdrahtet sind, faellt die laufende
> Factory-Toolchain beim naechsten Neustart aus. **Cutover-Schritte 1–3
> zuerst, vor der Aktivierung der Server-Pruefung (Schritt 4).**

## Betroffene Server und ihre Tokens

| Server | Port | Token-Env | Browser-Origins |
|---|---|---|---|
| factory-mcp-node | 13003 | `FACTORY_MCP_TOKEN` | `MCP_BROWSER_ORIGINS` |
| mcp-postgres-local | 13001 | `MCP_POSTGRES_TOKEN` | `MCP_BROWSER_ORIGINS` |
| bge-mcp | 13005 | `BGE_MCP_TOKEN` | `MCP_BROWSER_ORIGINS` |
| mcp-cors-proxy (Kubernetes-Monolith) | 18082 | `MCP_KUBERNETES_TOKEN` | `MCP_BROWSER_ORIGINS` |

- **CLI-Clients** (opencode, Claude Code, curl) senden keinen `Origin`-Header —
  sie bleiben erlaubt, wenn sie das korrekte `Authorization: Bearer <token>`
  mitbringen.
- **Browser-Clients** (llama Web-UI) erfordern einen exakt gelisteten Origin
  UND das Token. Ohne gelisteten Origin bekommen Browser keinen CORS-Zugriff
  (fail-closed).

## Token erzeugen

Pro Server ein separates Token (kein hoher Blast-Radius ueber alle Endpunkte):

```bash
# je Server einmalig; keine Secrets in tracked Dateien
openssl rand -hex 32   # oder: python -c "import secrets;print(secrets.token_hex(32))"
```

Token in eine **owner-lesbare, untracked** Umgebungsdatei legen, die nur beim
Start geladen wird (nicht in git). Beispiel `~/.config/mcp-local-tokens.env`:

```bash
export FACTORY_MCP_TOKEN=<hex>
export MCP_POSTGRES_TOKEN=<hex>
export MCP_KUBERNETES_TOKEN=<hex>
export BGE_MCP_TOKEN=<hex>          # existiert bereits teilweise
export MCP_BROWSER_ORIGINS=https://app.example.com,http://localhost:3000
```

## Schritt 1 — Server-Prozess-Env vorbereiten

Betroffener Server: `factory-mcp-node` (`docs/agent-guide/registry/mcp.yaml`,
`windows_start`). Startkommando des Live-Prozesses auf pk-desktop:

```bash
FACTORY_REPO=C:/Users/PatrickKorczewski/Bachelorprojekt FACTORY_CTX=fleet \
  node scripts/factory-mcp-node/server.mjs
```

Verdrahtung: die Token-Umgebungsdatei beim Start sourcen, damit
`requireToken('FACTORY_MCP_TOKEN')` beim naechsten Start erfolgreich ist:

```bash
set -a; source ~/.config/mcp-local-tokens.env; set +a
FACTORY_REPO=C:/Users/PatrickKorczewski/Bachelorprojekt FACTORY_CTX=fleet \
  node scripts/factory-mcp-node/server.mjs
```

## Schritt 2 — Client-Configs vorbereiten (sendet Token)

**opencode** (`.opencode/opencode.jsonc`, `factory-mcp-node` remote) — den
`Authorization`-Header anhaengen; solche Header unterstuetzt das BGE-Vorbild
bereits (`scripts/llm/ui-config.template.json` nutzt `Bearer ${BGE_MCP_TOKEN}`):

```jsonc
"factory-mcp-node": {
  "type": "remote",
  "url": "http://localhost:13003/mcp",
  "headers": { "Authorization": "Bearer ${FACTORY_MCP_TOKEN}" },
  "enabled": true
}
```

**llama Web-UI** (`scripts/llm/ui-config.template.json`): dem `factory-mcp`
Eintrag dieselben `headers` geben.

> **Hinweis:** solange der Server die Pruefung (Schritt 4) nicht aktiviert hat,
> akzeptiert er jeden Header — das Senden des vorbereiteten Headers ist also
> primaer-sicher und bricht nichts.

## Schritt 3 — Server-Code-Integration aktivieren

In `scripts/factory-mcp-node/server.mjs` die Guard-Integration eintragen
(imports + `guardRequest` vor Body-Lesen + `/health` auf minimale Liveness
reduzieren). Diese Integration ist **bewusst zurueckgestellt** und nur zusammen
mit den Schritten 1–2 + Neustart (Schritt 5) freizugeben.

## Schritt 4 — Client-Authorization-Check (vor Aktivierung)

Vor dem Scharfschalten pruefen, dass der Client das Token tatsaechlich sendet
(gegen den noch ungeprueften Server ein Header-Echo proben):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  http://127.0.0.1:13003/mcp     # erwartet 200
```

## Schritt 5 — Kontrollierter Neustart

1. Proben auf temporaeren Ports (siehe `tasks.md` 5.1): authentifizierte
   initialize/tools-list + erlaubte Browser-Origins.
2. Kanonische Listener wechseln: Live-Prozess auf `:13003` sauber stoppen
   (SIGTERM), mit neuem Code + `source`d Token-Env neu starten.
3. Regression: `task mcp:check`, BATS-Suite `tests/spec/mcp-gateway/`,
   `task test:changed`, `task freshness:check`, `task workspace:validate`.

## Rollback

Laeuft nach dem Cutover etwas schief (Client kann kein Token liefern, Live-Tool
faellt aus):

1. Server neu starten mit zurueckgerolltem `server.mjs` (ohne Guard) + weiterhin
   Token-Env source — der Server akzeptiert dann wieder jedes/nur-kein-Token.
2. Die `Authorization`-Header in Client-Configs duerfen bleiben (harmlos).
3. Optional: alte Token-Env-Datei wiederherstellen; kein Secret in git pushen.

## Registry-Dokumentation

`docs/agent-guide/registry/mcp.yaml` aktualisieren: je Server die
Token-Anforderung und die Browser-Origin-Policy vermerken, sowie
`scripts/mcp-sync.sh`-Rendering (keine Secrets, nur Platzhalter).

## Fails im Betrieb

- **401 bei erlaubtem CLI ohne Origin:** Token fehlt/falsch im Client-Header —
  Client-Env (`FACTORY_MCP_TOKEN`) pruefen.
- **403 bei erlaubtem Browser:** Origin nicht exakt gelistet — in
  `MCP_BROWSER_ORIGINS` aufnehmen (exakter Schema://host[:port]-Vergleich).
- **403 auch ohne Origin:** Host-Header ist kein Loopback (DNS-Rebinding) —
  Zugriff nur ueber 127.0.0.1/localhost/[::1].
