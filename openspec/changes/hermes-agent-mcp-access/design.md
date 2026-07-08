## Context

Hermes (`~/.hermes/`, `google/gemma-4-12b-qat` via LM Studio) ist der Tier-0-Delegate für reine
Textgenerierung ohne Werkzeugzugriff (`.claude/skills/references/subagent-provisioning.md`).
`hermes mcp add/remove/list/test/configure` verwaltet MCP-Server in `~/.hermes/config.yaml`
unter dem Key `mcp_servers`. Server-Schema: `{url | command+args+env, enabled, tools:
{include: [...]} | {exclude: [...]}}` (`hermes_cli/mcp_config.py:78-104`, `:465-497`,
`:849-903`). `hermes mcp add` ist ein interaktiver, discovery-first Flow (verbindet, listet
Tools, fragt Enable-all/Select/Cancel per TTY-Prompt) — für reproduzierbares, versioniertes
Provisioning ungeeignet.

Der Projekt-MCP-Katalog ist bereits für opencode in `.opencode/opencode.jsonc` deklarativ
registriert: Remote/HTTP via kubectl-Portforward (`factory-mcp` `:13003/mcp`, `mcp-kubernetes`
`:18080/mcp`, `mcp-postgres` `:13001/mcp`) und Stdio-Prozesse (`codebase-memory-mcp`,
`mcp-task-runner`, `ticket-mcp`). `mcp-postgres` exponiert ein einziges Tool (`query`) und ist
serverseitig read-only erzwungen (`mcp-tool-guide.md:15`) — kein Denylist-Bedarf dort.

Zwei Brainstorming-Runden mit dem User (AskUserQuestion) haben den Scope geklärt: Hermes bekommt
denselben Server-Katalog wie ein `haiku`-Subagent, aber mit einer harten `tools.exclude`-Denylist
pro Server für destruktive/mutierende Tools (Cluster-Writes, Ticket-DB-Writes, Shell/Task-
Execution).

## Goals / Non-Goals

**Goals:**
- Deklarative, versionierte Server-Registry (`scripts/hermes-mcp-servers.yaml`) als SSOT für
  Hermes' MCP-Zugriff, analog zu `.opencode/opencode.jsonc`.
- Idempotentes Provisioning-Skript, das die Registry direkt in `~/.hermes/config.yaml` schreibt
  (kein interaktiver `hermes mcp add`-Flow, kein manuelles Tool-Picking).
- `scripts/hermes-delegate.sh` bleibt standardmäßig werkzeuglos (`-t ""`) — MCP-Zugriff ist
  strikt Opt-in über einen neuen Parameter, keine Verhaltensänderung für bestehende Aufrufer.
- Jeder Server, der destruktive/mutierende Tools exponiert, bekommt eine geprüfte
  `tools.exclude`-Liste; nur Read/Query/Status-Tools bleiben für Hermes erreichbar.

**Non-Goals:**
- Kein automatischer Aufruf des Provisioning-Skripts aus bestehenden dev-flow-Skills — bleibt
  ein manuell angestoßener Setup-Schritt.
- Kein OAuth-Flow für die Remote-MCP-Server (laufen lokal über kubectl-Portforward ohne Auth).
- Kein Rollout auf andere Hermes-Profile außer dem bereits vorhandenen `bachelorprojekt`-Profil.
- Kein automatisches Nachziehen der Denylist bei neuen Tools in einem der Server (siehe Risiken).

## Decisions

### D1: Config-Datei direkt schreiben statt `hermes mcp add` zu scripten
`hermes mcp add` ist interaktiv (TTY-Prompts für Auth, Tool-Discovery-Bestätigung, Enable-
all/Select). Ein Bash-Wrapper, der diese Prompts mit `expect`/Heredocs simuliert, wäre fragil
gegen CLI-Änderungen. Stattdessen schreibt `scripts/hermes-mcp-provision.sh` die
`mcp_servers`-Sektion von `~/.hermes/config.yaml` (YAML) direkt — dasselbe Muster wie
`.opencode/opencode.jsonc`, das ebenfalls eine statische, versionierte Registrierung ist statt
eines interaktiven Setups.
**Alternative verworfen:** `hermes mcp add` mit `--accept-hooks` + gepipetem stdin scripten —
zu fragil, da die Tool-Selection-Kurses-UI (`curses_checklist`) nicht stdin-scriptbar ist.

