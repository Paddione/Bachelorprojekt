---
title: "p2 — Config-Vorlage: openclaw.json5 und .env.example"
ticket_id: T900538
domains: [agent-tooling, llm-local-dev]
status: active
---

# p2 — Config-Vorlage

Files: `openclaw/openclaw.json5` (neu), `openclaw/.env.example` (komplett ersetzt),
`openclaw/exec-approvals.json5` (neu).
Disjunkt zu p1, p3–p5. Vertrag: `openspec/changes/openclaw-ops-bot/design.md`, Abschnitte
„Gemeinsamer Vertrag", „Umgebungsvariablen" und Komponente 2.

Dateiformat: `openclaw/openclaw.json5` und `openclaw/exec-approvals.json5` werden als striktes JSON geschrieben (alle Schlüssel in
doppelten Anführungszeichen, keine trailing commas), Kommentare stehen nur als `//` auf eigenen
Zeilen. Begründung: OpenClaw liest die Datei als JSON5, und ohne installiertes `json5`-Paket
genügt dann ein Einzeiler, der Kommentarzeilen verwirft und `JSON.parse` aufruft. Ein
Kommentar darf deshalb nie hinter einem Wert in derselben Zeile stehen, weil URLs wie
`https://...` ebenfalls `//` enthalten.

Alle Befehle laufen im Worktree-Root. Keine anderen Dateien ändern.

## Task 2.1: `openclaw/.env.example` ersetzen

Ersetze den gesamten Inhalt von `openclaw/.env.example` durch exakt diesen Text (die alten
`OPENAI_*`-Zeilen und der Claude-Agent-SDK-Block entfallen):

```dotenv
# OpenClaw ops bot: environment for the gateway (T900538).
# `task openclaw:configure` copies this file to ~/.openclaw/.env (chmod 600)
# if that file does not exist yet. Never commit real values.

# Gateway bearer token (64 hex chars).
# Leave empty: `task openclaw:configure` fills it via `openssl rand -hex 32`.
OPENCLAW_GATEWAY_TOKEN=

# Telegram bot token. Create the bot with @BotFather and paste the token here.
TELEGRAM_BOT_TOKEN=

# Heartbeat target: your own Telegram chat id.
# Fill in after pairing (`openclaw pairing approve telegram <code>`).
TELEGRAM_CHAT_ID=

# Primary model: OpenAI-compatible local backend on the Windows host.
OPENCLAW_LOCAL_BASE_URL=http://127.0.0.1:1919/v1

# Fallback model key for OpenCode Go.
# Leave empty: `task openclaw:configure` reads ."opencode-go".key
# from ~/.local/share/opencode/auth.json.
OPENCODE_GO_API_KEY=

# Stable x-opencode-session value for OpenCode Go (see design R4/R5).
# Leave empty: `task openclaw:configure` generates a UUID.
OPENCLAW_GO_SESSION=

# Gateway log level (debug|info|warn|error).
OPENCLAW_LOG_LEVEL=info
```

Prüfung (muss `OK .env.example (7 Variablen)` ausgeben, Exit 0):

```bash
node - <<'EOF'
const t = require("fs").readFileSync("openclaw/.env.example", "utf8");
const want = {
  OPENCLAW_GATEWAY_TOKEN: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "", OPENCODE_GO_API_KEY: "",
  OPENCLAW_GO_SESSION: "", OPENCLAW_LOCAL_BASE_URL: "http://127.0.0.1:1919/v1",
  OPENCLAW_LOG_LEVEL: "info",
};
const got = {};
for (const l of t.split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) got[m[1]] = m[2];
}
for (const [k, v] of Object.entries(want)) {
  if (got[k] !== v) { console.error("FAIL", k, JSON.stringify(got[k])); process.exit(1); }
}
if (Object.keys(got).length !== 7) { console.error("FAIL Variablen:", Object.keys(got)); process.exit(1); }
console.log("OK .env.example (" + Object.keys(got).length + " Variablen)");
EOF
```

## Task 2.2: `openclaw/openclaw.json5` anlegen

Lege `openclaw/openclaw.json5` mit exakt diesem Inhalt an. Nichts ergänzen, keine Schlüssel
raten. Die R4-Header stehen bewusst nur als Kommentar, die Exec-Allowlist steht in
`openclaw/exec-approvals.json5` (Task 2.4).

