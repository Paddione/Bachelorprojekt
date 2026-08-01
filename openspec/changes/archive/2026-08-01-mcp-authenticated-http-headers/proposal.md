# Proposal: mcp-authenticated-http-headers

## Why

### Symptom (gemessen, reproduzierbar)

Der MCP-Server `bge-mcp` erscheint in Claude Code als inaktiv. Der Dienst selbst läuft
(systemd-user-Unit, `scripts/bge-mcp/server.mjs`, lauschend auf `127.0.0.1:13005`).

```
POST http://localhost:13005/mcp  (initialize, ohne Header)
  → HTTP 401 · {"error":"unauthorized"} · www-authenticate: Bearer

POST http://localhost:13005/mcp  (initialize, mit Authorization: Bearer $BGE_MCP_TOKEN)
  → HTTP 200
```

### Ursache (belegt, keine Hypothese)

Zwei Fakten ergeben zusammen den Defekt:

1. Der Shim erzwingt Bearer-Auth — `authorized()` in `scripts/bge-mcp/server.mjs:183-186`,
   Abweisung in Zeile 204-207, und Zeile 238 verweigert sogar den Start ohne gesetzten Token.
   Das ist beabsichtigt: über HTTP entfällt die implizite Authentifizierung, die stdio dadurch
   besitzt, dass nur der startende Prozess sprechen kann.
2. Die HTTP-Zweige der Generatoren emittieren ein **2-Feld-Literal ohne jede Erweiterbarkeit**:
   - `render_claude_json` (`scripts/mcp-sync.sh:25-27`) → `{ type, url }`
   - `render_agy_json` (`:49-50`) → `{ serverUrl }`
   - `render_opencode_jsonc` (`:132-134`) → `type`, `url`, `enabled`

   In allen drei Fällen wird der `harness.*`-Block (`h`) bei `transport: http` **vollständig
   ignoriert** — er wird nur im `else`-Zweig für stdio ausgewertet.

Der Handshake geht daher unauthentifiziert hinaus und wird mit 401 abgewiesen. Der Server war in
Claude Code, opencode und agy **nie** erreichbar; das ist ein struktureller, kein transienter
Defekt. Die Registry `docs/agent-guide/registry/mcp.yaml` dokumentiert die Lücke im `auth_note`
bereits als bekannte Einschränkung („Der Generator kennt kein headers-Feld") — sie ließe sich
heute nicht einmal durch einen Registry-Eintrag beheben, weil sie im Renderer sitzt.

### Warum Handeditieren nicht reicht

`.mcp.json` ist git-getrackt: ein Klartext-Token darin wäre ein Secret-Leak. Zudem würde ein
handeingetragener Header beim nächsten `task mcp:sync` überschrieben und von `task mcp:check`
als Drift gemeldet — die Registry ist SSOT (T002300).

## What

1. **Registry-Schema** erhält ein optionales, generisches `headers`-Feld für `transport: http`.
   Werte dürfen `${VAR}`-Env-Referenzen enthalten; für `bge-mcp` wird
   `Authorization: "Bearer ${BGE_MCP_TOKEN}"` hinterlegt. Kein Secret in getrackten Dateien.
2. **Alle drei HTTP-Renderer** (`claude_code`, `agy`, `opencode`) reichen `headers` unverändert
   durch — generisch für jeden HTTP-Client, nicht als `bge-mcp`-Sonderfall. Der
   `llamacpp`-Renderer bleibt unberührt: er bricht bei `transport: http` ohnehin hart ab
   (`:77-80`).
3. **Testbarkeit**: `mcp-sync.sh` erhält die Overrides `MCP_REGISTRY` und `MCP_OUT_DIR`, damit
   `render` gegen eine Fixture-Registry in ein temporäres Verzeichnis schreiben kann statt in die
   realen Ziele. Ohne diese Overrides ist der Generizitäts-Nachweis nicht ohne Nebenwirkung
   führbar — der RED-Lauf des Tests hat genau das gezeigt (er überschrieb dabei
   `~/.gemini/config/mcp_config.json` außerhalb jeder git-Rückholbarkeit).
4. **Token-Zustellung** wird dokumentiert: `BGE_MCP_TOKEN` stammt aus
   `~/.config/bge-mcp/server.env` (dieselbe Datei, die die systemd-Unit per `EnvironmentFile=`
   liest) und muss in der Umgebung exportiert sein, aus der der Harness startet.
5. **`auth_note`** in der Registry wird vom Zustand „bekannte Einschränkung" auf den gelösten
   Zustand fortgeschrieben.

### Explizit nicht Teil dieser Änderung

- Keine Änderung an `scripts/bge-mcp/server.mjs`. Die Bearer-Pflicht ist die korrekte
  Absicherung eines HTTP-Transports und bleibt bestehen.
- Keine Token-Rotation und keine Aufnahme des Tokens in die SealedSecret-Kette — der Shim ist
  ein reiner Localhost-Entwicklungsdienst.
- Keine Änderung am `llamacpp`-Renderer.

_Ticket: T002487_
