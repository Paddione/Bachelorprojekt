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

### Behebung von API-Guthaben-Fehlern (HTTP 402 / Insufficient Balance)

Falls der Autopilot mit dem Fehler `API Error: 402 Insufficient Balance` abbricht, sind die API-Credits des konfigurierten Keys aufgebraucht.
1. **API-Key & Modell prüfen:** Öffne die Konfiguration unter `~/.config/factory/autopilot.env` und prüfe die gesetzten Werte für `ANTHROPIC_AUTH_TOKEN` und `ANTHROPIC_MODEL`.
2. **Guthaben aufladen:** Lade das Guthaben des betroffenen Kontos beim jeweiligen Provider (z.B. Anthropic Console oder DeepSeek Plattform) wieder auf.
3. **Provider/Key wechseln:** Trage alternativ einen anderen, aktiven API-Key mit ausreichendem Guthaben in `ANTHROPIC_AUTH_TOKEN` ein.
4. **Modell wechseln:** Falls nötig, passe das gewünschte Modell über `ANTHROPIC_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL` oder andere Modell-Variablen in der `.env`-Datei an.

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

## Eval / Private Benchmark

Ein deterministischer Golden-Fixture-Scorer misst das aktuelle Agenten-Setup gegen
gemergte Factory-Tickets. Fixtures liegen unter `tests/factory-eval/fixtures/<TICKET>/`
und enthalten:

- `ticket.json` — Ticket-Titel, Typ, Brand (keine Description, die wird kuratiert).
- `expected.json` — Erwartete Dateien (`files`), `forbidden`, `tests`,
  `min_recall`/`min_precision`.
- `meta.json` (optional, aber für Replay nötig) — `base_commit`, `pr_number`,
  `generated_at`, `source: "eval-gen"`.

### Workflow

1. **Fixture vorschlagen** (halbauotmatisch):
   ```bash
   task factory:eval:gen -- <TICKET_EXT_ID>
   ```
   Liest Ticket + verlinkten PR, baut `expected.json.files` aus `gh pr diff --name-only`,
   setzt `meta.base_commit` auf den PR-Merge-Base. Der Mensch kuratiert danach
   `min_recall`/`min_precision`/`forbidden`/`tests`.

2. **Live-Diff scoren** (Default):
   ```bash
   task factory:eval
   ```
   Bewertet `git diff --name-only origin/main...HEAD` gegen alle Fixtures.
   Funktioniert offline und in CI.

3. **Replay** (lokal, GPU nötig):
   ```bash
   task factory:eval:replay -- --fixture <TICKET_EXT_ID> --dry-run
   task factory:eval:replay -- --fixture <TICKET_EXT_ID>
   ```
   Erzeugt einen ephemeren Worktree auf `meta.base_commit`, lässt das aktuelle
   Agenten-Setup das Ticket implementieren, und bewertet den entstehenden Diff.

### Wann Replay Pflicht ist

Änderungen am Agenten-Setup — `.opencode/agent-models.jsonc`,
`scripts/factory/review-*.prompt.md`, `scripts/factory/provider-router.js`,
`AGENTS.md` — müssen **vor dem Merge** lokal mit `task factory:eval:replay`
gemessen und der Scorecard dokumentiert werden. CI gibt nur einen
`::warning::`-Hinweis aus; der Replay selbst läuft nicht im CI-Runner
(kenine GPU/LM-Studio).

### Bekannte Lücken

- Die `tests`-Kommandos in `expected.json` werden noch **nicht ausgeführt**;
  `test_results` ist im Scorer noch hartcodiert `[true]`.
- Replay benötigt einen lokalen `claude`-Binary mit gültigen Credentials.

### Overfitting-Caveat

Fixtures sind ein grober File-Set-Proxy. Ein hoher Score ersetzt **kein**
Trace-Reading — nachträgliche Code-Reviews der tatsächlichen Änderungen bleiben
Pflicht.

## OpenTelemetry / Observability

Jeder Tick exportiert OTLP-Telemetrie an den on-prem OTel-Collector
(`otel.<domain>`, monitoring-ns, in Prometheus persistiert) und wird unter
`/admin/factory-observability` sichtbar. Zwei Ebenen:

1. **Native Claude-Code-Telemetrie** (Token/Kosten/Commits/PRs) via `OTEL_*`-Env.
2. **Factory-eigene Spans/Metriken** (Phasen-Übergänge, Tick-Tiefe) via
   `otel-emit.cjs` (in `pipeline.js`/`dispatcher.js` verdrahtet) und `otel-emit.sh`
   (in `wakeup.sh`/`dispatcher.js`-Bash). Beide sind **fire-and-forget** und
   **no-op**, wenn `OTEL_EXPORTER_OTLP_ENDPOINT` ungesetzt oder
   `OTEL_SDK_DISABLED=true` ist — sie scheitern nie den Tick.

**Host-Setup (WSL):**

```bash
cp scripts/factory/autopilot.env.example ~/.config/factory/autopilot.env
# Dann in ~/.config/factory/autopilot.env je aktiver Brand setzen:
#   OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.<brand-domain>"
#   FACTORY_OTLP_TOKEN="<FACTORY_OTLP_TOKEN aus environments/.secrets/<brand>.yaml>"
```

- `OTEL_METRIC_EXPORT_INTERVAL=10000` (10 s) ist **Pflicht**: der Default 60000 ms
  flusht einen kurzen `claude -p`-Tick nie, sodass keine Metriken den Collector
  erreichen.
