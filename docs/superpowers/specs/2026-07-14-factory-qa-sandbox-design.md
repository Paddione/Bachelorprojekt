---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-14
---

# factory-qa-sandbox — Design-Spec (Epic)

## Kontext & Problem

Die Software Factory (Scout → Design → Plan → Implement → Verify → Deploy, `scripts/factory/pipeline.js`) hat heute:

- **Kein echtes Sandboxing.** Isolation besteht nur aus (1) Git-Worktrees (`.worktrees/<slug>`, reine Dateisystem-Trennung zwischen Tickets), (2) kooperativen Locks (`agent-lock.sh`, `conflict-check.sh`) und (3) Claude-Code-Tool-Allowlisting (`wakeup.sh:129` `--allowedTools … --permission-mode acceptEdits`). Der Implement-Agent läuft als normaler Host-Prozess (systemd-User-Timer auf WSL) mit vollem User-, Netzwerk- und Dateisystem-Zugriff.
- **Keine Ausführungs-Verifikation.** Die Verify-Phase (`pipeline.js:460-575`) ist ein adversariales Review-Panel (bug/security/pattern/perf/agents-md-Lenses + Coordinator), das ausschließlich den **Diff liest**. Kein Agent führt den neuen Code je aus; `dev-flow-e2e` existiert nur als manueller Post-Merge-Skill.

## Ziel

Zweiteiliges Epic:

1. **Change 1 — `factory-sandbox-runner`:** Container-basierte Sandbox für Factory-Agenten. Der **komplette Implement-Agent** (nicht nur Test-Kommandos) läuft in einem Docker-Container mit gemountetem Worktree; Fallback auf einen k8s-Job (k3d/fleet), wenn Docker nicht verfügbar ist. Netzwerk default-deny mit expliziter Allowlist.
2. **Change 2 — `factory-qa-lens`:** Neue `qa`-Lens in der Verify-Phase (Tier **nur `full`**), die die Implementierung tatsächlich ausführt: `task test:changed` im (gesandboxten) Worktree, **pre-merge-Deploy des Feature-Branches nach `workspace-staging`** (serialisiert über einen Staging-Lock) mit Playwright-Smoke gegen Staging (testet den *neuen* Code) plus Regressions-Smoke gegen Live-Prod als Baseline. Findings fließen ins bestehende `REVIEW_SCHEMA` → Coordinator → Blocking-Logik.

## Entscheidungen (Brainstorming 2026-07-14, Lavish-Board)

| Frage | Entscheidung | Begründung |
|---|---|---|
| Sandbox-Scope | **Kompletter Implement-Agent** wird gesandboxt | Größter Risiko-Reduktionshebel: generierter Code + Agent-Toolcalls laufen nicht mehr nackt auf dem Host |
| Sandbox-Technologie | **Docker in WSL**, wenn verfügbar; **Fallback k8s-Job** | Docker auf WSL2 zuverlässig, reproduzierbares Image; k8s-Job als Degradationspfad ohne Docker-Daemon |
| Netzwerk | **default-deny + Allowlist** (Anthropic-API, npm-Registry, Staging-/Prod-Endpunkte, GitHub) | „allow what's necessary" — Playwright/Agent brauchen definierte Ziele, sonst nichts |
| Playwright-Ziel | **Staging + Live-Prod** | Staging bekommt pre-merge den Feature-Branch deployt (echter Test des neuen Codes); Prod nur Regressions-Baseline |
| Staging-Modus | **Pre-merge-Deploy mit Staging-Lock** | `workspace-staging` wird Exklusiv-Ressource; Tickets serialisieren sich am Lock (agent-lock.sh-Muster) |
| Tier-Zuordnung qa-Lens | **Nur `full`** | Teuerste Lens nur für riskante Diffs; `task test:changed` kann tier-unabhängig günstig bleiben |
| Schnitt | **Epic, 2 Changes** | sandbox-runner ist eigenständig nutzbar und testbar; qa-Lens baut darauf auf |

## Architektur-Skizze

### Change 1: factory-sandbox-runner

