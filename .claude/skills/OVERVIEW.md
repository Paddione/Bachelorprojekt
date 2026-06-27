# Skills Overview

12 project-local skills (11 in `.claude/skills/<name>/` + 1 in `.claude/skills/superpowers/using-git-worktrees/`) grouped by domain. Each skill has its own `SKILL.md` with full runbook details. Invoke any skill by its name.

> **Konsolidierung (2026-06-21):** 7 Infra/Ops-Skills wurden in `infra-ops` zusammengeführt (nur bei explizitem Bedarf aufrufen). `update-dependencies` läuft als biweekly Cloud-Routine (https://claude.ai/code/routines/trig_01GiuyN6KP5iMcVUSvBQMKyQ). Die archivierten SKILL.md-Dateien haben kein `description`-Feld mehr und triggern nicht auto-matisch.

> **Wartung:** Diese Anzahl stimmt mit `find .claude/skills -name SKILL.md | wc -l` und mit der `<available_skills>`-Liste des OpenCode-Loaders überein. Wenn ein Skill hinzukommt oder entfernt wird, hier nachziehen.

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
| [`dev-flow-plan`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-plan.html) | **Entry point** for feature/fix changes — runs brainstorming, creates spec + plan, commits to branch, then **stops**. Routes chores to [`dev-flow-chore`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-chore.html). |
| [`dev-flow-chore`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-chore.html) | Maintenance with no behavior change (docs, dep bumps, config, CI) — executes and merges **inline**, no plan/execute handoff. |
| [`dev-flow-execute`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-execute.html) | After [`dev-flow-plan`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-plan.html) has pushed a staged plan — implements, verifies, opens PR, merges, deploys. |
| [`dev-flow-e2e`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-e2e.html) | After [`dev-flow-execute`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-execute.html) has merged and deployed — writes + runs Playwright E2E tests against live environment. |

---

## Feature Discovery (vorgelagert zur Pipeline)

| Command | When to use |
|---|---|
| `/feature-intake` | **Vor [`dev-flow-plan`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-plan.html)** — `/feature-intake` (opencode-Command) generiert ein frisches HTML-Formular, dedupliziert Feature-Kandidaten gegen den aktuellen Ticket-Backlog und liefert es via Session-Hub. Für Patrick oder gekko zum Ausfüllen auf einen Klick. Kein Teil der dev-flow-Pipeline; speist [`dev-flow-plan`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-plan.html). Assets unter `assets/feature-intake/`. |

---

## Git Lifecycle

| Skill | When to use |
|---|---|
| [`git-workflow`](git-workflow/SKILL.md) | **Immer beim Committen, Pushen oder PR-Erstellen** — vollständiger Lifecycle: pull-first, Conventional Commits + Ticket-ID, Freshness Guard, Commit-Verifikation (git-crypt), PR-Scope-Preflight, CI-Fix-Loop, Auto-Merge `--squash --delete-branch`, Worktree-Cleanup. |

---

## Schicht-Kontrakt: dev-flow orchestriert, superpowers liefert Disziplin

Die `dev-flow-*`-Skills sind **projektspezifische Orchestratoren**. Sie rufen die generischen
`superpowers:*`-Skills für die Disziplin-Schritte auf und ergänzen Projekt-Tooling
(`worktree-create.sh`, `ticket.sh`, `agent-lock.sh`, Deploy-Tasks).

**Regel:** Für Repo-Arbeit **immer über `dev-flow-*` einsteigen** — nie direkt in
`superpowers:brainstorming` / [`writing-plans`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--writing-plans.html) / [`executing-plans`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--executing-plans.html) / [`finishing-a-development-branch`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--finishing-a-development-branch.html).
Der dev-flow-Skill ruft diese zur richtigen Zeit selbst auf.

| dev-flow-Schritt | ruft superpowers-Skill |
|---|---|
| [`dev-flow-plan`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-plan.html) Schritt 3 | [`brainstorming`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--brainstorming.html) |
| [`dev-flow-plan`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-plan.html) Schritt 3.7 (Subagent) | [`writing-plans`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--writing-plans.html) |
| [`dev-flow-execute`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-execute.html) Schritt 2 (Implementer) | [`executing-plans`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--executing-plans.html) (in-context) + [`test-driven-development`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--test-driven-development.html) |
| [`dev-flow-execute`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-execute.html) bei Fehlern | *(Implementer diagnostiziert selbst — Logs, Hypothese, Fix, Re-Test)* |
| [`dev-flow-execute`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-execute.html) Schritt 3 | [`verification-before-completion`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--verification-before-completion.html) |
| [`dev-flow-execute`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-execute.html) Schritt 3.8 | [`requesting-code-review`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--requesting-code-review.html) |

> **Worktrees:** [`using-git-worktrees`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/using-git-worktrees.html) (superpowers) ist im dev-flow-Pfad durch
> `scripts/worktree-create.sh` ersetzt (git-crypt-safe). Nicht beide mischen.

### Verifikations-Leiter (wer prüft was — kein doppeltes Gate)

Verifikation passiert bewusst auf zwei Ebenen mit **unterschiedlichem Zweck** — das ist kein Stacking:

1. **Implementer-Subagent:** [`test-driven-development`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--test-driven-development.html) (Rot-Grün) → stoppt erst bei grünen Tests. *Selbst-Check.*
2. **Eltern (execute):** [`verification-before-completion`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--verification-before-completion.html) → **unabhängige** Re-Verifikation der Subagent-Behauptung (Evidence vor Assertion).
3. **Eltern (execute):** [`requesting-code-review`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/superpowers--requesting-code-review.html) → fremde Augen auf Korrektheit/Stil **vor** Merge.
4. **Eltern (execute):** CI-Fix-Loop → die Wahrheit der CI nach dem Push.

Stufe 2 wiederholt Stufe 1 *nicht* aus Misstrauen, sondern weil delegierte Selbstauskunft kein
unabhängiger Beweis ist. Stufen 3+4 prüfen andere Dimensionen (Review-Qualität, CI-Realität).

---

## Infrastructure & Networking

| Skill | When to use |
|---|---|
| [`host-node-networking`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/host-node-networking.html) | Host server provisioning (Hetzner, cloud-init, Rescue Mode resets), WireGuard mesh network topology ("netplan"), host UFW firewall ports, LiveKit WebRTC networking, and WSL OpenClaw local gateway setup. |
| [`cluster-deployment`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/cluster-deployment.html) | Stand up a brand-new Kubernetes environment, deploy resources, diagnose cluster degraded state (gap analysis), or operate the dev.mentolder.de stack. Also covers cross-brand fleet operations: `task feature:*` fan-out, `feature:promote` smoke gate, SealedSecrets/Keycloak per-brand independence (Phase 5). |

---

## Secret & Auth Management

| Skill | When to use |
|---|---|
| [`secret-rotation`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/secret-rotation.html) | Rotate DB passwords, API keys, SealedSecrets keypair (post-reset), Claude Code tokens, or service credentials across both brands on the fleet cluster. |
| [`keycloak-realm-sync`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/keycloak-realm-sync.html) | Reconcile Keycloak realm JSON → push OIDC client changes, group mappings, mappers, SSO login fixes. |

---

## Service-Specific Operations

| Skill | When to use |
|---|---|
| [`workspace-deploy`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/workspace-deploy.html) | Full-stack workspace platform deployment — umbrella `workspace:setup`, post-setup, talk/recording/transcriber setup, optional admin-users and vaultwarden seed. Every service that doesn't ship via base kustomize alone. |
| [`llm-ops`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/llm-ops.html) | LLM pipeline operations — GPU host bootstrap, model management, deploy/status/test of LLM gateway services (TEI, Ollama, LiteLLM router, ComfyUI, Rigger). |

---

## Knowledge & Database Operations

| Skill | When to use |
|---|---|
| [`database-ops`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/database-ops.html) | PostgreSQL schema migrations, default permission grants, automated backups audit, and safe restore verification. |

---

## Operations & Life-Cycle Management

| Skill | When to use |
|---|---|
| [`operations-management`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/operations-management.html) | **Routing hub** — dispatches to [`incident-response`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/incident-response.html) (time-critical incidents) or [`ticket-ops`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/ticket-ops.html) (daily ops). Entry point for all operational work. |
| [`incident-response`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/incident-response.html) | Production incident triage & recovery — scope, diagnose, fix/rollback, post-mortem. Use when a core service is down or degraded. |
| [`ticket-ops`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/ticket-ops.html) | Daily operations — DB ticket triage, stale worktrees/branches, PR merge→close workflow, GitHub issue intake. Non-incident operational work. |
| [`update-dependencies`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/update-dependencies.html) | Update workspace packages, fix deprecation warnings, and handle security audits/Major version bumps across all directories. |
| [`mishap-tracker`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/mishap-tracker.html) | **End-of-skill routine** — batches accumulated `MISHAP_LOG` entries from runbook skills into a single aggregate `tickets.tickets` row. Reuses an open "Mishap collection" ticket if one exists. |

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

    subgraph "superpowers (Disziplin-Schicht)"
        BS[brainstorming]
        WP[writing-plans]
        EP[executing-plans]
        TDD[test-driven-development]
        VBC[verification-before-completion]
        RCR[requesting-code-review]
    end

    DP --> BS
    DP --> WP
    DE --> EP
    DE --> TDD
    DE --> VBC
    DE --> RCR

    subgraph "Runbooks (eigenständig)"
        IO[infra-ops §1-7]
    end

    subgraph "Support"
        MT[mishap-tracker]
        OM[operations-management]
        IR[incident-response]
        TO[ticket-ops]
    end

    DP --> IO
    DE --> IO
    DEE --> IO

    OM --> IR
    OM --> TO
    IR --> MT
    TO --> MT
    IO -.-> OM
```

**Legende:**
- Durchgezogene Pfeile: explizite Aufrufe / Delegation
- Gestrichelte Pfeile: typische Folge-Operation (z.B. Mishap-Report nach Runbook)

**Typische Workflows:**

| Start | Verlauf | Ergebnis |
|-------|---------|----------|
| Feature entwickeln | [`dev-flow-plan`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-plan.html) → [`dev-flow-execute`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-execute.html) → [`dev-flow-e2e`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-e2e.html) | Gemergetes + getestetes Feature |
| Wartung (Chore) | [`dev-flow-chore`](https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/dev-flow-chore.html) (inline) | Gemergte Wartung ohne Plan-Handoff |
| Cluster aufsetzen / Workspace deployen | `infra-ops` §1–2 | Produktions-Cluster + alle Services |
| DB-Migration / Backup | `infra-ops` §7 + `dev-flow-execute` (Schema-Change) | Gemergte Migration |
| Secret rotieren | `infra-ops` §6 | Rotierte Secrets |
| Keycloak / SSO | `infra-ops` §4 | Reconcilter Realm |
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
