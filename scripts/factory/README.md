# Software Factory — Komponenten & Architektur

> **Status:** Phase 3 (Full Auto-Pilot) — live.
> Vorhaben-Ticket: T000413

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────┐
│ TIER 1: DISPATCHER (Phase 2 — live)                     │
│ Queue-Manager · Konflikt-Detektor · Scheduler           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ TIER 2: PIPELINE (Phase 1 — manuell)                    │
│ Scout → Design → Plan → Implement → Verify → Deploy     │
│ Dokumentiert in: pipeline-pattern.md                     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ TIER 3: AGENT POOL (Phase 1 — Workflow Tool)            │
│ Subagenten · Code-Review · Adversarial Panel            │
│ Dokumentiert in: review-*.prompt.md                      │
└─────────────────────────────────────────────────────────┘
```

## Komponenten-Verzeichnis

| Datei | Zweck | Status |
|-------|-------|--------|
| `README.md` | Diese Datei — Architektur & Quickstart | ✅ |
| `pipeline.js` | **Runnable** 6-Phasen Workflow Script (Scout→Deploy) | ✅ Phase 1 |
| `pipeline-pattern.md` | Referenz: 6-Phasen API-Doku (Vorläufer von pipeline.js) | ✅ |
| `templates/scout-template.md` | Scout-Phase Output-Format | ✅ |
| `templates/design-template.md` | Design-Phase Output-Format | ✅ |
| `templates/lessons-learned-template.md` | Post-Deploy-Retrospektive | ✅ |
| `review-bug-hunter.prompt.md` | Adversarial Review: Bug-Suche | ✅ |
| `review-security-auditor.prompt.md` | Adversarial Review: Security-Audit | ✅ |
| `review-pattern-enforcer.prompt.md` | Adversarial Review: Konventions-Prüfung | ✅ |
| `conflict-check.sh` | Konflikt-Detektor (Datei-Overlap), brand-aware | ✅ |
| `dispatcher.js` | Workflow-Dispatcher: Queue-Poll → Konflikt → Schedule → Launch | ✅ Phase 2 |
| `slots.sh` | Slot-Manager: pro-Brand Pool + globales Cap | ✅ Phase 2 |
| `queue.sh` | Queue-Manager: Backlog lesen, Priority+FIFO | ✅ Phase 2 |
| `schedule.sh` | Scheduler: Konflikt-gegatetes Slot-Scheduling | ✅ Phase 2 |
| `watchdog.sh` | Watchdog: 30-min Stale-Eskalation + Slot-Release | ✅ Phase 2 |
| `metrics.sh` | Durchsatz-Zusammenfassung für T000413 | ✅ Phase 2 |
| Canary-Deployment | Layer-4: automatisches Canary-Rollout | ✅ Phase 3 |
| Directory-Heuristic | Layer-4: verzeichnisbasierte Konflikt-Erkennung | ✅ Phase 3 |
| `wakeup.sh` | Headless Dispatcher-Wrapper (flock + git-crypt-unlock → `claude -p`) | ✅ Phase 3 |
| `factory.timer` / `factory.service` | systemd USER-Timer (re-arm-after-exit, Persistent) | ✅ Phase 3 |

## Quickstart (Phase 1 — Manuell)

### 1. Feature-Ticket erstellen

```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type feature --brand mentolder \
  --title "Kurztitel" --description "Beschreibung" --priority mittel)
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
```

### 2. Scout-Phase

Exploriere die Codebase mit dem Explore-Agent. Fülle `templates/scout-template.md` aus.
Setze `touched_files` am Ticket:

```bash
bash scripts/ticket.sh set-touched-files --id "$TICKET_EXT_ID" --files "file1,file2"
```

Safe trial run: pass `dry_run: true` in the pipeline args (or thread it from dispatcher/Taskfile) — Deploy reports the diff but does not merge/deploy.

### 3. Konflikt-Check

```bash
bash scripts/factory/conflict-check.sh "$TICKET_EXT_ID"
# Erwartet: [] (keine Konflikte) oder ["T000xxx"] (Konflikt)
```

### 4. Design-Phase (nur bei medium/complex)

Brainstorming → Spec → Adversarial Review.
Fülle `templates/design-template.md` aus.

### 5. Implementieren

Nutze das Workflow-Tool mit dem Muster aus `pipeline-pattern.md`.
Tasks parallelisieren mit `pipeline()` oder `parallel()`.

### 6. Verifizieren & Deployen

- `task test:all` muss grün sein
- PR → Squash-and-Merge
- Deploy-Task via `scripts/task-oracle.sh` ermitteln

## Phase 3 — Persistenter Auto-Pilot (Trigger / Service)

Der Dispatcher läuft **ohne offene Claude-Code-Session** als WSL-Host **systemd-USER-Timer**:

```bash
# Voraussetzung: ~/.config/factory/autopilot.env mit FACTORY_GITCRYPT_KEY + Claude-Creds.
task factory:autopilot:install     # symlinkt factory.timer/.service, enable --now
task factory:autopilot:status      # nächster Tick + letzter Journal-Tail
task factory:autopilot:uninstall   # stop + disable + entfernt die Units
```

Ablauf pro Tick: `factory.timer` (`OnUnitInactiveSec=10min`, re-armt **erst nach
Tick-Ende** → Single-Flight; `Persistent=true` → überlebt Reboot) → `factory.service`
(`RuntimeMaxSec=900` killt hängende Runs) → `wakeup.sh` (`cd` Repo · `flock
/tmp/factory-tick.lock` · git-crypt entsperren falls nötig · `exec claude -p` mit dem
**Workflow-Tool** + Permission-Allowlist + `dry_run`-Policy) → nestet `dispatcher.js`.

**Der Cron-Poll IST der Trigger.** `dispatcher.js` → `schedule.sh` pollt den Backlog
jeden Tick; es gibt **keinen** separaten Event-Consumer. Eine inerte
`AFTER INSERT … WHERE type='feature'` **`pg_notify`**-Funktion in `tickets-db.ts`
(`factory_feature_inserted`) ist nur Zukunfts-Plumbing und wird in Phase 3 **nicht
konsumiert** (die Datenebene ist one-shot `kubectl exec psql`; LISTEN bräuchte eine
gehaltene Verbindung — s. `lib.sh:31-35`, `dispatcher.js:15`).

**Bewusst verworfen** (Spec §2 Korrektur A1): **CronCreate** / **RemoteTrigger** /
**`/schedule`** als Dispatcher — diese laufen lokal/session-gebunden bzw. remote auf
claude.ai und haben **kein Repo-Checkout, keinen git-crypt-Key, kein fleet-Kubeconfig
und kein Workflow-Tool**. Der WSL-Host-Timer ist der einzige Locus mit allen vier.

## Verwandte Dokumente

- Spec: `docs/superpowers/specs/2026-06-01-software-factory-design.md`
- Plan: `docs/superpowers/plans/2026-06-05-software-factory-phase1.md`
- Usage Guide: `docs/superpowers/references/factory-usage.md`
- Vorhaben: T000413, Ticket: T000420

## D5 Proof: Observed Runtime Fixes
Verified that the fire-and-forget async IIFE wrappers in `pipeline.js` and `dispatcher.js` acted as no-ops for the harness, which has now been structurally fixed by wrapping the bodies in `async function main() { ... } await main();` to satisfy both static `node --check` syntax checks and execution return propagation. Tested dry-run flag routing and dual-brand schema liveness.
