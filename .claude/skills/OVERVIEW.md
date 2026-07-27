# Skills Overview

28 project-local skills grouped by domain. Each skill has its own `SKILL.md` with full runbook details. Invoke any skill by its name.

> **Konsolidierung (2026-06-21):** 7 Infra/Ops-Skills wurden in `infra-ops` zusammengeführt (nur bei explizitem Bedarf aufrufen). `update-dependencies` läuft als biweekly Cloud-Routine (https://claude.ai/code/routines/trig_01GiuyN6KP5iMcVUSvBQMKyQ). Die archivierten SKILL.md-Dateien haben kein `description`-Feld mehr und triggern nicht auto-matisch.

> **Wartung:** Diese Anzahl stimmt mit `git ls-files -- .claude/skills | grep -c '/SKILL\.md$'` überein (nur **getrackte** Skills — lokal via market-cli installierte zählen nicht, Präzedenz T001783). Wenn ein Skill hinzukommt oder entfernt wird, hier nachziehen (Gate G-AGENTIC06).

> **Projekteigen vs. Vendor (T002303):** Die Sektion [Vendor-Skills](#vendor-skills-upstream-gepflegt) unten ist die **maschinenlesbare Quelle** für diesen Schnitt. Ein getrackter Skill gilt als projekteigen, wenn sein Verzeichnisname dort **nicht** vorkommt. `G-AGENTIC09` (Zeilenbudget 250) und `tests/spec/agent-skills.bats` leiten ihren Scope daraus ab — der Marker-Block dort ist ein Kontrakt, kein Layout.

> **Für Agenten:** Schnelle Routing-Karten (Intention → Weg → Tier → Guardrails) unter `docs/agent-guide/maps/` — `goals-map.md`, `tools-map.md`, `danger-map.md`. Generiert aus `docs/agent-guide/registry/`.

## Subagent dispatch (Skill → Agent)

Each skill's `SKILL.md` frontmatter carries an optional `agent:` field that tells the orchestrator which `.claude/agents/<name>.md` config to splice into a subagent before spawning it. The full protocol (recipe + current mapping table) lives in `AGENTS.md` → "Skill Dispatch Protocol". Quick reference:

- Skills with `agent:` → dispatched as a subagent via [`task`](https://github.com/Paddione/Bachelorprojekt/search?q=task&type=code) with `subagent_type: "general"` (isolated context window, own domain knowledge).
- Skills without `agent:` → loaded inline in the main session (workflow/orchestrator skills that span multiple agents or hold state).
- New skill: pick an agent from the routing table, add `agent: bachelorprojekt-<role>` to frontmatter, add a row to the AGENTS.md table.

---

## Development Flow (sequential pipeline)

| Skill | When to use |
|---|---|
| [`dev-flow-plan`](dev-flow-plan/SKILL.md) | **Entry point** for feature/fix changes — runs brainstorming, creates spec + plan, commits to branch, then **stops**. Routes chores to [`dev-flow-chore`](dev-flow-chore/SKILL.md). |
| [`dev-flow-chore`](dev-flow-chore/SKILL.md) | Maintenance with no behavior change (docs, dep bumps, config, CI) — executes and merges **inline**, no plan/execute handoff. |
| [`dev-flow-execute`](dev-flow-execute/SKILL.md) | After [`dev-flow-plan`](dev-flow-plan/SKILL.md) has pushed a staged plan — implements, verifies, opens PR, merges, deploys. |
| [`dev-flow-e2e`](dev-flow-e2e/SKILL.md) | After [`dev-flow-execute`](dev-flow-execute/SKILL.md) has merged and deployed — writes + runs Playwright E2E tests against live environment. |

---

## Feature Discovery (vorgelagert zur Pipeline)

`/feature-intake` ist ein **opencode-Command**, kein Skill — es gibt kein
`.claude/skills/feature-intake/`-Verzeichnis.

| Command | When to use |
|---|---|
| `/feature-intake` | **Vor [`dev-flow-plan`](dev-flow-plan/SKILL.md)** — generiert ein frisches HTML-Formular, dedupliziert Feature-Kandidaten gegen den aktuellen Ticket-Backlog und liefert es via Session-Hub. Für Patrick oder gekko zum Ausfüllen auf einen Klick. Kein Teil der dev-flow-Pipeline; speist [`dev-flow-plan`](dev-flow-plan/SKILL.md). Assets unter `assets/feature-intake/`. |

---

## OpenSpec Workflow

Diese vier Skills stammen aus dem OpenSpec-Upstream (installiert via T001263), wurden hier aber
weiterentwickelt und sind **Forks** — siehe die Fork-Deklaration in ihrem jeweiligen Frontmatter.
Sie zählen deshalb als projekteigen und unterliegen dem Zeilenbudget.

| Skill | When to use |
|---|---|
| [`openspec-propose`](openspec-propose/SKILL.md) | Create a new OpenSpec change proposal with design, specs, and tasks in one step. |
| [`openspec-apply-change`](openspec-apply-change/SKILL.md) | Implement tasks from an OpenSpec change — start/continue implementation. |
| [`openspec-explore`](openspec-explore/SKILL.md) | Enter explore mode — thinking partner for ideas, investigations, requirements. |
| [`openspec-archive-change`](openspec-archive-change/SKILL.md) | Archive a completed change after implementation is complete. |

---

## Git Lifecycle

| Skill | When to use |
|---|---|
| [`git-workflow`](git-workflow/SKILL.md) | **Immer beim Committen, Pushen oder PR-Erstellen** — vollständiger Lifecycle: pull-first, Conventional Commits + Ticket-ID, Freshness Guard, Commit-Verifikation (git-crypt), PR-Scope-Preflight, CI-Fix-Loop, Auto-Merge `--squash --delete-branch`, Worktree-Cleanup. |

---

## Schicht-Kontrakt: dev-flow orchestriert, Disziplin-Schritte sind inlined

Die `dev-flow-*`-Skills sind **projektspezifische Orchestratoren**. Die ehemaligen generischen
`superpowers:*`-Disziplin-Schritte (brainstorming, writing-plans, executing-plans,
test-driven-development, verification-before-completion, requesting-code-review) sind in die
jeweiligen `dev-flow-*`-Skills inlined — keine eigenen Skill-Verzeichnisse mehr.

**Regel:** Für Repo-Arbeit **immer über `dev-flow-*` einsteigen**.

| dev-flow-Schritt | Disziplin-Schritt (inlined) |
|---|---|
| `dev-flow-plan` Schritt 3 | Brainstorming |
| `dev-flow-plan` Schritt 3.7 (Subagent) | Plan-Schreibung |
| `dev-flow-execute` Schritt 2 (Implementer) | executing-plans + test-driven-development |
| `dev-flow-execute` Schritt 3 | verification-before-completion |
| `dev-flow-execute` Schritt 3.8 | requesting-code-review (Code Review) |

> **Worktrees:** `scripts/worktree-create.sh` (git-crypt-safe) übernimmt Worktree-Isolation im dev-flow-Pfad. Hintergrund: [`superpowers/using-git-worktrees`](superpowers/using-git-worktrees/SKILL.md).

### Verifikations-Leiter (wer prüft was — kein doppeltes Gate)

Verifikation passiert bewusst auf zwei Ebenen mit **unterschiedlichem Zweck** — das ist kein Stacking:

1. **Implementer-Subagent:** test-driven-development (Rot-Grün) → stoppt erst bei grünen Tests. *Selbst-Check.*
2. **Eltern (execute):** verification-before-completion → **unabhängige** Re-Verifikation der Subagent-Behauptung (Evidence vor Assertion).
3. **Eltern (execute):** requesting-code-review → fremde Augen auf Korrektheit/Stil **vor** Merge.
4. **Eltern (execute):** CI-Fix-Loop → die Wahrheit der CI nach dem Push.

Stufe 2 wiederholt Stufe 1 *nicht* aus Misstrauen, sondern weil delegierte Selbstauskunft kein
unabhängiger Beweis ist. Stufen 3+4 prüfen andere Dimensionen (Review-Qualität, CI-Realität).

---

## Infrastructure, Secrets & Service-Operations

`infra-ops` ist ein **explicit-invoke-only Runbook** und bündelt sieben ehemals eigenständige
Skills. Die Sektionen sind einzeln adressierbar; die ausformulierten Phasen liegen in
[`references/infra-ops-runbooks.md`](references/infra-ops-runbooks.md).

| Einstieg | Wofür |
|---|---|
| [`infra-ops`](infra-ops/SKILL.md) §1 | Cluster Deployment — neue Kubernetes-Umgebung aufsetzen, Ressourcen ausrollen, degradierten Cluster diagnostizieren (Gap-Analyse), Cross-Brand-Fleet-Operationen (`task feature:*`-Fan-out, `feature:promote`-Smoke-Gate). |
| [`infra-ops`](infra-ops/SKILL.md) §2 | Workspace Deploy — `workspace:setup`, post-setup, talk/recording/transcriber-setup, optionales admin-users- und vaultwarden-Seeding. Alles, was nicht allein über die Base-Kustomize ausgeliefert wird. |
| [`infra-ops`](infra-ops/SKILL.md) §3 | Host Node Networking — Hetzner-Provisionierung, cloud-init, Rescue-Mode-Resets, WireGuard-Mesh-Topologie, UFW-Ports, WSL-Gateway. |
| [`infra-ops`](infra-ops/SKILL.md) §4 | Pocket ID / SSO — OIDC-Clients neu seeden, Client-State in `pocket_id.oidc_clients`. |
| [`infra-ops`](infra-ops/SKILL.md) §5 | LLM-Pipeline — GPU-Host-Bootstrap, Model-Management, Deploy/Status/Test der LLM-Gateway-Dienste. |
| [`infra-ops`](infra-ops/SKILL.md) §6 | Secret-Rotation — DB-Passwörter, API-Keys, SealedSecrets-Keypair (nach Reset), Claude-Code-Tokens, Service-Credentials über beide Brands auf dem Fleet-Cluster. |
| [`infra-ops`](infra-ops/SKILL.md) §7 | Datenbank-Betrieb — Schema-Migrationen, Default-Permission-Grants, Backup-Audit, verifizierter Restore. |

Fachspezifische Skills, die als Subagent dispatched werden:

| Skill | When to use |
|---|---|
| [`website-specialist`](website-specialist/SKILL.md) | Astro/Svelte frontend development, component creation, page routing, content management, UI implementation. Dispatched as subagent via `bachelorprojekt-website`. |
| [`security-specialist`](security-specialist/SKILL.md) | SealedSecrets lifecycle, Pocket ID OIDC client config, OIDC setup, DSGVO compliance, credential management. Dispatched as subagent via `bachelorprojekt-security`. |
| [`database-specialist`](database-specialist/SKILL.md) | PostgreSQL schema migrations, data queries, backup/restore, index optimization, performance tuning. Dispatched as subagent via `bachelorprojekt-db`. |

---

## Knowledge Operations

| Skill | When to use |
|---|---|
| [`brain-ingest`](brain-ingest/SKILL.md) | Brain-Wiki-Ingestion — Worklist aus `scripts/brain/ingest-sources.yaml` generieren, Quelldateien per LLM in Wiki-Seiten transformieren, Ergebnis per PR an das externe `Paddione/brain`-Repo ausliefern. |
| [`references`](references/SKILL.md) | Geteilte Querschnitts-Referenzen für dev-flow-Skills und Subagenten — Subagent-Provisionierung, Plan-Quality-Gates, MCP-Tool-Guide, Session-Koordination, CI-Fix-Loop, Deploy-Routing. |

---

## Operations & Life-Cycle Management

| Skill | When to use |
|---|---|
| [`operations-management`](operations-management/SKILL.md) | **Routing hub** — dispatches to [`incident-response`](incident-response/SKILL.md) (time-critical incidents) or [`ticket-ops`](ticket-ops/SKILL.md) (daily ops). Entry point for all operational work. |
| [`incident-response`](incident-response/SKILL.md) | Production incident triage & recovery — scope, diagnose, fix/rollback, post-mortem. Use when a core service is down or degraded. |
| [`ticket-ops`](ticket-ops/SKILL.md) | **Ticket-Inhalte** — Triage auf Vollständigkeit, fehlende Angaben beim Menschen erfragen, Parallelarbeit über Tickets planen. Nicht für Branch-/Worktree-/PR-Housekeeping — das ist [`repo-hygiene`](repo-hygiene/SKILL.md). |
| [`repo-hygiene`](repo-hygiene/SKILL.md) | **Repo-Zustand** — veraltete Branches und Worktrees, offene PRs mergen und schließen, GitHub-Issue-Intake, Factory-Queue-Status. Nicht für Ticket-Inhalte — das ist [`ticket-ops`](ticket-ops/SKILL.md). |
| [`mishap-tracker`](mishap-tracker/SKILL.md) | **End-of-skill routine** — batches accumulated `MISHAP_LOG` entries from runbook skills into a single aggregate `tickets.tickets` row. Reuses an open "Mishap collection" ticket if one exists. |
| [`update-dependencies`](update-dependencies/SKILL.md) | Update workspace packages, fix deprecation warnings, and handle security audits/Major version bumps across all directories. Läuft als biweekly Cloud-Routine; `archived: true`, deshalb ohne `description` und nicht in der Session-Liste. |

---

## Vendor-Skills (upstream-gepflegt)

Diese Skills stammen von Dritten und werden hier **nicht** gepflegt. Sie unterliegen deshalb
weder dem 250-Zeilen-Budget noch dem projekteigenen description-Standard: eine Änderung würde
beim nächsten Upstream-Sync kollidieren.

**Dieser Block ist ein Kontrakt.** `G-AGENTIC09` in `scripts/health-goals-check.sh` und
`tests/spec/agent-skills.bats` extrahieren die Namen zwischen den Markern per

```bash
sed -n '/<!-- vendor-skills:begin -->/,/<!-- vendor-skills:end -->/p' .claude/skills/OVERVIEW.md \
  | grep -oE '^\| `[a-z0-9/-]+`' | tr -d '|` ' | sort -u
```

Marker und Zeilenformat (`| \`name\` | …`) dürfen nicht verändert werden. Fehlt der Block, gelten
alle Skills als projekteigen — das Gate wird dann strenger, nicht schwächer.

<!-- vendor-skills:begin -->
| Skill | Herkunft | Wann verwenden |
|---|---|---|
| `gitops-cluster-debug` | Flux CD / controlplane.io | Flux auf einem **laufenden** Cluster debuggen — Resource-Status, Controller-Logs, Dependency-Ketten. Dispatched as subagent. |
| `gitops-knowledge` | Flux CD / controlplane.io | Flux-Konzepte beantworten und schema-validiertes YAML für Flux-CRDs erzeugen. Dispatched as subagent. |
| `gitops-repo-audit` | Flux CD / controlplane.io | GitOps-**Repo-Dateien** prüfen — Schema-Validierung, deprecated APIs, RBAC/Multi-Tenancy. Dispatched as subagent. |
| `lavish` | Kun Chen (kunchenguid) | Komplexe oder visuelle Antworten als annotierbares HTML-Artefakt rendern (`lavish-axi`). Nur nach Zustimmung des Nutzers. |
| `superpowers/using-git-worktrees` | Superpowers-Plugin | Hintergrund zur Worktree-Isolation. Im dev-flow-Pfad ersetzt durch `scripts/worktree-create.sh` (git-crypt-safe). |
| `ui-ux-pro-max` | Drittanbieter | UI/UX-Design-Intelligenz (Styles, Paletten, Font-Pairings) — für opencode via `permission: deny` deaktiviert. |
| `vitest` | Anthony Fu (antfu/skills) | Vitest-Referenz — Mocking, Coverage-Konfiguration, Test-Filtering, Fixtures. |
<!-- vendor-skills:end -->

> **Ungetrackte Skills (lokal installiert):** `haniakrim21-everything-claude-code-react-bits` (Name `react-bits`) und `whisper` sind nicht von git getrackt (lokal via market-cli installiert). Ihre Entfernung ist ein manueller Schritt auf dem Entwicklungsrechner.

---

## Skill-Beziehungen & Abfolge

```mermaid
graph TD
    FI[/feature-intake] -.->|vorgelagert| DP

    subgraph "Dev-Flow Pipeline (sequentiell)"
        DP[dev-flow-plan] -->|feature/fix| DE[dev-flow-execute]
        DP -->|chore| DC[dev-flow-chore]
        DE --> DEE[dev-flow-e2e]
    end

    subgraph "Runbooks (eigenständig)"
        IO[infra-ops §1-7]
    end

    subgraph "Support"
        MT[mishap-tracker]
        OM[operations-management]
        IR[incident-response]
        TO[ticket-ops]
        RH[repo-hygiene]
    end

    DP --> IO
    DE --> IO
    DEE --> IO

    OM --> IR
    OM --> TO
    IR --> MT
    TO --> MT
    TO -.->|Repo-Zustand| RH
    IO -.-> OM
```

**Legende:**
- Durchgezogene Pfeile: explizite Aufrufe / Delegation
- Gestrichelte Pfeile: typische Folge-Operation (z.B. Mishap-Report nach Runbook)

**Typische Workflows:**

| Start | Verlauf | Ergebnis |
|-------|---------|----------|
| Feature entwickeln | [`dev-flow-plan`](dev-flow-plan/SKILL.md) → [`dev-flow-execute`](dev-flow-execute/SKILL.md) → [`dev-flow-e2e`](dev-flow-e2e/SKILL.md) | Gemergetes + getestetes Feature |
| Wartung (Chore) | [`dev-flow-chore`](dev-flow-chore/SKILL.md) (inline) | Gemergte Wartung ohne Plan-Handoff |
| Cluster aufsetzen / Workspace deployen | `infra-ops` §1–2 | Produktions-Cluster + alle Services |
| DB-Migration / Backup | `infra-ops` §7 + `dev-flow-execute` (Schema-Change) | Gemergte Migration |
| Secret rotieren | `infra-ops` §6 | Rotierte Secrets |
| Pocket ID / SSO | `infra-ops` §4 | Re-seed OIDC clients |
| LLM / GPU | `infra-ops` §5 | GPU-Pipeline operativ |
| Abhängigkeiten updaten | Biweekly Cloud-Routine (auto) | Aktualisierte Packages per PR |

## Cross-Cutting: Grilling → Ticket

Jede Grilling-Session (Q/A-Interview: Coaching, Deep-Grilling, Klärung, Incident-Befragung)
lässt sich mit **einem** geteilten Helper an ein Ticket senden:
`scripts/ticket.sh grill --id <ext-id> (--json | --answers-file | --answer qid=text ...)`.
Schreibt akkumulierend in `tickets.tickets.grilling_answers` (forward-kompatibel mit dem
T000737-Panel) + optionalem Timeline-Kommentar. Vollständige How-to:
`.claude/skills/references/grilling-to-ticket.md`. Skill-Autoren: NICHT pro SKILL.md
neu erfinden — die Referenz verlinken.
