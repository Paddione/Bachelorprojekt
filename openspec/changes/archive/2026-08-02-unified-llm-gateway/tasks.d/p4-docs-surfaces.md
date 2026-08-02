# p4-docs-surfaces — Awareness-Surfaces: EIN Gateway-Weg für alle Harnesse

Rolle: `impl`. Setzt `design.md` §D8 um: jede Doku-/Config-Fläche, die heute einen Backend-Port
zeigt, lernt den **einen** Gateway-Weg auf `http://127.0.0.1:18235` (logische Modell-ID
`ternary-bonsai`, `/healthz`-Semantik, `task llm:proxy:status`). Betrifft fünf Flächen: `AGENTS.md`
(opencode-Subagent-Routing + neuer Kurzabschnitt), `.opencode/agent-models.jsonc` (aktiver
`baseURL`/Modell-ID-Switch), `.claude/skills/references/mcp-tool-guide.md` (neuer LLM-Gateway-
Abschnitt), `.claude/skills/llama-cpp/references/bonsai-server-windows.md` (`:8093` als
Backend-intern markieren) und `docs/agent-guide/registry/tools.yaml` (Gateway-Eintrag + Map-Regen).

**Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein** RED-Failing-Test-Step (lebt
in `p5-tests`). Jeder Task endet mit einem konkreten lokalen Prüf-Step. Reines Doku-/Config-Partial —
D1-disjunkt zu p1/p2/p3 (Produktions-Code) und p5 (Tests): kein `.sh`/`.mjs`/`.sql` wird angefasst.

**Konsistenz mit p5-Config-Lint (`FA-LLMPROXY-8`):** Nach Task 2 darf `.opencode/agent-models.jsonc`
kein aktives Backend-Port-Literal mehr tragen. Der Lint greppt dort nur `"baseURL"`-Zeilen auf
`:8093`/`127.0.0.1:1234`; dieses Partial geht über die Minimalpflicht hinaus und entfernt jede
`8093`-Referenz (auch aus Kommentar/Beschreibung), gemäß der Ausnahme-Konvention aus §D4.3 (Backend-
URLs gehören ausschließlich in die `tickets.llm_proxy_backends`-Registry und explizit markierte
Backend-Doku — Letzteres ist genau `bonsai-server-windows.md`, Task 4).

## S1-Zeilenbudgets (wirksame Schwelle je Datei)

| `path` | Ist | Budget |
| --- | --- | --- |
| `AGENTS.md` | 263 | — (S1-ungated, `.md`) |
| `.opencode/agent-models.jsonc` | 155 | — (S1-ungated, `.jsonc`) |
| `.claude/skills/references/mcp-tool-guide.md` | 138 | — (S1-ungated, `.md`) |
| `.claude/skills/llama-cpp/references/bonsai-server-windows.md` | 61 | — (S1-ungated, `.md`) |
| `docs/agent-guide/registry/tools.yaml` | 320 | — (S1-ungated, `.yaml`) |

Alle fünf Ziel-Dateien liegen außerhalb des S1-Extension-Gates (`docs/code-quality/gates.yaml` →
`s1.limits` deckt nur Code-Extensions ab: `.ts/.js/.jsx/.py/.svelte/.sh/.mjs/.mts/.astro/.tsx/.java/.php/.bash/.cjs`).
`.md`, `.jsonc` und `.yaml` werden vom Ratchet nicht bewertet — daher kein numerisches Budget. Die
per `task agent-guide:emit` regenerierten Artefakte (Maps, `20-werkzeuge.md`, `agent-guide.generated.json`)
sind generierte Dateien und ebenfalls S1-ungated.

---

## Task 1: `AGENTS.md` — bonsai-Subagent auf Gateway + neuer `## LLM-Gateway`-Abschnitt (D8)

Zwei Edits. (a) Die opencode-Subagent-Routing-Tabelle (Z.30) nennt heute den Backend-Port; sie wird
auf den Gateway-Endpoint umgestellt. (b) Vor `## Core Commands` (Z.36) kommt ein neuer H2-Kurzabschnitt,
der den einen Endpoint, die `/healthz`-Semantik und den Status-Task dokumentiert und explizit festhält,
dass Backend-Ports intern sind. `AGENTS.md` ist nicht Teil des `FA-LLMPROXY-8`-Config-Lints (der greppt
nur die vier `.jsonc`/`.sh`/`.mjs`-Consumer), aber §D8 verlangt die Umstellung dennoch.

