---
title: "Agent-Ressourcen-Rework: Skills, eigene MCPs und Instruktionsdateien (Claude Code / agy / opencode)"
ticket_id: "T002299"
plan_ref: null
domains:
  - "agent-config"
  - "docs"
status: active
date: 2026-07-27
---

# Agent-Ressourcen-Rework — Dekompositions-Spec

**Datum:** 2026-07-27
**Epic:** T002299 (`type=project`)
**Kinder:** T002300 (K1) · T002301 (K2) · T002302 (K3) · T002303 (K4) · T002304 (K5) · T002305 (K6)
**Status:** Dekomposition abgenommen; pro Kind folgt ein eigener Spec-/Plan-/Implementierungs-Zyklus.

---

## Purpose

Dieses Repo bedient **drei Agent-Harnesses** — Claude Code, agy (Gemini CLI) und opencode —
mit demselben Satz an Ressourcen: Skills, Agent-Definitionen, MCP-Server und Instruktionsdateien.
Es gibt jedoch keine gemeinsame Quelle. Jeder Harness liest seine eigene Datei, in seinem
eigenen Format, und die Inhalte sind auseinandergelaufen.

Dieses Dokument ist **kein** Implementierungsplan. Es hält den Befund, die getroffenen
Entscheidungen und den Schnitt in sechs unabhängig mergebare Arbeitspakete fest. Jedes Paket
bekommt seinen eigenen Spec und Plan.

## Befund (Bestandsaufnahme 2026-07-27)

### B1 — MCP-Registrierung: dreifach dupliziert, drei Formate, divergierender Inhalt

| | `.mcp.json` | `~/.gemini/config/mcp_config.json` | `.opencode/opencode.jsonc` |
|---|---|---|---|
| Harness | Claude Code | agy | opencode |
| HTTP-Form | `"type": "http"` | `"serverUrl"` | `"type": "remote"` |
| Stdio-Form | `command` + `args` | `command` + `args` | `"type": "local"`, `command: []` |
| Versioniert | ja | **nein** (liegt in `$HOME`) | ja |

Konkrete Divergenzen:

- `task-master-ai` — in Claude aktiv via `npx -y`, in agy aktiv via `~/.npm-global/bin/task-master-ai`,
  in opencode `enabled: false`. Drei Harnesses, drei Wahrheiten.
- `github-mcp`, `playwright`, `docfork`, `sequential-thinking`, `webresearch` — nur in opencodes
  Datei geführt (dort bewusst deaktiviert, mit Begründungskommentar). Claude und agy wissen
  nichts davon.
- Die agy-Datei ist nicht Teil des Repos. Änderungen daran sind unsichtbar, nicht reviewbar
  und überleben keinen Rechnerwechsel.

### B2 — Eigene MCP-Server: drei echte, zwei Karteileichen

| Pfad | Sprache | Zustand |
|---|---|---|
| `scripts/ticket-mcp/` | Go | live, in allen drei Harnesses registriert |
| `mcp-task-runner/` | Go | live, mit `planner/`, `runner/`, `telemetry/` |
| `scripts/factory/mcp-go/` | Go | live, HTTP `:13003`, hat README + systemd-Unit |
| `mcp-browser/` | — | **nur ein `Dockerfile`**, kein Code |
| `scripts/mcp-gateway/` | — | **nur `mcp-gateway.service`**, aber mit SSOT-Spec |

Kein Server ist als **MCPB-Bundle** paketiert. Die Einbindung läuft über absolute Pfade auf
`/home/patrick/…`, hartcodiert in drei Configs — nicht portabel, nicht versioniert, nicht
installierbar.

Die beiden Karteileichen werden **referenziert** von `Taskfile.agents.yml`, `tests/prod/NFA-01.sh`,
`claude-code/system-prompt.md`, `scripts/factory/service-registry.sh`,
`docs/code-quality/subsystems.yaml`, `openspec/component-map.yaml` und
`openspec/specs/mcp-gateway.md`. Ungeprüftes Löschen bricht potenziell Tests.

### B3 — Skill-Inventar: 42 Einträge, davon ~7 Ballast

Name und `description` jedes Skills werden in **jeder** Session eager gelistet. Der Ordner ist
ein Namespace, kein kuratierter Satz.

- **6 STUB-Skills** (je 27 Zeilen), deren gesamter Inhalt ein Verweis auf ein Built-in ist:
  `test-driven-development`, `verification-before-completion`, `requesting-code-review`,
  `superpowers-brainstorming`, `superpowers-writing-plans`, `superpowers-executing-plans`
