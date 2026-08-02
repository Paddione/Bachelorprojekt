# K7 — Agenten- und MCP-Harness-Ebene

> Komponente des Brain-Architektur-Epics **T002430**. Geschwister: [K1](../diagrams/k1-vector-db.md),
> [K2](k2-bge-paare.md), [K3](k3-code-graph.md).
>
> **Alle Laufzeit-Werte in diesem Dokument wurden am 2026-08-02 auf dem WSL-Host neu gemessen**
> (`ss -ltnp`, `curl`, `systemctl --user`, `task mcp:check`, JSON-RPC `tools/list`).
> Die Vergleichsbasis ist die Erhebung vom **2026-07-28** (Defekte D4–D9 aus T002430,
> Befund B3 aus T002398). Wo sich der Befund geändert hat, steht es an der jeweiligen Kante.
> Nur lesende Prüfungen — kein Dienst wurde gestartet, gestoppt oder neu gestartet.

## Die drei Ebenen

Die Komponente zerfällt in drei Ebenen, die **getrennt** betrachtet werden müssen, weil
Drift genau zwischen ihnen entsteht:

1. **SSOT-Registry** — was deklariert ist (`docs/agent-guide/registry/*.yaml`)
2. **Generierte Configs** — was daraus gerendert wird (`mcp-sync.sh render`, `ui-config-seed.mjs`)
3. **Laufende Prozesse** — was tatsächlich einen Listener hat

`task mcp:check` deckt **nur die Kante 1→2** ab, und dort auch nur vier der fünf Renderer.
Kante 2→3 wird von **keinem** Guard geprüft: eine Config kann sauber gerendert sein und der
Dienst dahinter trotzdem fehlen.

## Diagramm

Kanten-Legende: `══►` trägt heute (gemessen) · `──►` trägt, aber ungeprüft ·
`- ->` deklariert, trägt heute NICHT · `✗` strukturell unmöglich.