- Neues Skript `scripts/factory/sandbox-run.sh` (Name final im Plan): kapselt „führe Kommando X im Worktree Y isoliert aus".
  - **Docker-Pfad:** dediziertes Image (Node 22 + task + Playwright-Deps + repo-Toolchain), Worktree als Bind-Mount, Repo-Hauptcheckout read-only oder gar nicht gemountet, `--network`-Setup mit Egress-Allowlist (z. B. dockereigenes Netz + iptables/Proxy oder `--network none` + explizite Proxy-Env).
  - **k8s-Job-Fallback:** gleiche Semantik als Job-Manifest (k3d-Dev-Cluster), Worktree via Volume; wird nur gewählt, wenn `docker info` fehlschlägt.
  - Erkennung/Auswahl automatisch, überschreibbar per `FACTORY_SANDBOX=docker|k8s|off`.
- Integration: `pipeline.js` Implement-Phase (`pipeline.js:411-419` und `build-loop.cjs`) ruft Implementierungs-/Verify-Kommandos durch den Runner statt direkt.
- `off`-Escape-Hatch für Debugging + schrittweise Migration; Telemetrie via bestehender `phaseEvent`-Mechanik.

### Change 2: factory-qa-lens

- Neue Lens `qa` im `ALL_LENSES`-Routing (`pipeline.js:480-490`), nur Tier `full`.
- Ablauf der Lens:
  1. `task test:changed` im Worktree via sandbox-runner.
  2. Staging-Lock claimen (`agent-lock.sh claim staging …`), Feature-Branch nach `workspace-staging` deployen (bestehende `ENV=staging`-Overlays; LiveKit dort deaktiviert — bekannter Gotcha).
  3. Playwright-Smoke der betroffenen Routen gegen Staging (Konventionen aus `dev-flow-e2e`), danach kurzer Prod-Health-Smoke (read-only).
  4. Staging-Lock freigeben (finally), Findings als `REVIEW_SCHEMA`-JSON zurück → Coordinator/Blocking unverändert.
- SSOT-Update: `openspec/specs/software-factory.md` (Verify-Panel-Requirement um qa-Lens + Staging-Lock erweitern).

## Risiken & Gotchas

- **WSL2/Docker:** Docker Desktop muss laufen; Runner braucht sauberen „nicht verfügbar"-Pfad (→ k8s-Fallback, sonst `off` + Warnung).
- **git-crypt im Container:** Worktree-Mount enthält entschlüsselte Secrets-Pfade nicht mounten; `environments/.secrets/` explizit vom Mount ausschließen.
- **Staging-Serialisierung:** Lock-Staus bei vielen full-Tier-Tickets → Timeout/Skip-Semantik (qa-Lens degradiert zu test:changed-only mit Finding `severity: medium`).
- **Netz-Allowlist:** Anthropic-API ist Pflicht für den Agenten im Container — sonst kann nur der Test-Runner (nicht der Agent) im Container laufen; der Plan muss klären, ob der Agent-Prozess selbst oder nur seine Bash-Ausführung containerisiert wird (Empfehlung: Stufe 1 = Bash/Test-Ausführung im Container via sandbox-run.sh, Stufe 2 = kompletter Agent).
- **S1-Ratchet:** `pipeline.js` ist groß und vermutlich gebaselined — Änderungen dort möglichst zeilenneutral bzw. Logik in neue Module (`scripts/factory/qa-lens.mjs`, `sandbox-run.sh`) auslagern.

## Akzeptanz (Epic-Ebene)

- Implement-Phase eines Factory-Tickets führt keine ungesandboxten Bash-Kommandos mehr aus, wenn `FACTORY_SANDBOX!=off`.
- Ein full-Tier-Ticket durchläuft die qa-Lens: test:changed + Staging-Deploy + Playwright-Smoke; rote qa-Findings (high/critical) blockieren den Merge.
- Staging-Lock verhindert nachweislich parallele Staging-Deploys (BATS-Test).
- Fallback-Kette Docker → k8s-Job → off(+Warnung) ist getestet.