- Bearer-Auth erzwingt der Collector selbst (`bearertokenauth`-Extension); der Token
  liegt als SealedSecret `otel-collector-auth` im monitoring-ns.
- Dashboard: `/admin/factory-observability` (isAdmin-gated).

## PreCompact Context-Pruning (Opt-in)

`scripts/hooks/precompact-prune.sh` ist ein Claude Code PreCompact-Hook, der obsolete
`tool_result`-Blöcke vor `/compact` kürzt, um Context-Bloat zu reduzieren.

**Aktivierung (Opt-in, per Maschine):** In `.claude/settings.json` (gitignored) ergänzen:
```json
{ "hooks": { "PreCompact": [{ "command": "bash scripts/hooks/precompact-prune.sh" }] } }
```
- `PRUNE_MIN_AGE_TURNS` (Env, Default 3): Mindestalter in Turns vor dem Prunen.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Optional — emittiert `factory.context.pruned_chars`-Metrik.
- Fail-open: bei jedem Zweifel bleibt das Original unangetastet.

## Cross-Tool Usage-Report (tokscale-Delta)

`scripts/factory/usage-report.sh` ist ein read-only Aggregator der lokalen Claude-Code- und
OpenClaw-Usage-Logs für einen Cross-Tool-CLI-Token/Kosten-Überblick.

```
task factory:usage                     # Text-Ansicht
task factory:usage -- --json           # Maschinenlesbar
task factory:usage -- --otel           # Optional: Gauges an OTLP-Collector
```
- Baut NICHT auf `factory_run_budget` auf (separater CLI-Blick).
- `CLAUDE_USAGE_DIR` / `OPENCLAWN_USAGE_DIR` (Env) überschreiben die Log-Pfade.
- `OTEL_EXPORTER_OTLP_ENDPOINT` muss gesetzt sein für `--otel`.

## Hybrid-Scout + Drift-Ratchet

Der deterministische Scout (`scout.sh`) besitzt einen optionalen LLM-Fallback via
DeepSeek für den Fall, dass die grep/find-Discovery zu wenige Dateien findet.

**Hybrid-Scout (Baustein A):**
- `scout.sh` ruft `scout-llm-fallback.sh` auf, wenn die deterministische Discovery
  `< SCOUT_LLM_MIN_FILES` (Default: 2) Dateien findet **und** ein DeepSeek-Provider
  via `route-provider.sh` auflösbar ist.
- Der LLM-Fallback ist **fail-soft**: bei fehlendem Provider, Timeout oder ungültiger
  Antwort bleibt das deterministische Ergebnis unberührt.
- Opt-out: `SCOUT_LLM_ENABLED=false`.
- `scout-llm-fallback.sh` ist ein eigenes Skript (kein Inline-Code in `scout.sh`),
  um `scout.sh` unter dem Zeilenlimit zu halten.

**Drift-Ratchet (Baustein B):**
- Nach jedem Merge prüft `scout-drift.sh` die Scout-Vorhersage (`touched_files` aus
  dem Ticket) gegen den echten `git diff --name-only` des PR und berechnet eine
  Jaccard-Distanz (0 = perfekte Vorhersage, 1 = völlig daneben).
- Der Score wird in `tickets.tickets.scout_drift` persistiert (via `ticket.sh
  set-scout-drift`).
- Bei Überschreitung von `SCOUT_DRIFT_THRESHOLD` (Default: 0.9) gibt es einen
  **Warn-Kommentar** am Ticket — **kein hartes Gate, kein Status-Wechsel.**
- `scout-drift.cjs` ist ein reiner CommonJS-Helper (Jaccard-Distanz + Noise-Filter),
  testbar via `require()` aus Bats und `scout-drift.sh`.

**Datenmodell:**
- `tickets.tickets`: neue Spalten `scout_drift` (NUMERIC, nullable) und
  `scout_drift_at` (TIMESTAMPTZ).
- Migration `scripts/migrations/2026-06-17-scout-drift.sql` ist idempotent
  (`ADD COLUMN IF NOT EXISTS`) und muss auf beide Brand-DBs angewandt werden
  (`workspace` + `workspace-korczewski`).

**Env-Vars (alle optional, fail-soft):**

| Variable | Default | Zweck |
|---|---|---|
| `SCOUT_LLM_ENABLED` | `true` | LLM-Fallback aktivieren/abschalten |
| `SCOUT_LLM_MIN_FILES` | `2` | Schwelle für LLM-Fallback |
| `SCOUT_DRIFT_THRESHOLD` | `0.9` | Warn-Schwelle für Drift-Score |

**Referenzen:**
- Spec: `docs/superpowers/specs/2026-06-17-t000901-design.md`
- Plan: `docs/superpowers/plans/2026-06-17-t000901.md`

## Verwandte Dokumente

- Spec: `docs/superpowers/specs/2026-06-01-software-factory-design.md`
- Plan: `docs/superpowers/plans/2026-06-05-software-factory-phase1.md`
- Usage Guide: `docs/superpowers/references/factory-usage.md`
- Vorhaben: T000413, Ticket: T000420

## D5 Proof: Observed Runtime Fixes
Verified that the fire-and-forget async IIFE wrappers in `pipeline.js` and `dispatcher.js` acted as no-ops for the harness, which has now been structurally fixed by wrapping the bodies in `async function main() { ... } await main();` to satisfy both static `node --check` syntax checks and execution return propagation. Tested dry-run flag routing and dual-brand schema liveness.