```
EBENE 1 — SSOT-REGISTRY (versioniert, im Repo)
┌──────────────────────────────────────────────────────────────────────────────┐
│  docs/agent-guide/registry/mcp.yaml        docs/agent-guide/registry/        │
│  (T002300 — 13 MCP-Clients)                agents.yaml (6 Rollen + Runtimes) │
│    clients.<name>.transport: http|stdio        roles.bachelorprojekt-*       │
│    clients.<name>.harness.<harness>            runtimes.gemma26-1/2/primary  │
│    clients.<name>.bridge.url  (NEU)            runtimes.gemma26-vision …     │
│    clients.<name>.browser_endpoint (NEU)                                     │
└───────┬──────────────────────────────────────────────┬───────────────────────┘
        │  task mcp:sync / mcp:check                   │  task agent-guide:maps
        │  (scripts/mcp-sync.sh)                       │
        │                                              ▼
        │                                    docs/agent-guide/maps/
        │                                    agents-map.md, tools-map.md,
        │                                    goals-map.md, danger-map.md
        ▼
EBENE 2 — GENERIERTE CONFIGS
┌──────────────────────────────────────────────────────────────────────────────┐
│  ══►  .mcp.json                        (Claude Code)      drift-geprüft ✓    │
│  ══►  .opencode/opencode.jsonc         (opencode)         drift-geprüft ✓    │
│  ══►  ~/.gemini/config/mcp_config.json (agy)              drift-geprüft ✓    │
│  ══►  scripts/llm/mcp-servers.json     (llama.cpp, NEU)   drift-geprüft ✓    │
│         └─ nur transport: stdio → 2 Einträge                                 │
│            (codebase-memory-mcp, ticket-mcp)                                 │
│                                                                              │
│  ──►  ~/.config/llama-cpp/ui-config.json  (llama.cpp WebUI)   NICHT geprüft  │
│         Renderer: scripts/llm/ui-config-seed.mjs, aufgerufen vom llm-proxy   │
│         beim Start eines Loadouts mit uiConfigFile (T002549/T002550).        │
│         Liegt AUSSERHALB des Repos → kein mcp:check, kein Freshness-Gate.    │
└──────────────────────────────────────────────────────────────────────────────┘
        │                                    │
        │  gelesen beim Harness-Start        │  gelesen vom Browser (WebUI)
        ▼                                    ▼
EBENE 3 — LAUFENDE PROZESSE (gemessen 2026-08-02)
┌──────────────────────────────────────────────────────────────────────────────┐
│  systemd --user Units                                                        │
│                                                                              │
│  llm-proxy.service ═══► :18235  (Node, scripts/llm-proxy/server.mjs)         │
│     ├─ OpenAI-Aggregations-Proxy /v1/*  ── KEIN MCP-Beteiligter              │
│     │     ══► llamacpp-gemma  http://127.0.0.1:8091/v1   status ok          │
│     │     - -> deepseek       https://api.deepseek.com   degraded            │
│     │     - -> opencode-zen   http://127.0.0.1:5099/v1   kein Listener       │
│     └─ mcp-bridge.mjs  /mcp/<name>  ── stdio→HTTP-Brücke (T002429, NEU)      │
│           ══► ticket-mcp            26 Tools  (gemessen)                     │
│           ══► codebase-memory-mcp   14 Tools  (gemessen)                     │
│           ══► github-mcp            46 Tools  (gemessen)                     │
│           ══► mcp-task-runner        7 Tools  (gemessen)                     │
│           - -> playwright / docfork / sequential-thinking / webresearch      │
│                 → "no enabled MCP server" (in der Registry enabled: false)   │
│                                                                              │
│  mcp-gateway.service ══► kubectl --context fleet port-forward                │
│     svc/claude-code-mcp-monolith  18080:8080 13000:3000 13001:3001 …        │
│           ══► :18080  mcp-kubernetes   (GET /sse → 200)                      │
│           ══► :13001  mcp-postgres     (GET /health → 200, POST /mcp → 405)  │
│                                                                              │
│  mcp-cors-proxy.service ══► :18082 ──UPSTREAM──► :18080                      │
│           (nur für den Browser: setzt CORS-Header, die :18080 nicht liefert) │
│                                                                              │
│  factory-mcp.service ══► :13003   (GET /health → 200)                        │
│  bge-mcp.service     ══► :13005   (POST /mcp → 401, Bearer erforderlich)     │
│                                                                              │
│  llama-gemma26-factory.service ══► :8091                                     │
│     llama-server, gemma-4-26B-A4B-it-qat-UD-Q4_K_XL, --alias gemma26-factory │
│     -np 3 -kvu → 3 Slots (gemma26-1 / gemma26-2 / gemma26-primary)          │
│     ✗ KEIN --mcp-servers-config im Kommandozeilen-Aufruf                     │
│                                                                              │
│  :8098 gptoss-context   ✗ KEIN LISTENER MEHR (2026-07-28: lief als           │
│                            gptoss-mcp mit 40 aggregierten Tools)             │
│  :8093 / :8094 (bonsai Test/Vision)  ✗ kein Listener                         │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        │  Browser lädt ui-config.json → 8 MCP-Server-Einträge
        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  llama.cpp WebUI (Browser, client-seitige MCP-Aufrufe)                       │
│    k8s               → http://localhost:18082/mcp        (CORS-Proxy)        │
│    mcp-postgres      → http://localhost:13001/mcp                            │
│    factory-mcp       → http://localhost:13003/mcp                            │
│    bge-mcp           → http://localhost:13005/mcp   (Bearer-Header)          │
│    mcp-task-runner   → http://127.0.0.1:18235/mcp/mcp-task-runner            │
│    ticket-mcp        → http://127.0.0.1:18235/mcp/ticket-mcp                 │
│    codebase-memory   → http://127.0.0.1:18235/mcp/codebase-memory-mcp        │
│    github-mcp        → http://127.0.0.1:18235/mcp/github-mcp                 │
│  Alle 8 stammen aus der Registry — die vier Ad-hoc-Einträge von 2026-07-28   │
│  (Github, hf, Context7, Exa) existieren NICHT mehr.                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Erhebung: MCP-Server nach Transport

| Server | Transport (Registry) | Endpunkt / Bridge | Listener heute | Prozess |
|---|---|---|---|---|
| `mcp-kubernetes` | http | `:18080/mcp`, Browser `:18082/mcp` | **ja** (`/sse` → 200) | `mcp-gateway.service` (kubectl port-forward) |
| `mcp-postgres` | http | `:13001/mcp` | **ja** (`/health` → 200) | dieselbe port-forward-PID |
| `factory-mcp` | http | `:13003/mcp` | **ja** (`/health` → 200) | `factory-mcp.service` |
| `bge-mcp` | http | `:13005/mcp` + Bearer | **ja** (401 ohne Token) | `bge-mcp.service` |
| `ticket-mcp` | stdio | Bridge `:18235/mcp/ticket-mcp` | **ja**, 26 Tools | Kind des llm-proxy |
| `codebase-memory-mcp` | stdio | Bridge `:18235/mcp/codebase-memory-mcp` | **ja**, 14 Tools | Kind des llm-proxy |
| `mcp-task-runner` | stdio | Bridge `:18235/mcp/mcp-task-runner` | **ja**, 7 Tools | Kind des llm-proxy |
| `github-mcp` | stdio | Bridge `:18235/mcp/github-mcp` | **ja**, 46 Tools | Kind des llm-proxy |
| `task-master-ai` | stdio | — (kein bridge-Eintrag) | unklar (nicht über Bridge erreichbar) | pro Harness-Session |
| `playwright` | stdio | Bridge deklariert | **nein** — `enabled: false` | — |
| `docfork` | stdio | Bridge deklariert | **nein** — `enabled: false` | — |
| `sequential-thinking` | stdio | Bridge deklariert | **nein** — `enabled: false` | — |
| `webresearch` | stdio | Bridge deklariert | **nein** — `enabled: false` | — |

Über die Bridge sind heute **93 Tools** aus 4 stdio-Servern per HTTP erreichbar.

## Erhebung: Agenten-Ebene

`docs/agent-guide/registry/agents.yaml` ist SSOT für zwei getrennte Dinge:

**Rollen** (Claude-Code-Domänenagenten, `.claude/agents/bachelorprojekt-*.md`):

| Rolle | claude_code | agy | opencode |
|---|---|---|---|
| `bachelorprojekt-db` | sonnet | unsupported | null |
| `bachelorprojekt-infra` | **opus** | unsupported | null |
| `bachelorprojekt-ops` | sonnet (Tools: Bash, Read, Glob, Grep) | unsupported | null |
| `bachelorprojekt-security` | **opus** | unsupported | null |
| `bachelorprojekt-test` | sonnet | unsupported | null |
| `bachelorprojekt-website` | sonnet | unsupported | null |

**Runtimes** (opencode, Quelle `.opencode/agent-models.jsonc`): `gemma26-1`, `gemma26-2`,
`gemma26-primary`, `gemma26-vision` u. a. — alle auf demselben Modell
`llamacpp-gemma26/gemma26-factory`, das heißt auf **einem** llama-server (:8091) mit `-np 3 -kvu`.
Die drei Namen existieren, damit jeder Slot seinen eigenen Prefix-Cache behält (T002545);
serialisiert werden sie trotzdem, weil der llm-proxy `max_inflight=1` fährt.

Die generierten Karten unter `docs/agent-guide/maps/` (`agents-map.md`, `tools-map.md`,
`goals-map.md`, `danger-map.md`) leiten sich aus dieser Registry ab (`task agent-guide:maps`).

## Ist/Soll und Silent-Failure-Pfade

| # | Pfad | Verhalten bei Bruch |
|---|---|---|
| S1 | `ui-config.json` vs. Registry | **Stiller Drift.** Die Datei liegt außerhalb des Repos, `task mcp:check` sieht sie nicht. Wird nur beim Loadout-Start durch den llm-proxy neu geschrieben; wer sie in der WebUI von Hand ändert, erzeugt Drift, die kein Guard meldet. Die WebUI zeigt einen fehlgeschlagenen Server nur im Browser an. |
| S2 | `scripts/llm/mcp-servers.json` → llama-server | **Ergebnislos ohne Fehler.** Die Datei wird generiert und drift-geprüft, aber **kein** Launcher übergibt `--mcp-servers-config`. `grep -rn "mcp-servers-config" scripts/` liefert nur Registry-Kommentare und Design-Dokumente. Der laufende `:8091`-Aufruf enthält den Schalter nicht. Die Generierung ist also korrekt und folgenlos. |
| S3 | `loadouts.json` → `mcp.serversConfig` | Alle 5 Loadouts tragen `"mcp": {"serversConfig": null}`; kein Konsument im Code (`grep serversConfig scripts/llm/*.mjs` → leer). Das Feld ist heute reine Deklaration. |
| S4 | Port-Forward `:18080` / `:13001` | Beide Listener gehören **einer** `kubectl port-forward`-PID (`mcp-gateway.service`). Stirbt der Cluster-Zugang oder der Pod, verschwinden **beide** MCP-Server gleichzeitig. Der Harness meldet dann nur „Server nicht erreichbar", nicht die gemeinsame Ursache. |
| S5 | llm-proxy-Provider | `/health` meldet `degraded` mit Provider-Liste, aber `status: ok`, sobald **ein** Provider antwortet. Ein toter Zweitprovider fällt im Betrieb nicht auf. |

## Defekt-Referenz (T002430 D4–D9, B3 aus T002398)

| Defekt | Stand 2026-07-28 | Messung 2026-08-02 | Bewertung |
|---|---|---|---|
| **D4** — vier browser-lokale MCP-Server (Github, hf, Context7, Exa) in der llama-WebUI, nirgends versioniert, von `mcp:check` unsichtbar | bestätigt | **behoben.** `ui-config.json` enthält heute 8 Einträge, alle mit Registry-Endpunkten (`browser_endpoint` bzw. Bridge-URL). Die vier Ad-hoc-Einträge sind weg. Renderer: `scripts/llm/ui-config-seed.mjs` (T002549/T002550). | **geschlossen, mit Rest**: die Zieldatei liegt weiterhin außerhalb des Repos und wird von `task mcp:check` **nicht** auf Drift geprüft (→ S1). |
| **D5** — `mcp-postgres` (:13001) und `mcp-kubernetes` (:18080) in der Registry, aber ohne Listener | bestätigt | **behoben.** Beide antworten; `mcp-gateway.service` hält den `kubectl port-forward` offen. | geschlossen; Einzelpunktausfall bleibt (→ S4). |
| **D6** — llm-proxy `degraded`, alle drei Provider tot | bestätigt | **teilweise behoben.** Erste Messung 12:50 Uhr: `degraded`, alle drei — Ursache war `llamacpp-gemma` im Zustand `Loading model` (503). Zweite Messung wenige Minuten später: `status: ok`, `ready: true`, nur `deepseek` und `opencode-zen` degraded. `:5099` hat keinen Listener. | offen für die zwei Remote-Provider; der Primärpfad trägt. |
| **D7** — `:8098` lief an `loadouts.json` vorbei (Alias `gptoss-mcp` statt versioniertem `gptoss-context`), Neustart hätte die 40 Tools verloren | bestätigt | **eingetreten.** `:8098` hat heute **keinen Listener**; der abweichend gestartete Prozess existiert nicht mehr. Die 40 Tools sind damit weg — allerdings ohne Verlust, weil dieselben stdio-Server jetzt über die Bridge laufen (→ D9). `loadouts.json` trägt für alle 5 Loadouts unverändert `mcp.serversConfig: null`. | Symptom erledigt, **Ursache offen**: es gibt weiterhin keinen versionierten Weg, einem Loadout MCP-Server mitzugeben (→ S2, S3). |
| **D9** — Richtungsproblem: llama.cpp startet MCP-Server serverseitig nur als stdio-Kindprozesse; HTTP-MCPs kommen dort strukturell nicht hinein | bestätigt | **umgangen, nicht aufgelöst.** Die strukturelle Aussage gilt unverändert (`server_mcp_stdio` ist der einzige serverseitige Mechanismus). Gelöst wurde die **andere** Richtung: `scripts/llm-proxy/mcp-bridge.mjs` (T002429) macht stdio-Server als HTTP unter `:18235/mcp/<name>` verfügbar, sodass der Browser sie erreicht. Serverseitig hat `:8091` weiterhin keinen einzigen MCP-Server. | Konsument ist heute der **Browser**, nicht llama-server. |
| **B3** (T002398) — aggregierte Tools liegen unter `GET /tools` und `POST /tools`, werden **nicht** in `/v1/chat/completions` injiziert | bestätigt am :8098 | **heute nicht messbar** — `:8098` läuft nicht, und kein anderer llama-server hat MCP-Server geladen. Der llm-proxy hat keinen `/tools`-Endpunkt (er bridged nur JSON-RPC unter `/mcp/<name>`), Tool-Injektion in `/v1/chat/completions` findet dort ebenfalls nicht statt. | **unklar** für llama.cpp; für den llm-proxy gilt dieselbe Trennung. |

Nicht Teil dieser Komponente: D1–D3 und D8 (Vektorspeicher, Embedding-Paare, Code-Graph —
siehe K1/K2/K3).

## Nicht gemessen / unklar

- `task-master-ai`: in der Registry als stdio geführt, ohne `bridge`-Eintrag. Ob eine
  Harness-Session ihn heute startet, wurde nicht geprüft — **unklar**.
- `.opencode/agent-models.jsonc` wurde nur über die Registry-Spiegelung in `agents.yaml`
  erfasst, nicht direkt gegengelesen.
- Die Tool-Zahlen (26/14/46/7) stammen aus `tools/list` über die Bridge. Ob ein Harness
  dieselbe Menge sieht, hängt an seiner eigenen Config und wurde nicht gegengeprüft.
- Cluster-seitige MCP-Pods (`svc/claude-code-mcp-monolith`) wurden nur indirekt über den
  Port-Forward gemessen, nicht per `kubectl get pod`.

## Quellen

| Datei | Rolle |
|---|---|
| `docs/agent-guide/registry/mcp.yaml` | SSOT MCP-Clients (T002300) |
| `docs/agent-guide/registry/agents.yaml` | SSOT Rollen + Runtimes |
| `scripts/mcp-sync.sh` | Renderer 1–4 + Drift-Check |
| `scripts/llm/ui-config-seed.mjs` | Renderer 5 (WebUI), nicht drift-geprüft |
| `scripts/llm/loadouts.json` | llama-server-Loadouts, `mcp.serversConfig` durchweg `null` |
| `scripts/llm/mcp-servers.json` | generiert, ohne Konsument |
| `scripts/llm-proxy/server.mjs` | `/v1/*`-Aggregation + Bridge-Einbindung |
| `scripts/llm-proxy/mcp-bridge.mjs` | stdio→HTTP-Brücke (T002429) |
| `scripts/mcp-cors-proxy/proxy.mjs` | CORS-Vorschaltung `:18082` → `:18080` |