```json5
{
  // OpenClaw ops bot (T900538). Vertrag: openspec/changes/openclaw-ops-bot/design.md
  // `task openclaw:configure` kopiert diese Vorlage nach ~/.openclaw/openclaw.json.
  // Format: striktes JSON, Kommentare nur als eigene //-Zeilen (gültiges JSON5).
  // Secrets stehen nur als ${VAR}; die Werte liegen in ~/.openclaw/.env.
  "update": {
    "checkOnStart": false
  },
  "gateway": {
    "bind": "loopback",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    },
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "local": {
        "baseUrl": "${OPENCLAW_LOCAL_BASE_URL}",
        "apiKey": "local-no-key",
        "api": "openai-completions",
        "models": [
          {
            "id": "local-default",
            "contextWindow": 131072,
            "maxTokens": 8192,
            "compat": {
              "supportsTools": true,
              "toolSchemaProfile": "llamacpp",
              "thinkingFormat": "qwen-chat-template"
            }
          }
        ]
      },
      "opencode-go": {
        "baseUrl": "https://opencode.ai/zen/go/v1",
        "apiKey": "${OPENCODE_GO_API_KEY}",
        "api": "openai-responses",
        // R4 (design.md, Nutzeraufgabe nach dem Merge): Hier ergänzt der Nutzer die
        // Provider-Header `x-opencode-session: ${OPENCLAW_GO_SESSION}` und einen eigenen
        // User-Agent. Ohne sie antwortet OpenCode Go mit MissingSessionID und der Fallback
        // greift nicht.
        "models": [
          {
            "id": "muse-spark-1.3-contributor",
            "reasoning": true,
            "contextWindow": 1000000,
            "maxTokens": 131072,
            "compat": {
              "supportedReasoningEfforts": ["low", "medium", "high"]
            }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "local/local-default",
        "fallbacks": ["opencode-go/muse-spark-1.3-contributor"]
      },
      "models": {
        "opencode-go/muse-spark-1.3-contributor": {
          "params": {
            "thinking": "low"
          }
        }
      }
    },
    "entries": {
      "ops": {
        "default": true,
        "workspace": "~/.openclaw/workspace",
        "heartbeat": {
          "every": "30m",
          "target": "telegram",
          "to": "${TELEGRAM_CHAT_ID}"
        },
        "tools": {
          "allow": ["read", "exec", "message"],
          "deny": ["write", "edit", "apply_patch", "browser", "canvas"]
        }
      },
      "task-runner": {
        "workspace": "~/.openclaw/workspace",
        "tools": {
          "allow": ["read", "exec", "message"],
          "deny": ["write", "edit", "apply_patch", "browser", "canvas"]
        }
      }
    }
  },
  "tools": {
    // Exec nur im Allowlist-Modus (D5). Die Allowlist-Einträge liegen laut OpenClaw-Doku
    // (tools/exec-approvals-advanced) im Approvals-Dokument, nicht hier. Vorlage:
    // openclaw/exec-approvals.json5, eingespielt von `task openclaw:configure` per
    // `openclaw approvals set --file openclaw/exec-approvals.json5`.
    "exec": {
      "security": "allowlist"
    }
  },
  "channels": {
    // Bot-Token kommt aus TELEGRAM_BOT_TOKEN (Env-Fallback des Default-Accounts),
    // deshalb steht hier kein botToken.
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "groups": {
        "*": {
          "requireMention": true
        }
      }
    }
  }
}
```

Prüfung (muss `OK openclaw.json5` ausgeben, Exit 0). Der Stripper verwirft nur Zeilen, die mit
`//` beginnen, und parst den Rest als striktes JSON:

```bash
node - <<'EOF'
const fs = require("fs");
const raw = fs.readFileSync("openclaw/openclaw.json5", "utf8");
const c = JSON.parse(raw.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = m => { console.error("FAIL", m); process.exit(1); };
if (c.update.checkOnStart !== false) fail("update.checkOnStart");
if (c.gateway.bind !== "loopback") fail("gateway.bind");
if (c.gateway.port !== 18789) fail("gateway.port");
if (c.gateway.auth.mode !== "token") fail("gateway.auth.mode");
if (c.gateway.auth.token !== "${OPENCLAW_GATEWAY_TOKEN}") fail("gateway.auth.token");
if (c.gateway.http.endpoints.chatCompletions.enabled !== true) fail("chatCompletions");
if (c.models.mode !== "merge") fail("models.mode");
const p = c.models.providers;
if (p.local.baseUrl !== "${OPENCLAW_LOCAL_BASE_URL}") fail("local.baseUrl");
if (p.local.models[0].id !== "local-default") fail("local model id");
if (p["opencode-go"].apiKey !== "${OPENCODE_GO_API_KEY}") fail("opencode-go.apiKey");
if (p["opencode-go"].models[0].id !== "muse-spark-1.3-contributor") fail("go model id");
const d = c.agents.defaults;
if (d.model.primary !== "local/local-default") fail("primary");
if (!eq(d.model.fallbacks, ["opencode-go/muse-spark-1.3-contributor"])) fail("fallbacks");
if (d.models["opencode-go/muse-spark-1.3-contributor"].params.thinking !== "low") fail("thinking");
const e = c.agents.entries;
if (e.ops.default !== true) fail("ops.default");
if (!eq(e.ops.heartbeat, { every: "30m", target: "telegram", to: "${TELEGRAM_CHAT_ID}" })) fail("ops.heartbeat");
if ("heartbeat" in e["task-runner"]) fail("task-runner hat heartbeat");
for (const id of ["ops", "task-runner"]) {
  for (const t of ["write", "edit", "apply_patch"]) {
    if (!e[id].tools.deny.includes(t)) fail(id + " deny " + t);
  }
}
if (c.tools.exec.security !== "allowlist") fail("tools.exec.security");
const tg = c.channels.telegram;
if (tg.enabled !== true || tg.dmPolicy !== "pairing" || tg.groups["*"].requireMention !== true) fail("telegram");
if ("botToken" in tg) fail("telegram.botToken in Datei");
if ("mcp" in c) fail("mcp-Sektion vorhanden");
if (/[0-9a-f]{32,}/i.test(raw)) fail("Literal-Token in Datei");
if (!/R4/.test(raw) || !/x-opencode-session/.test(raw)) fail("R4-Kommentar fehlt");
if (!/openclaw\/exec-approvals\.json5/.test(raw)) fail("Verweis auf exec-approvals.json5 fehlt");
console.log("OK openclaw.json5");
EOF
```

## Task 2.3: Env-Referenzen gegen `.env.example` abgleichen

Jede `${VAR}`-Referenz im geparsten JSON (ohne Kommentare) muss als Variable in
`openclaw/.env.example` stehen. Nichts ändern, nur prüfen. Schlägt die Prüfung fehl, ist Task
2.1 oder 2.2 nicht wortgetreu umgesetzt: die Datei mit dem Vorgabetext abgleichen.

Prüfung (muss `OK env-refs (4 Referenzen)` ausgeben, Exit 0):

```bash
node - <<'EOF'
const fs = require("fs");
const json = fs.readFileSync("openclaw/openclaw.json5", "utf8")
  .split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
const refs = [...new Set([...json.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map(m => m[1]))];
const vars = new Set(fs.readFileSync("openclaw/.env.example", "utf8")
  .split("\n").map(l => (l.match(/^([A-Z0-9_]+)=/) || [])[1]).filter(Boolean));
const missing = refs.filter(r => !vars.has(r));
if (refs.length === 0 || missing.length) { console.error("FAIL refs", refs, "fehlend", missing); process.exit(1); }
console.log("OK env-refs (" + refs.length + " Referenzen)");
EOF
```

## Task 2.4: `openclaw/exec-approvals.json5` anlegen

Lege `openclaw/exec-approvals.json5` mit exakt diesem Inhalt an. Format laut OpenClaw-Doku
(`tools/exec-approvals`, Approvals-Dokument `version: 1`). `defaults.security: "deny"` sperrt
Exec für jeden anderen Agenten. `ask: "off"` mit `askFallback: "deny"` lehnt Befehle außerhalb
der Allowlist ohne Rückfrage ab. `autoAllowSkills: false` verhindert, dass Skill-CLIs implizit
erlaubt werden. Keine `socket`-Sektion: Pfad und Token verwaltet OpenClaw selbst.