- [ ] In der Tabellenzeile zu `bonsai-8b` (Z.30) `(max 4 parallel, port 8093)` durch
      `(max 4 parallel, routed via gateway :18235)` ersetzen. Keine andere Tabellenzelle anfassen.
- [ ] Unmittelbar vor `## Core Commands` (Z.36) den folgenden H2-Abschnitt einfügen (samt Leerzeile
      davor und danach), sodass der Abschnitt hinter der gesamten `## Agent Routing`-Sektion steht.

```md
## LLM-Gateway

Alle lokalen LLM-Aufrufe (äußerer Factory-Orchestrator, Phase-Agenten, opencode, agy und jeder
weitere Agent) laufen über **einen** health-überwachten Endpoint: `http://127.0.0.1:18235`. Das
Gateway (`scripts/llm-proxy/`, systemd-user-Unit `llm-proxy.service`) routet health-geprüft auf das
passende Backend; die logische Modell-ID `ternary-bonsai` löst serverseitig auf das erste verfügbare
Backend-Modell auf.

- **Health:** `curl -sf http://127.0.0.1:18235/healthz` — `200` nur, wenn ≥1 Backend gesund ist
  (Body: `healthy_backends`, `total_backends`, `registry_poll_age_s`, `degraded`); sonst `503`.
  `GET /health` bleibt reine Liveness.
- **Status/Backends:** `task llm:proxy:status` (Health + entdeckte Backends und Modelle).
- **Backend-Ports sind intern.** Die konkreten Backend-Ports (llama-server, LM Studio, Remote-APIs)
  werden **nie** direkt konsumiert — immer über das Gateway (Health-Check + Request-Fixups). SSOT:
  `openspec/specs/local-llm-proxy.md`.
```

**Verify:**

```bash
grep -c '8093' AGENTS.md
# erwartet: 0 (kein Backend-Port mehr in AGENTS.md)
grep -q '^## LLM-Gateway' AGENTS.md && echo "section present"
# erwartet: "section present"
grep -q 'routed via gateway :18235' AGENTS.md && grep -q 'task llm:proxy:status' AGENTS.md && echo "routing + status ok"
# erwartet: "routing + status ok"
```

---

## Task 2: `.opencode/agent-models.jsonc` — Gateway-`baseURL` + logische Modell-ID (D5/D8)

Der `llama-bonsai-server`-Provider zeigt heute direkt auf `:8093`; der `bonsai-8b`-Agent referenziert
die dateibenannte Modell-ID. Beides wird auf den Gateway-Weg umgestellt: `baseURL` → `:18235/v1`,
Modell-ID → `ternary-bonsai` (der serverseitige Wildcard-Alias `{"ternary-bonsai":"*"}` am
`llamacpp-bonsai`-Backend löst auf; gesetzt von der p2-Migration). Alle drei `8093`-Vorkommen (aktive
`baseURL` Z.34, Kommentar Z.37, Agent-`description` Z.132) verschwinden — das erfüllt zugleich den
p5-Config-Lint `FA-LLMPROXY-8` (der auf der aktiven `baseURL`-Zeile fail-closed ist). Nur die genannten
Felder ändern; die übrigen Provider (`llamacpp-mtp`, `ollama`, `opencode-go`, `lmstudio`) und der
`deepseek-helper`-Agent bleiben unangetastet.

- [ ] Provider `llama-bonsai-server` → `options.baseURL`: `"http://127.0.0.1:8093/v1"` →
      `"http://127.0.0.1:18235/v1"`.
- [ ] Im `models`-Block desselben Providers den Schlüssel `"Ternary-Bonsai-8B-TQ2_0.gguf"` in
      `"ternary-bonsai"` umbenennen (der Anzeigename `name:` darunter bleibt als Menschen-Label
      unverändert). Den vorangehenden Kommentar (heute `// Ternary-Bonsai-8B on port 8093: …`) durch
      den Gateway-Kommentar unten ersetzen.
- [ ] Agent `bonsai-8b` → `model`: `"llama-bonsai-server/Ternary-Bonsai-8B-TQ2_0.gguf"` →
      `"llama-bonsai-server/ternary-bonsai"`.
- [ ] Agent `bonsai-8b` → `description`: `via llama-server on port 8093, combined KV cache` durch
      `combined KV — routed via the LLM gateway on :18235` ersetzen (restlicher Beschreibungstext bleibt).