### D2: `tools.exclude` (Denylist) statt `tools.include` (Allowlist) je Server
Für Server mit überwiegend Read-Tools (`mcp-kubernetes`, `codebase-memory-mcp`, `factory-mcp`)
ist eine Denylist kürzer und wartbarer als eine vollständige Allowlist. **Ausnahme:**
`ticket-mcp` hat mehr Write- als Read-Tools — dort wird dennoch `exclude` verwendet (nicht
`include`), um bei künftigen Read-Tool-Ergänzungen im Server nicht die Registry pflegen zu
müssen; die Denylist-Vollständigkeit wird stattdessen über den BATS-Test in Punkt "Tests"
abgesichert.

### D3: Server-Registry getrennt vom Provisioning-Skript
`scripts/hermes-mcp-servers.yaml` (Daten) getrennt von `scripts/hermes-mcp-provision.sh`
(Logik) — Katalog-Änderungen (neuer Server, geänderte Denylist) sind reine Daten-Edits ohne
Skript-Anfassen, testbar per `yq`/`jq`-Validierung im BATS-Test.

### D4: `mcp-postgres` ohne Denylist
Serverseitig bereits read-only erzwungen (`mcp-tool-guide.md:15` — das Tool nimmt nur `sql`
entgegen und lehnt schreibende Statements ab). Eine Client-seitige Denylist wäre redundant.

## Risks / Trade-offs

- **[Risiko] Denylist-Drift:** Ein neuer destruktiver Tool-Name in einem der Server (z.B.
  `mcp-kubernetes` bekommt ein neues Write-Tool) wird nicht automatisch erkannt.
  → **Mitigation:** Dokumentations-Eintrag in `gotchas-footguns.md` ("bei neuen destruktiven
  Tools MUSS die Denylist in `hermes-mcp-servers.yaml` nachgezogen werden") + BATS-Test, der
  gegen eine hart codierte Referenzliste bekannter destruktiver Tool-Namen prüft (schlägt fehl,
  wenn ein bekanntes destruktives Tool NICHT in `exclude` steht — aber erkennt keine völlig
  neuen, dem Test unbekannten Tool-Namen).
- **[Risiko] Hermes' Tool-Calling-Zuverlässigkeit:** Auch mit Denylist kann das kleinere Modell
  Read-Tools falsch/exzessiv aufrufen. → **Mitigation:** Kein API-Token-Kostenrisiko (läuft
  lokal); Ergebnisse bleiben laut Tier-0-Definition ungeprüft nicht weiterverwendbar — das ist
  bereits bestehende Policy in `subagent-provisioning.md`, wird hier nur um den MCP-Fall
  ergänzt.
- **[Trade-off] Config lebt außerhalb des Repos:** `~/.hermes/config.yaml` ist nicht Teil des
  Repo-Git-Trackings (T001609-Scope-Begründung) — die Registry (`scripts/hermes-mcp-servers.yaml`)
  ist die versionierte Quelle, die generierte `config.yaml`-Sektion selbst nicht. Bei manueller
  Fremdänderung an `config.yaml` überschreibt ein erneuter Provisioning-Lauf diese kommentarlos
  (idempotent by design) — im Skript-Output wird das explizit gelogged.

## Migration Plan

1. Registry + Provisioning-Skript + Delegate-Erweiterung + Doku + Test committen (dieser Change).
2. Manuell einmalig `bash scripts/hermes-mcp-provision.sh` auf dem Entwickler-Host ausführen
   (kein CI-/Deploy-Schritt, da Hermes nur lokal läuft).
3. Rollback: `hermes mcp remove <name>` pro Server oder Wiederherstellen der vorherigen
   `~/.hermes/config.yaml` aus `hermes backup`.