```json5
{
  // Exec-Approvals für den OpenClaw-Ops-Bot (T900538, D5: nur Read-only-Befehle).
  // `task openclaw:configure` spielt die Datei per
  // `openclaw approvals set --file openclaw/exec-approvals.json5` ein.
  // Format: striktes JSON, Kommentare nur als eigene //-Zeilen (gültiges JSON5).
  // argPattern ist ein ECMAScript-Regex auf die Argumente; Backslashes sind JSON-escaped.
  "version": 1,
  "defaults": {
    "security": "deny",
    "ask": "off",
    "askFallback": "deny",
    "autoAllowSkills": false
  },
  "agents": {
    "ops": {
      "security": "allowlist",
      "ask": "off",
      "askFallback": "deny",
      "autoAllowSkills": false,
      "allowlist": [
        { "pattern": "kubectl", "argPattern": "^(--context \\S+ )?(get|describe|logs|top)( |$)" },
        { "pattern": "flux", "argPattern": "^get( |$)" },
        { "pattern": "gh", "argPattern": "^(run|pr) (list|view)( |$)" },
        { "pattern": "git", "argPattern": "^(status|log|diff)( |$)" },
        { "pattern": "task", "argPattern": "^--list" },
        { "pattern": "bash", "argPattern": "^scripts/(ticket\\.sh (list|get)|vda\\.sh oracle .* --dry-run)" }
      ]
    },
    "task-runner": {
      "security": "allowlist",
      "ask": "off",
      "askFallback": "deny",
      "autoAllowSkills": false,
      "allowlist": [
        { "pattern": "kubectl", "argPattern": "^(--context \\S+ )?(get|describe|logs|top)( |$)" },
        { "pattern": "flux", "argPattern": "^get( |$)" },
        { "pattern": "gh", "argPattern": "^(run|pr) (list|view)( |$)" },
        { "pattern": "git", "argPattern": "^(status|log|diff)( |$)" },
        { "pattern": "task", "argPattern": "^--list" },
        { "pattern": "bash", "argPattern": "^scripts/(ticket\\.sh (list|get)|vda\\.sh oracle .* --dry-run)" }
      ]
    }
  }
}
```

Prüfung (muss `OK exec-approvals.json5` ausgeben, Exit 0). Sie parst die Datei, vergleicht die
Muster mit dem Design und prüft die Regexe an erlaubten und verbotenen Beispielen:

```bash
node - <<'EOF'
const fs = require("fs");
const raw = fs.readFileSync("openclaw/exec-approvals.json5", "utf8");
const c = JSON.parse(raw.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n"));
const fail = m => { console.error("FAIL", m); process.exit(1); };
const want = {
  kubectl: "^(--context \\S+ )?(get|describe|logs|top)( |$)",
  flux: "^get( |$)",
  gh: "^(run|pr) (list|view)( |$)",
  git: "^(status|log|diff)( |$)",
  task: "^--list",
  bash: "^scripts/(ticket\\.sh (list|get)|vda\\.sh oracle .* --dry-run)",
};
if (c.version !== 1) fail("version");
const d = c.defaults;
if (d.security !== "deny" || d.ask !== "off" || d.askFallback !== "deny" || d.autoAllowSkills !== false) fail("defaults");
if ("socket" in c) fail("socket-Sektion vorhanden");
if (JSON.stringify(Object.keys(c.agents).sort()) !== JSON.stringify(["ops", "task-runner"])) fail("agents");
for (const id of ["ops", "task-runner"]) {
  const a = c.agents[id];
  if (a.security !== "allowlist" || a.ask !== "off" || a.askFallback !== "deny" || a.autoAllowSkills !== false) fail(id + " policy");
  if (a.allowlist.length !== 6) fail(id + " allowlist-Länge");
  for (const e of a.allowlist) {
    if (want[e.pattern] !== e.argPattern) fail(id + " " + e.pattern);
  }
}
const re = p => new RegExp(want[p]);
const ok = [["kubectl", "--context fleet get pods -A"], ["flux", "get kustomizations"],
  ["gh", "run list --branch main"], ["git", "status"], ["git", "log --oneline"], ["task", "--list"],
  ["bash", "scripts/ticket.sh list --status plan_staged"]];
const bad = [["kubectl", "delete pod x"], ["flux", "reconcile ks x"], ["gh", "pr merge 1"],
  ["git", "push origin main"], ["git", "statusx"], ["flux", "getx"], ["task", "workspace:deploy"], ["bash", "scripts/ticket.sh create"]];
for (const [p, a] of ok) if (!re(p).test(a)) fail("erlaubt nicht: " + p + " " + a);
for (const [p, a] of bad) if (re(p).test(a)) fail("erlaubt fälschlich: " + p + " " + a);
console.log("OK exec-approvals.json5");
EOF
```

Akzeptanz: Die vier Prüfbefehle aus 2.1–2.4 enden mit Exit 0. Die p5-Szenarien „Template binds
loopback and uses env references", „Write tools are denied for both agents" und „Primary is
local, fallback is OpenCode Go" lesen genau diese Schlüssel.