Ersatz-Kommentar über dem Modell-Eintrag (ersetzt die beiden alten `//`-Zeilen):

```jsonc
        // Reached via the unified LLM gateway on :18235 (unified-llm-gateway, T002102):
        // the gateway health-checks and routes to the Bonsai llama-server backend.
        // The logical id "ternary-bonsai" resolves server-side through the backend's
        // wildcard model-alias — no backend port is addressed directly from here.
```

**Verify:**

```bash
# jsonc: nur zeilenführende //-Kommentare strippen (URLs mit :// bleiben unberührt), dann jq parsen:
grep -vE '^[[:space:]]*//' .opencode/agent-models.jsonc \
  | jq -e '.provider["llama-bonsai-server"].options.baseURL == "http://127.0.0.1:18235/v1"
           and .agent["bonsai-8b"].model == "llama-bonsai-server/ternary-bonsai"
           and (.provider["llama-bonsai-server"].models | has("ternary-bonsai"))'
# erwartet: Ausgabe "true", exit 0 (jsonc parst + alle drei Zusicherungen halten)
grep -c '8093' .opencode/agent-models.jsonc
# erwartet: 0 (kein :8093-Literal und keine "port 8093"-Referenz mehr — erfüllt FA-LLMPROXY-8)
```

---

## Task 3: `.claude/skills/references/mcp-tool-guide.md` — neuer `## LLM-Gateway (Port 18235)`-Abschnitt (D8)

Am Dateiende (nach dem `## codebase-memory-mcp`-Abschnitt, Z.138) einen neuen Abschnitt anfügen. Der
LLM-Gateway ist **kein** MCP-Server, sondern der eine HTTP-Endpoint für lokale LLM-Calls — der
Abschnitt macht das explizit, damit Skills/Subagenten den Weg kennen, und hält fest, dass Backend-
Ports nie direkt angesprochen werden. Der mechanische Guard `tests/spec/mcp-tooling.bats` parst nur
`ticket-mcp`-Tool-Tabellen (`mcp__…`-Namen bzw. `- \`./scripts/mcp…\``-Zeilen) und bleibt von diesem
Prosa-Abschnitt unberührt.

- [ ] Abschnitt anfügen (Markdown-Prosa unten, gefolgt vom Health-/Status-Codeblock):

```md
## LLM-Gateway (Port 18235) — lokale LLM-Calls (kein MCP-Server)

> Kein MCP-Server, sondern der EINE OpenAI-kompatible HTTP-Endpoint für **alle** lokalen LLM-Aufrufe.
> Hier gelistet, damit Skills/Subagenten den Weg kennen — der `mcp-tooling.bats`-Guard prüft nur
> `ticket-mcp`-Tabellen und bleibt davon unberührt.

- **Endpoint:** `http://127.0.0.1:18235` (`/v1/chat/completions`, `/v1/models`).
- **Wann bevorzugen:** **immer** für lokale LLM-Calls (Factory, Agenten, opencode, agy). Nie einen
  Backend-Port (llama-server, LM Studio, Remote-API) direkt ansprechen — das umgeht Health-Check und
  Request-Fixups.
- **Logische Modell-ID:** `ternary-bonsai` (Wildcard-Alias → erstes verfügbares Backend-Modell).
- **Health/Status:** siehe Codeblock.
- **SSOT:** `openspec/specs/local-llm-proxy.md` (Backend-Registry `tickets.llm_proxy_backends`,
  Routing- und Health-Semantik).
```

Der Health-/Status-Codeblock (schließt den Abschnitt ab):

```bash
curl -sf --max-time 3 http://127.0.0.1:18235/healthz   # 200 nur wenn >=1 Backend gesund, sonst 503
task llm:proxy:status                                   # Health + entdeckte Backends/Modelle
```

**Verify:**

```bash
grep -q '^## LLM-Gateway (Port 18235)' .claude/skills/references/mcp-tool-guide.md && echo "section present"
# erwartet: "section present"
grep -q 'openspec/specs/local-llm-proxy.md' .claude/skills/references/mcp-tool-guide.md \
  && grep -q '18235/healthz' .claude/skills/references/mcp-tool-guide.md && echo "ssot + healthz ok"
