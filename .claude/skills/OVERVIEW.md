# Skills Overview

12 core project-local skills (plus dev-flow pipeline) grouped by domain. Each skill has its own `SKILL.md` with full runbook details. Invoke any skill by its name.

> **Für Agenten:** Schnelle Routing-Karten (Intention → Weg → Tier → Guardrails) unter `docs/agent-guide/maps/` — `goals-map.md`, `tools-map.md`, `danger-map.md`. Generiert aus `docs/agent-guide/registry/`.

---

## Development Flow (sequential pipeline)

| Skill | When to use |
|---|---|
| `dev-flow-plan` | **Entry point** for feature/fix changes — runs brainstorming, creates spec + plan, commits to branch, then **stops**. Routes chores to `dev-flow-chore`. |
| `dev-flow-chore` | Maintenance with no behavior change (docs, dep bumps, config, CI) — executes and merges **inline**, no plan/execute handoff. |
| `dev-flow-execute` | After `dev-flow-plan` has pushed a staged plan — implements, verifies, opens PR, merges, deploys. |
| `dev-flow-iterate` | **Sub-routine of `dev-flow-execute`** (Schritt 4) + standalone dev-cluster loop — deploys a surface, browses with Playwright MCP, tails logs, applies small fixes. **Not** an alternative to execute. |
| `dev-flow-e2e` | After `dev-flow-execute` has merged and deployed — writes + runs Playwright E2E tests against live environment. |

---

## Feature Discovery (vorgelagert zur Pipeline)

| Skill | When to use |
|---|---|
| `feature-intake` | **Vor `dev-flow-plan`** — Feature-Ideen entdecken, brainstormen oder sammeln (z.B. Fragebogen an gekko), bevor geplant wird. Kein Teil der dev-flow-Pipeline; speist `dev-flow-plan`. |

---

## Schicht-Kontrakt: dev-flow orchestriert, superpowers liefert Disziplin

Die `dev-flow-*`-Skills sind **projektspezifische Orchestratoren**. Sie rufen die generischen
`superpowers:*`-Skills für die Disziplin-Schritte auf und ergänzen Projekt-Tooling
(`worktree-create.sh`, `ticket.sh`, `agent-lock.sh`, Deploy-Tasks).

**Regel:** Für Repo-Arbeit **immer über `dev-flow-*` einsteigen** — nie direkt in
`superpowers:brainstorming` / `writing-plans` / `executing-plans` / `finishing-a-development-branch`.
Der dev-flow-Skill ruft diese zur richtigen Zeit selbst auf.

| dev-flow-Schritt | ruft superpowers-Skill |
|---|---|
| `dev-flow-plan` Schritt 3 | `brainstorming` |
| `dev-flow-plan` Schritt 3.7 (Subagent) | `writing-plans` |
| `dev-flow-execute` Schritt 2 (Implementer) | `executing-plans` (in-context) + `test-driven-development` |
| `dev-flow-execute` bei Fehlern | `systematic-debugging` |
| `dev-flow-execute` Schritt 3 | `verification-before-completion` |
| `dev-flow-execute` Schritt 3.8 | `requesting-code-review` |

> **Worktrees:** `using-git-worktrees` (superpowers) ist im dev-flow-Pfad durch
> `scripts/worktree-create.sh` ersetzt (git-crypt-safe). Nicht beide mischen.

### Verifikations-Leiter (wer prüft was — kein doppeltes Gate)

Verifikation passiert bewusst auf zwei Ebenen mit **unterschiedlichem Zweck** — das ist kein Stacking:

1. **Implementer-Subagent:** `test-driven-development` (Rot-Grün) → stoppt erst bei grünen Tests. *Selbst-Check.*
2. **Eltern (execute):** `verification-before-completion` → **unabhängige** Re-Verifikation der Subagent-Behauptung (Evidence vor Assertion).
3. **Eltern (execute):** `requesting-code-review` → fremde Augen auf Korrektheit/Stil **vor** Merge.
4. **Eltern (execute):** CI-Fix-Loop → die Wahrheit der CI nach dem Push.

Stufe 2 wiederholt Stufe 1 *nicht* aus Misstrauen, sondern weil delegierte Selbstauskunft kein
unabhängiger Beweis ist. Stufen 3+4 prüfen andere Dimensionen (Review-Qualität, CI-Realität).

---

## Infrastructure & Networking

