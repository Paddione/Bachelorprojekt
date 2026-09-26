---
title: "warden-mcp — Implementation Plan"
ticket_id: T900404
domains: [mcp, agent-tooling, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# warden-mcp — Implementation Plan

_Ticket: T900404 · Design: `openspec/changes/warden-mcp/design.md` · Spec-Delta: `openspec/changes/warden-mcp/specs/warden-mcp.md`_

**Goal:** Claude Code bekommt über den stdio-MCP-Server `warden` (`@icoretech/warden-mcp@0.2.44`)
Zugriff auf die Vaultwarden-Instanz des Nutzers; Credentials nur aus
`~/.config/warden-mcp/server.env`, jede mutierende Operation über `permissions.ask`.

## File Structure

| Datei | Art | Zweck |
|---|---|---|
| `scripts/warden-mcp/launch.mjs` | neu | Launcher: `server.env` lesen, fail-closed prüfen, `npx @icoretech/warden-mcp@0.2.44 --stdio` spawnen |
| `docs/agent-guide/registry/mcp.yaml` | ändern | Registry-Eintrag `warden` (stdio, nur `harness.claude_code`) |
| `.mcp.json` | generiert | via `task mcp:sync` — nie von Hand editieren |
| `.claude/settings.json` | ändern | `permissions.ask` mit 25 mutierenden `mcp__warden__keychain_*`-Tools |
| `tests/spec/warden-mcp/launcher.bats` | neu | REQ-WARDEN-MCP-001 |
| `tests/spec/warden-mcp/config-guards.bats` | neu | REQ-WARDEN-MCP-002, REQ-WARDEN-MCP-003 |
| `components/website/src/data/test-inventory.json` | generiert | `task test:inventory` |

S1-Budgets (keine der bestehenden Dateien ist in `docs/code-quality/baseline.json` gebaselined):
`docs/agent-guide/registry/mcp.yaml` (485 Zeilen, +~25), `.claude/settings.json` (181 Zeilen, +~30),
`.mcp.json` (58 Zeilen, +~6). Neue Dateien bleiben deutlich unter 150 Zeilen.

**Mutierende Tools von 0.2.44** (Quelle: `dist/tools/registerTools.js`, alle `registerTool`-Aufrufe
mit `mutatingToolAnnotations`/`destructiveToolAnnotations`; Präfix `mcp__warden__keychain_`):
`create_folder`, `edit_folder`, `delete_folder`, `create_org_collection`, `edit_org_collection`,
`delete_org_collection`, `move_item_to_organization`, `delete_item`, `delete_items`, `restore_item`,
`create_attachment`, `delete_attachment`, `send_create`, `send_create_encoded`, `send_edit`,
`send_remove_password`, `send_delete`, `create_login`, `create_logins`, `set_login_uris`,
`create_note`, `create_ssh_key`, `create_card`, `create_identity`, `update_item`.

Reproduzierbar (Mess-Konvention T002717):

```bash
npm pack @icoretech/warden-mcp@0.2.44 && tar -xzf icoretech-warden-mcp-0.2.44.tgz
grep -Pzo 'registerTool\(`\$\{deps\.toolPrefix\}\.\K[a-z_]+(?=`,\s*\{[\s\S]{0,600}?annotations: (mutating|destructive)ToolAnnotations)' \
  package/dist/tools/registerTools.js | tr '\0' '\n' | sort | wc -l   # erwartet: 25
```

---

### Task 1: Smoke-Test SSO_ONLY + Node-Version (Gate — vor jeder Code-Änderung)

**Warum zuerst:** Vaultwarden läuft mit `SSO_ONLY=true`; lehnt es den API-Key-Login ab, ist der
ganze Ansatz hinfällig (Design §Risks).

- [x] Credentials liegen im Userspace des Windows-Desktops
      (`%USERPROFILE%\.config\warden-mcp\server.env`, in WSL als `~/.config/warden-mcp/server.env`
      verlinkt); der Agent trägt das Master-Passwort nicht selbst ein.
- [x] Live-Start **unter WSL** (Node 22.23.3, npx 12.1.0) mit Werten aus der Datei, nur
      `keychain_status` abgefragt — der direkte Start auf dem Windows-Desktop-Host ist damit nicht
      abgedeckt und bleibt ein optionaler Nachtest.
- [x] Erwartung erfüllt: Tresor **entsperrt** (`operational: {ready: true, sessionValid: true}`),
      kein HTTP 400/401 und kein `SSO`-Fehler, Node-Engine meldet nur eine Warnung. Damit ist das
      `SSO_ONLY`-Risiko aus Design §Risks ausgeräumt.

### Task 2: Failing Tests schreiben (RED)

- [x] `tests/spec/warden-mcp/launcher.bats` anlegen. Header-Kommentar mit
      `# SSOT-Spec: openspec/specs/warden-mcp.md`. `setup()` mit Verfügbarkeits-Guard
      `command -v node >/dev/null 2>&1 || skip "node binary not installed"` und einem temporären
      `HOME="$BATS_TEST_TMPDIR/home"`. Tests (alle prüfen Exit-Code + stderr-Inhalt):
  1. ohne `server.env` → `status -ne 0`, `$output` enthält `.config/warden-mcp/server.env`.
  2. `server.env` mit leerem `BW_PASSWORD=` → `status -ne 0`, `$output` enthält `BW_PASSWORD`.
  3. vollständige Dummy-`server.env` + `WARDEN_MCP_DRY_RUN=1` → `status -eq 0`, `$output`
     enthält `@icoretech/warden-mcp@0.2.44` und `--stdio`, und enthält den Dummy-Secret-Wert
     **nicht** (`[[ "$output" != *dummy-secret-value* ]]`).
- [x] `tests/spec/warden-mcp/config-guards.bats` anlegen (reine Datei-Checks mit `jq`/`yq`,
      `command -v jq … || skip`):
  1. `.mcp.json`: `.mcpServers.warden.command == "node"` und `.args == ["scripts/warden-mcp/launch.mjs"]`;
     `jq -r '.mcpServers.warden | tostring'` enthält weder `BW_` noch `${`.
  2. `docs/agent-guide/registry/mcp.yaml`: `clients.warden.transport == "stdio"`, einziger
     Harness-Key ist `claude_code`; im Launcher steht `@icoretech/warden-mcp@0.2.44` (kein `@latest`).
  3. `.opencode/opencode.jsonc` und `scripts/llm/mcp-servers.json` enthalten kein `warden`.
  4. `.claude/settings.json`: alle 25 Namen aus der Liste oben stehen als
     `mcp__warden__keychain_<name>` in `.permissions.ask`; keiner davon in `.permissions.allow`;
     Positiv-Anker: Anzahl gefundener Einträge == 25 (nicht nur „keiner fehlt").
- [x] Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/warden-mcp/
# expected: FAIL (red — launcher, registry entry and ask rules do not exist yet)
```

_Anmerkung:_ Die oben formulierten Rot-Tests wurden nach der Umsetzung um Task 8 erweitert — der
Harness-Test prüft jetzt beide Configs (warden MUSS in `.opencode/opencode.jsonc` stehen,
`scripts/llm/mcp-servers.json` bleibt tresorfrei), und die ask-Prüfung läuft für Claude Code *und*
opencode. `launcher.bats` hat zusätzlich den REQ-WARDEN-MCP-004-Test (bw-Version zu neu → Warnung,
kein Abbruch).

### Task 3: Launcher `scripts/warden-mcp/launch.mjs`

- [x] ESM, nur Node-Builtins (`fs`, `os`, `path`, `child_process`). Konstanten
      `PACKAGE = '@icoretech/warden-mcp@0.2.44'`, `REQUIRED = ['BW_HOST','BW_CLIENTID','BW_CLIENTSECRET','BW_PASSWORD']`.
- [x] `server.env` = `path.join(os.homedir(), '.config', 'warden-mcp', 'server.env')`. Parser wie in
      `scripts/mcp-sync.sh` (`render_agy_json`): `KEY=VALUE`, `#`-Kommentare, umschließende
      Quotes entfernen, Key-Regex `^[A-Za-z_][A-Za-z0-9_]*$`.
- [x] Fehlt die Datei → `process.stderr.write('warden-mcp: <pfad> fehlt …')`, `process.exit(1)`.
      Leere/fehlende Keys → alle fehlenden Namen in einer Zeile nennen, `exit(1)`. Werte nie loggen.
- [x] Auf Nicht-Windows: `fs.statSync(file).mode & 0o077` ≠ 0 → Warnung auf stderr (kein Abbruch).
- [x] `WARDEN_MCP_DRY_RUN=1` → Kommando (`npx -y <PACKAGE> --stdio`) auf stderr ausgeben, `exit(0)`.
- [x] Sonst `spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', PACKAGE, '--stdio'], { stdio: 'inherit', env: { ...process.env, ...fileVars }, shell: process.platform === 'win32' })`;
      Exit-Code und Signale durchreichen (`child.on('exit', (c, s) => s ? process.kill(process.pid, s) : process.exit(c ?? 1))`).
- [x] `tests/unit/lib/bats-core/bin/bats tests/spec/warden-mcp/launcher.bats` → grün.

### Task 4: Registry-Eintrag + `task mcp:sync`

- [x] In `docs/agent-guide/registry/mcp.yaml` unter `clients:` (alphabetisch einsortiert) ergänzen:

```yaml
  warden:
    transport: stdio
    command: node
    args: [scripts/warden-mcp/launch.mjs]
    note: >-
      Vaultwarden/Bitwarden-Tresor des Nutzers via @icoretech/warden-mcp (gepinnt im Launcher).
      Credentials ausschliesslich aus ~/.config/warden-mcp/server.env (nie im Repo).
      Bewusst NUR harness.claude_code — jede weitere Harness waere ein weiterer Pfad zum
      persoenlichen Tresor. Mutierende Tools stehen in .claude/settings.json unter
      permissions.ask; bei Versions-Bump die Liste neu ziehen (T900404).
    harness:
      claude_code:
        command: node
        args: [scripts/warden-mcp/launch.mjs]
```

- [x] `task mcp:sync` und danach `task mcp:check` (fail-closed, Exit 0 erwartet). Diff von
      `.mcp.json` prüfen: nur der neue `warden`-Block.

### Task 5: `permissions.ask` in `.claude/settings.json`

- [x] `permissions.ask` als neues Array anlegen (Schlüssel existiert noch nicht) mit den 25
      Einträgen `mcp__warden__keychain_<name>` aus der Liste oben, alphabetisch sortiert.
      Mit `jq` schreiben, nicht per Hand-Edit, damit das JSON valide bleibt:
      `jq --slurpfile a ask.json '.permissions.ask = $a[0]' .claude/settings.json`.
- [x] Prüfen, dass `permissions.allow` keinen `mcp__warden`-Eintrag und kein pauschales
      `mcp__warden`/`mcp__*` enthält.
- [x] `tests/unit/lib/bats-core/bin/bats tests/spec/warden-mcp/` → alle grün.

### Task 6: Live-Anbindung verifizieren (manuell, mit Nutzer)

- [x] Claude-Code-Session neu starten, Server `warden` im MCP-Status auf „connected".
- [x] `mcp__warden__keychain_status` → entsperrt; `mcp__warden__keychain_search_items` mit einem
      harmlosen Suchbegriff → Treffer mit redacted Secrets.
- [x] Mutierender Aufruf bestätigt: `keychain_create_note` legte die Testnote an;
      `keychain_delete_item` hat sie wieder entfernt (Soft-Delete, `search_items` danach: 0 Items).
- [x] Ergebnis als Ticket-Kommentar an T900404 dokumentiert (ohne Secret-Werte).

### Task 7: Final Verification

- [ ] `task test:inventory` und `components/website/src/data/test-inventory.json` mitcommitten.
- [ ] Mandatory Gates:

```bash
task mcp:check
task test:changed
task freshness:regenerate
task freshness:check
```

Hinweis: `task test:changed` schlägt lokal immer an `scripts/runtime-drift-check.sh` fehl (auch in
sauberem `main` bewiesen) — Suites einzeln fahren und das im PR-Body begründen.

### Task 8: Zweiter Harness `opencode` [T900404]

- [x] Registry `harness.opencode` (`type: local`, `command: [node, scripts/warden-mcp/launch.mjs]`,
      `enabled: true`), `note` auf beide Harnesses umgeschrieben.
- [x] `task mcp:sync` → `.opencode/opencode.jsonc` rendert `warden`; `task mcp:check` Exit 0.
- [x] 25 × `"warden_keychain_<name>": "ask"` in den `permission`-Block (handgeschrieben; der
      `mcp`-Block ist generiert, der `permission`-Block nicht).
- [x] `config-guards.bats`: Harness-Test umgedreht (warden MUSS in opencode.jsonc liegen,
      `scripts/llm/mcp-servers.json` bleibt negativ), ask-Prüfung auf beide Configs erweitert.
- [x] Launcher: `BW_BIN`-Auflösung plattformunabhängig (`~/.local/bin/bw` + Versionsprüfung,
      nur Warnung) — D6.