# erwartet: "ssot + healthz ok"
# Guard-Sicherheit: die ticket-mcp-Tooltabelle ist unverändert vorhanden:
grep -q 'transition_status' .claude/skills/references/mcp-tool-guide.md && echo "ticket-mcp table intact"
# erwartet: "ticket-mcp table intact"
```

---

## Task 4: `.claude/skills/llama-cpp/references/bonsai-server-windows.md` — `:8093` als Backend-intern markieren (D8)

Diese Datei ist die **explizit markierte Backend-Doku** aus der §D4.3-Ausnahme — hier dürfen (und
sollen) die `:8093`-Kommandos stehen, aber klar als Backend-intern (Windows-Server-Debugging)
gekennzeichnet. Konsumenten (Factory, Agenten, opencode) erreichen das Modell über das Gateway
`:18235`, nie direkt. Zwei Abschnitte werden umgeschrieben: `## Port & Base-URL` und
`## Health-/Props-Checks`. Die `:8093`-Befehle bleiben inhaltlich erhalten (Debug-Wert), bekommen aber
den Backend-intern-Rahmen und einen Querverweis auf Gateway-Status und Cutover.

- [ ] `## Port & Base-URL` (Z.24) durch die Backend-intern-Fassung unten ersetzen (Port-/Base-URL-Fakten
      bleiben, `networkingMode`-Zeile bleibt; ergänzt um Registry-Hinweis und Konsumenten-Pfad).
- [ ] `## Health-/Props-Checks` (Z.30) durch die Backend-intern-Fassung unten ersetzen: Überschrift +
      einleitender Absatz markieren die `:8093`-Checks als reines Windows-Server-Debugging und verweisen
      auf den konsumenten-seitigen Health-Weg (`curl :18235/healthz` / `task llm:proxy:status`) und den
      Cutover (`scripts/llm-proxy/cutover.sh`). Der bestehende `curl :8093`-Codeblock bleibt darunter.

Neue Fassung `## Port & Base-URL`:

```md
## Port & Base-URL (Backend-intern)

- Port `8093`, OpenAI-kompatibel — **Backend-intern**: nur der `llm-proxy`-Gateway (`:18235`) und
  direktes Windows-Server-Debugging sprechen diesen Port an.
- Backend-Base-URL: `http://127.0.0.1:8093/v1` — in `tickets.llm_proxy_backends` als Backend
  `llamacpp-bonsai` registriert (die einzige legitime Stelle für diese URL).
- **Konsumenten-Pfad:** Factory, Agenten und opencode rufen das Modell **nie** direkt auf `:8093` auf,
  sondern über das Gateway `http://127.0.0.1:18235` (logische ID `ternary-bonsai`). Siehe
  `.claude/skills/references/mcp-tool-guide.md` → „LLM-Gateway (Port 18235)".
- `networkingMode=mirrored` (WSL teilt den Windows-Netzstack) → der Windows-Listener ist direkt auf
  WSL-`localhost` erreichbar.
```

Neue Fassung `## Health-/Props-Checks` (einleitender Absatz; der `curl :8093`-Codeblock darunter bleibt):

```md
## Health-/Props-Checks (Backend-intern — Windows-Server-Debugging)

Diese `:8093`-Checks prüfen den Windows-`llama-server` **direkt** und dienen nur dem Debugging des
Backends. Der konsumenten-seitige Health-Weg ist das Gateway (`curl -sf http://127.0.0.1:18235/healthz`
bzw. `task llm:proxy:status`); der Cutover vom Alt-Proxy läuft über `scripts/llm-proxy/cutover.sh`.
```

**Verify:**

```bash
grep -q 'Backend-intern' .claude/skills/llama-cpp/references/bonsai-server-windows.md && echo "backend-internal marked"
# erwartet: "backend-internal marked"
grep -q '127.0.0.1:18235' .claude/skills/llama-cpp/references/bonsai-server-windows.md \
  && grep -q 'task llm:proxy:status' .claude/skills/llama-cpp/references/bonsai-server-windows.md \
  && echo "consumer path + status ref present"