| Skill | When to use |
|---|---|
| `host-node-networking` | Host server provisioning (Hetzner, cloud-init, Rescue Mode resets), WireGuard mesh network topology ("netplan"), host UFW firewall ports, LiveKit WebRTC networking, and WSL OpenClaw local gateway setup. |
| `cluster-deployment` | Stand up a brand-new Kubernetes environment, deploy resources, diagnose cluster degraded state (gap analysis), or operate the dev.mentolder.de stack. |
| `fleet-ops` | Cross-cluster fan-out operations: `task feature:*`, schema changes, Keycloak sync, and the **push-based deploy model** (no GitOps reconciler) across both brands on the fleet cluster. |

---

## Secret & Auth Management

| Skill | When to use |
|---|---|
| `secret-rotation` | Rotate DB passwords, API keys, SealedSecrets keypair (post-reset), Claude Code tokens, or service credentials across both brands on the fleet cluster. |
| `keycloak-realm-sync` | Reconcile Keycloak realm JSON → push OIDC client changes, group mappings, mappers, SSO login fixes. |

---

## Service-Specific Operations

| Skill | When to use |
|---|---|
| `arena-brett-deploy` | Build, push, and deploy arena-server (korczewski brand on fleet only) or brett (both brands on the fleet cluster). Covers proto-drift copy step. |

---

## Knowledge & Database Operations

| Skill | When to use |
|---|---|
| `knowledge-management` | Manage knowledge base ingestion (PDF/EPUB books), classifier LLMs, general indexing (`prs`, `markdown`, `bugs`), web crawling, and vector space isolation rules. |
| `database-ops` | PostgreSQL schema migrations, default permission grants, automated backups audit, and safe restore verification. |

---

## Operations & Life-Cycle Management

| Skill | When to use |
|---|---|
| `operations-management` | Production incident response triage (scope, diagnose, rollback/fix), DB ticket management (triage, AI-fixes, routing), repository hygiene (pruning stale worktrees/branches), PR reviews, and mishap tracking. |
| `update-dependencies` | Update workspace packages, fix deprecation warnings, and handle security audits/Major version bumps across all directories. |

---

## Skill-Beziehungen & Abfolge

```mermaid
graph TD
    FI[feature-intake] -.->|vorgelagert| DP

    subgraph "Dev-Flow Pipeline (sequentiell)"
        DP[dev-flow-plan] -->|feature/fix| DE[dev-flow-execute]
        DP -->|chore| DC[dev-flow-chore]
        DE -->|Schritt 4 Sub-Routine| DI[dev-flow-iterate]
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
        CD[cluster-deployment]
        FO[fleet-ops]
        DO[database-ops]
        HN[host-node-networking]
        SR[secret-rotation]
        KR[keycloak-realm-sync]
        KM[knowledge-management]
        AD[arena-brett-deploy]
        UD[update-dependencies]
    end

    subgraph "Support"
        MT[mishap-tracker]
        OM[operations-management]
    end

    DP --> CD
    DP --> FO
    DE --> DO
    DE --> SR
    DE --> KR
    DE --> AD
    DI --> DO
    DI --> HN
    DEE --> FO
    DEE --> CD

    OM --> MT
    CD -.-> OM
    FO -.-> OM
    DO -.-> OM
    SR -.-> OM
    KR -.-> OM

    UD -.-> CD
    UD -.-> FO
```

**Legende:**
- Durchgezogene Pfeile: explizite Aufrufe / Delegation
- Gestrichelte Pfeile: typische Folge-Operation (z.B. Mishap-Report nach Runbook)

**Typische Workflows:**

| Start | Verlauf | Ergebnis |
|-------|---------|----------|
| Feature entwickeln | `dev-flow-plan` → `dev-flow-execute` → `dev-flow-e2e` | Gemergetes + getestetes Feature |
| Wartung (Chore) | `dev-flow-chore` (inline) | Gemergte Wartung ohne Plan-Handoff |
| Cluster aufsetzen | `cluster-deployment` → `fleet-ops` → `secret-rotation` | Produktions-Cluster |
| DB-Migration | `database-ops` → `dev-flow-execute` (Schema-Change) | Gemergte Migration |
| Secret rotieren | `secret-rotation` → `fleet-ops` (Deploy) | Rotierte Secrets |
| Abhängigkeiten updaten | `update-dependencies` → `cluster-deployment` (Test-Deploy) | Aktualisierte Packages |