- **1 Grabstein**: `llm-ops` (`archived: true`, Body: „ARCHIVIERT → infra-ops §5")
- **1 unaufgeräumter Import**: `haniakrim21-everything-claude-code-react-bits`
- **~10 fachfremde Vendor-Skills**: `gguf-quantization`, `llama-cpp`, `speculative-decoding`,
  `unsloth`, `whisper`, `vitest`, `ui-ux-pro-max`, `gitops-*`, `lavish`

opencode blockt einen Teil davon per Deny-Liste in `opencode.jsonc`; Claude Code und agy laden
alle. Die Deny-Liste ist damit ein **viertes** Wissensduplikat darüber, was wo gilt.

### B4 — `GEMINI.md` ist sachlich falsch

Verifiziert gegen `CLAUDE.md` am 2026-07-27:

| Aussage in `GEMINI.md` | Realität |
|---|---|
| „**Keycloak:** Identity Provider (SSO/OIDC, eigene Realm pro Brand)" | Es ist **Pocket ID**. Keine Realm-JSON-Dateien; Clients liegen in `pocket_id.oidc_clients`, provisioniert vom `pocket-id-client-seed` Job. |
| „**LiveKit:** Streaming + Recording" | Per **T002184** vollständig entfernt. |
| „**push-basiert** deployt via `task workspace:deploy` — **kein Flux/Argo-Reconciler** auf dem Cluster" | Falsch seit **T002083**: Flux ist der primäre, pull-basierte Pfad (`ghcr.io/paddione/fleet-manifests`, `flux/clusters/fleet/`). `workspace:deploy` ist Break-Glass-Fallback. |

`AGENTS.md` bezeichnet sich selbst als cross-harness SSOT für die OpenSpec-Konventionen,
`CLAUDE.md` spiegelt sie. Genau diese Konstellation — SSOT plus handgepflegter Spiegel ohne
Drift-Guard — hat `GEMINI.md` bereits zerlegt.

### B5 — Agent-Definitionen sind zweigleisig

- `.claude/agents/bachelorprojekt-{db,infra,ops,security,test,website}.md` — sechs Markdown-Dateien
  mit Model-Tiering im Frontmatter. Gelesen von Claude Code und, über den Symlink
  `~/.gemini/config/agents → .agents/agents`, auch von agy.
- `.opencode/agent-models.jsonc` — komplett getrenntes System mit lokalen LLM-Subagenten
  (`qwen35-iq4`, `qwen35`, `qwen35-hq`, `qwen3-14b`). **opencode liest `.agents/agents` nicht.**

Das ist in `CLAUDE.md` dokumentiert, aber die Routing-Tabelle beschreibt vollständig nur den
Claude-Code-Pfad.

## Entscheidungen

Getroffen im Brainstorming am 2026-07-27.

| # | Frage | Entscheidung | Verworfene Alternative |
|---|---|---|---|
| E1 | Tiefe des Reworks | Konsolidieren **plus** Qualitäts-Pass: Ballast raus, Drift beseitigen, SSOT herstellen, verbleibende Skills nach `skill-creator`-Standard überarbeiten, MCPs als MCPB paketieren, Instruktionsdateien korrigieren. | Nur entrümpeln (zu wenig); voller Rebuild inkl. Evals (Umfang nicht gerechtfertigt, bevor der Satz stabil ist). |
| E2 | MCP-SSOT | **Generator aus versionierter Registry** + fail-closed BATS-Test. | Nur ein Drift-Test ohne Generator (lässt die ungetrackte agy-Datei als blinden Fleck stehen). Symlink-Strategie (nicht tragfähig — die drei Harnesses lesen *unterschiedliche Formate*, `type: http` vs `serverUrl` vs `command`-Array; ein Symlink kann das nicht überbrücken). |
| E3 | Fachfremde Vendor-Skills | **Löschen**, was das Repo nicht braucht. `gitops-*` (echter Flux-Bezug seit T002083) und `vitest` (website-Tests) bleiben. | Alle behalten und nur Deny-Listen angleichen (löst das Kontext-Problem nicht); in ein eigenes Plugin-Repo auslagern (zusätzliche Infrastruktur für wenig Gewinn). |
| E4 | Baumform | **Epic (`type=project`) + 6 Kinder**, Branch/Worktree erst beim Start des jeweiligen Kindes. | Alle Branches sofort abzweigen — Basen driften, während die ersten Kinder mergen. Flache Liste ohne Epic — verliert die Wellen-Struktur. |
| E5 | Karteileichen `mcp-browser` / `mcp-gateway` | **In K1 untersuchen, dann entscheiden.** Befund als Ticket-Kommentar, bevor etwas entfernt wird. | Ungeprüft löschen — sieben Dateien referenzieren sie, darunter `tests/prod/NFA-01.sh`. |
| E6 | Umfang des Qualitäts-Passes | **Nur projekteigene Skills** (~20). | Alle verbleibenden Skills — jede künftige Vendor-Upstream-Aktualisierung erzeugt sonst Merge-Konflikte. |

## Schnitt

```
EPIC  T002299  Agent-Ressourcen-Rework                          [project]
│
├─ K1  T002300  MCP-Registry-SSOT + Generator                   [feature]
├─ K2  T002301  MCPB-Bundles für die 3 eigenen Go-MCPs          [feature]  ← blocked_by K1
├─ K3  T002302  Skill-Inventar entrümpeln                       [task]
├─ K4  T002303  Skill-Qualitäts-Pass (skill-creator-Standard)   [task]     ← blocked_by K3
├─ K5  T002304  Agent-Definitionen vereinheitlichen             [task]
└─ K6  T002305  Instruktionsdateien: CLAUDE/AGENTS/GEMINI.md    [task]     ← blocked_by K3, K5
```

Die `blocked_by`-Kanten sind als `tickets.ticket_links` erfasst, nicht nur hier beschrieben.

### Ordnungsprinzip

**Erst wegwerfen, dann polieren, zuletzt dokumentieren.** K4 hinter K3 zu hängen spart reale
Arbeit — sonst würden sechs Stub-Skills nach `skill-creator`-Standard überarbeitet, die
anschließend gelöscht werden. K6 steht am Ende, weil die Agent-Routing-Tabelle in `CLAUDE.md`
eine Projektion des finalen Skill- (K3) und Agent-Satzes (K5) ist; früher geschrieben ist sie
beim Merge des letzten Kindes bereits wieder falsch.

### Wellen

| Welle | Tickets | Warum parallelisierbar |
|---|---|---|
| 1 | K1, K3, K5 | disjunkte Dateimengen: `agent-resources/` + `scripts/` · `.claude/skills/` · `.claude/agents/` + `docs/agent-guide/` |
| 2 | K2, K4 | K2 braucht K1s Registry-Schema, K4 braucht K3s finalen Skill-Satz |
| 3 | K6 | projiziert das Ergebnis aller anderen |

### Zielarchitektur K1

```
agent-resources/mcp-registry.yaml          ← SSOT, versioniert
            │
   scripts/mcp-sync.sh render
            ├──> .mcp.json                            (Claude Code)
            ├──> ~/.gemini/config/mcp_config.json     (agy)
            └──> .opencode/opencode.jsonc :: mcp      (opencode)

   scripts/mcp-sync.sh check
            └──> tests/spec/agent-resources.bats  →  Drift == 0, fail-closed
```

Das Muster ist im Repo erprobt: die website-envsubst-Allowlist wurde mit T001993 / PR #2989 auf
genau diese Weise fail-closed gemacht, nachdem sie unbemerkt gedriftet war.

## Eingesetzte Skills

| Skill | Ticket |
|---|---|
| `/mcp-server-dev:build-mcpb` | K2 |
| `/skill-creator` | K3, K4 |
| `/claude-md-management:revise-claude-md` | K6 |

## Nicht in diesem Epic

- Neue Skills oder MCP-Server schreiben. Der Rework konsolidiert Bestehendes.
- `skill-creator`-Evals / Trigger-Benchmarks. Bewusst zurückgestellt, bis der Skill-Satz nach
  K3+K4 stabil ist; danach als Folge-Ticket sinnvoll.
- Die Software-Factory-Pipeline selbst (`scripts/factory/`). Berührt wird nur ihr MCP-Server
  (`scripts/factory/mcp-go/`) im Rahmen von K2.
- `VideoVault/CLAUDE.md` inhaltlich. In K6 wird sie nur auf Widersprüche zur Wurzel-`CLAUDE.md`
  geprüft, nicht überarbeitet.

## Definition of Done (Epic)

1. Eine Änderung an der MCP-Serverliste erfordert genau **eine** Dateiänderung, und CI schlägt
   fehl, wenn die drei generierten Configs davon abweichen.
2. Die drei eigenen MCP-Server sind ohne hartcodierten `/home/patrick/…`-Pfad installierbar.
3. `.claude/skills/` enthält nur Skills, die dieses Repo tatsächlich nutzt; keine verwaiste
   Referenz auf einen gelöschten Skill.
4. Jeder projekteigene Skill hat eine Trigger-taugliche `description`.
5. Keine Aussage in `CLAUDE.md`, `AGENTS.md` oder `GEMINI.md`, die gegen den Repo-Stand falsch
   ist.
6. Für jeden Harness ist dokumentiert, welche Skills, Agenten und MCP-Server dort existieren.