# erwartet: "consumer path + status ref present"
grep -q 'llm-proxy/cutover.sh' .claude/skills/llama-cpp/references/bonsai-server-windows.md && echo "cutover xref present"
# erwartet: "cutover xref present"
```

---

## Task 5: `docs/agent-guide/registry/tools.yaml` — Gateway-Eintrag + Agent-Guide-Regen (D8)

Neuer Tool-Eintrag im exakten Schema der Datei. Die Pflichtfelder ergeben sich aus
`scripts/agent-guide/validate.mjs` (`id`, `name_de`, `kind`, `summary_de`, `what_for_de`,
`how_to_start_de`, `what_could_go_wrong_de`, `danger`); `kind ∈ {skill,agent,task}`, `danger` muss
ein Taxonomie-Tier sein (`safe`/`caution`/`assisted`/`forbidden`), `harness ∈ {claude,opencode,both}`,
`theme` muss in `themes.yaml` stehen (`betrieb` ist gültig), `stages` in `flow.yaml` (`live` ist
gültig), `related` müssen existierende Tool-Ids sein (`agent-ops`, `factory` existieren). Kein
`goals.yaml`-Eintrag nötig — ein Tool ohne referenzierendes Goal ist valide, und `emit-maps` listet
alle Tools unabhängig.

- [ ] Am Dateiende (nach dem letzten Eintrag `opencode-flow-chore`) den Eintrag unten anhängen.

```yaml
- id: llm-gateway
  name_de: "LLM-Gateway (Port 18235)"
  kind: task
  harness: both
  summary_de: "Ein health-überwachter Endpoint für alle lokalen LLM-Modelle — Backend-Ports bleiben intern."
  what_for_de: "Der einzige Weg für lokale LLM-Aufrufe (Factory, Agenten, opencode, agy): Anfragen gehen immer an das Gateway auf :18235, das health-geprüft auf das passende Backend routet. Backend-Ports werden nie direkt angesprochen."
  how_to_start_de: "Status prüfen mit 'task llm:proxy:status' oder 'curl -sf http://127.0.0.1:18235/healthz'. Die logische Modell-ID 'ternary-bonsai' löst serverseitig auf das erste verfügbare Backend-Modell auf."
  what_could_go_wrong_de: "Ist kein Backend gesund, liefert /healthz 503 — Aufrufer überspringen dann sauber, statt einen Gang-Slot zu verbrennen. Ein Backend-Port direkt anzusprechen umgeht Health-Check und Fixups (nicht tun)."
  danger: safe
  theme: betrieb
  stages: [live]
  aliases_de: [gateway, "llm-gateway", "llm-proxy", "18235", healthz, "ternary-bonsai"]
  guardrails: []
  related: [agent-ops, factory]
  links: []
  init_prompt_de: "Prüf das LLM-Gateway: task llm:proxy:status (Health + entdeckte Backends/Modelle auf :18235)."
```

- [ ] Alle Agent-Guide-Flächen regenerieren und mitcommitten. Ein neuer `tools.yaml`-Eintrag ändert
      nicht nur die Maps, sondern auch `docs/agent-guide/20-werkzeuge.md` (via `emit-docs`) und
      `website/src/lib/agent-guide.generated.json` (via `emit-webapp`) — alle drei werden von
      `task freshness:check` geprüft. Deshalb die Umbrella `task agent-guide:emit` (regeneriert Docs +
      Webapp-JSON + Maps + Platform-Descriptions) statt nur `agent-guide:maps`, und die regenerierten
      Artefakte breit stagen.

```bash
# 1. Registry bleibt schema-valide (fail-closed) — MUSS grün sein, sonst bricht emit ab:
node scripts/agent-guide/validate.mjs
# erwartet: "✓ agent-guide registry valid"

# 2. Alle Agent-Guide-Flächen (Docs + Webapp-JSON + Maps) neu generieren und mitcommitten:
task agent-guide:emit
git add docs/agent-guide/ website/src/lib/agent-guide.generated.json
```

**Verify:**

```bash
node scripts/agent-guide/validate.mjs
# erwartet: "✓ agent-guide registry valid" (Eintrag schema-konform)
grep -q '\bllm-gateway\b' docs/agent-guide/maps/tools-map.md && echo "gateway row in tools-map"
# erwartet: "gateway row in tools-map" (Map wurde regeneriert)
grep -q 'llm-gateway' website/src/lib/agent-guide.generated.json && echo "gateway in webapp json"
# erwartet: "gateway in webapp json" (Webapp-JSON wurde regeneriert)
git diff --quiet docs/agent-guide/ website/src/lib/agent-guide.generated.json \
  && echo "agent-guide surfaces clean (staged/committed)" || echo "REGEN NEEDED: run task agent-guide:emit + git add"
# erwartet: keine ungestageten Rest-Diffs in den generierten Flächen (freshness:check-Vorwegnahme)
```
