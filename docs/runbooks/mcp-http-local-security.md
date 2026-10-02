# Runbook: MCP-HTTP lokal absichern (Origin/Host/Auth) — [T900052]

Dieses Runbook dokumentiert den koordinierten Cutover der nativen lokalen
HTTP-MCP-Server auf eine gemeinsame fail-closed Sicherheitsgrenze: Host-
Validierung (DNS-Rebinding), exakte Browser-Origin-Allowlist, konstante-Zeit-
Bearer-Token pro Server. Quelle der gemeinsamen Logik:
`scripts/lib/mcp-http-security.mjs` (kein npm-Abhaengigkeitspaket).

> **Hinweis T900399:** Der HTTP-MCP-Server auf `:13003` ist mit T900399 abgeschaltet;
> die Schritte 1–3 betrafen nur diesen Server und entfallen.

## Betroffene Server und ihre Tokens

| Server | Port | Token-Env | Browser-Origins |
|---|---|---|---|
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
export MCP_POSTGRES_TOKEN=<hex>
export MCP_KUBERNETES_TOKEN=<hex>
export BGE_MCP_TOKEN=<hex>          # existiert bereits teilweise
export MCP_BROWSER_ORIGINS=https://app.example.com,http://localhost:3000
```

## Schritte 1–3 — entfallen (T900399)

Sie verdrahteten Token und Guard für den abgeschalteten HTTP-Server (`:13003`).

## Schritt 4 — Client-Authorization-Check (vor Aktivierung)

Vor dem Scharfschalten pruefen, dass der Client das Token tatsaechlich sendet
(gegen den noch ungeprueften Server ein Header-Echo proben):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  http://127.0.0.1:<port>/mcp     # erwartet 200
```

## Schritt 5 — Kontrollierter Neustart

1. Proben auf temporaeren Ports (siehe `tasks.md` 5.1): authentifizierte
   initialize/tools-list + erlaubte Browser-Origins. Die folgenden Befehle
   wurden gegen die guarded Server auf temporaeren Ports verifiziert
   (T900052, Cutover-Probe):

   ```bash

   # mcp-postgres-local (temporaerer Port 19911) — 401 ohne Token, 200 mit Token
   MCP_POSTGRES_TOKEN=pg-token-xyz PORT=19911 \
     node scripts/mcp-gateway/mcp-postgres-local.mjs &
   curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:19911/mcp \
     -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'          # -> 401
   curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:19911/mcp \
     -H 'content-type: application/json' \
     -H 'Authorization: Bearer pg-token-xyz' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'          # -> 200
   ```

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
  Client-Env (Token-Variable laut Tabelle) pruefen.
- **403 bei erlaubtem Browser:** Origin nicht exakt gelistet — in
  `MCP_BROWSER_ORIGINS` aufnehmen (exakter Schema://host[:port]-Vergleich).
- **403 auch ohne Origin:** Host-Header ist kein Loopback (DNS-Rebinding) —
  Zugriff nur ueber 127.0.0.1/localhost/[::1].
