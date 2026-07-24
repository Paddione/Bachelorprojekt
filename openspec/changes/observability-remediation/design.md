---
ticket_id: T002151
plan_ref: openspec/changes/observability-remediation/tasks.md
status: active
date: 2026-07-24
---

# Design: observability-remediation

_Ticket: T002151_

## Goals

- Zentrale Logs (Loki/Grafana) zeigen echte, filterbare `level`- und `brand`-Labels statt kaputter Zahl-/Overwrite-Werte.
- Kritische Alerts (Disk voll, CrashLoop, 5xx) erreichen tatsächlich einen Menschen (Pushover/E-Mail), nicht nur den `null`-Receiver.
- Service-Gesundheit hat eine Historie und ein explizites Soll (nicht nur einen Point-in-Time-Snapshot).
- Lokal gerenderte opencode-Agentenläufe sind im Wissensgraphen nachvollziehbar, um Modell-/Effort-Settings datengestützt zu justieren.

## Non-Goals

- Kein volles SLO/Error-Budget-System (Option C wurde im Brainstorming bewusst verworfen — zu viel Aufwand für den aktuellen Bedarf).
- Kein Tracing von Claude-Code-Subagenten-Dispatches (nur opencode-Lokalmodelle, siehe Brainstorming-Entscheidung).
- Kein automatisierter Pushover-Credential-Bezug — die echten Werte liefert der Nutzer manuell, kein Secret-Scanning/Generierung.
- `health-goals.md` (internes SDLC-Qualitäts-Dashboard, T002148) wird nicht angefasst — bewusste Abgrenzung wegen Namenskollision.

## Diagnose-Grundlage (bereits live verifiziert, 2026-07-24)

Vor der Planung wurden alle vier Logging-Bugs sowie der Alertmanager-Secret-Bug live auf dem
fleet-Cluster reproduziert (nicht nur im Code vermutet):

1. Promtail-Pipeline-Stage liest pinos numerisches `level` (30/40/50) wörtlich als Label ein.
2. Lokis `detected_level` ist deshalb bei jeder Zeile `"unknown"`.
3. Zwei `relabel_configs`-Regeln für `brand`: die zweite matcht unconditional `regex: .*` und überschreibt Regel 1 immer mit `mentolder` — verifiziert an `website-korczewski/website`-Logs, die live `brand: mentolder` tragen.
4. `monitoring/otel-collector` hat seit Pod-Start (25 Tage) exakt 9 Boot-Log-Zeilen, nie Nutzlast.
5. `alertmanager-pushover`-Secret hat 0-Byte-Werte für `PUSHOVER_USER`/`PUSHOVER_TOKEN`; der prometheus-operator verwirft beide `AlertmanagerConfig`-CRs mit `mandatory field userKey is empty` — der `Alertmanager`-Status meldet trotzdem `Reconciled: True`/`Available: True`.

## Architektur pro Partial

### Partial 1 — Logging-Pipeline-Fixes

**Komponenten:** `k3d/monitoring/promtail-rendered.yaml` (pipeline_stages + relabel_configs), `k3d/monitoring/grafana-dashboards/grafana-dashboard-log-explorer.yaml`, `scripts/factory/otel-emit.cjs`.

**Decision — globaler Fix statt website-only:** Der Level-Mapping-Fix wird auf Pipeline-Stage-Ebene eingebaut (nicht pro Service), damit er automatisch für jede pino-JSON-Quelle wirkt. Trade-off: Falls ein Service jemals ein abweichendes Level-Schema nutzt, würde die globale Stage falsch mappen — aktuell nutzt aber ausschließlich die Website pino, andere Services (Keycloak, Traefik) haben eigene, bereits Text-basierte Log-Formate laut `centralized-logging.md`, die von einer numeric→text-Stage unberührt bleiben (kein numerisches `level`-Feld vorhanden → Stage greift nicht).

**Decision — Brand-Relabel-Reihenfolge:** Statt die zweite Regel zu löschen, wird sie so umgebaut, dass sie nur greift, wenn die erste NICHT gematcht hat (`action: replace` mit einem Regex, der den mentolder-Case explizit von "nicht korczewski" ableitet, oder Promtail's `action: keep`/Reihenfolge-Semantik über einen expliziten "default"-Fallback nach den markenspezifischen Regeln). Der Plan-Subagent für dieses Partial verifiziert die exakte Promtail-Relabel-Semantik gegen die Live-Config, bevor er die Korrektur schreibt.

**otel-collector:** Root Cause noch nicht diagnostiziert (nur "kommt nichts an" festgestellt) — das Partial beginnt mit einer Diagnose (`otel-emit.cjs`-Aufrufstelle in der Factory-Pipeline finden: wird es überhaupt aufgerufen? Falscher Endpoint? Netzwerk-Policy blockiert `monitoring`-Namespace?), dann Fix.

### Partial 2 — Service-Health-Goal-States

**Komponenten:** neue Migration (`website/src/db/migrations/<timestamp>_create_service_health.sql`), neuer CronJob (`k3d/service-health-check-cronjob.yaml`), neue/erweiterte API-Route(n) unter `website/src/pages/api/admin/ops/`, Admin-UI-Erweiterung (Svelte-Komponente im Platform/Ops-Bereich).

**Decision — CronJob statt In-Process-Scheduler oder Prometheus-Scrape:** CronJob wurde im Brainstorming explizit gewählt (unabhängig vom Website-Pod-Lifecycle, kein Doppel-Check bei mehreren Replicas). Trade-off: zusätzliches K8s-Manifest + CRON_SECRET-Pattern (bereits etabliert durch `error-log-retention-cronjob.yaml` — kein neues Muster, geringes Risiko).

**Decision — Goal-Modell B (Soll/Ist mit Schwellwerten):** Kein volles SLO-System (Non-Goal). `service_health_goals` hält einfache Schwellwerte (`max_errors_per_day`, `latency_threshold_ms`) pro `asset_id`; eine Auswertungsfunktion vergleicht Tages-Checks gegen diese Schwellen und liefert `met`/`unmet`.

**Datenfluss:** CronJob → authentifizierte Trigger-Route → `checkUrl`-Logik (wiederverwendet aus `health.ts`) → Insert `service_health_checks` → Admin-UI liest `GET /api/admin/ops/health-goals` → zeigt 7-Tage-Trend.

### Partial 3 — Agent-Tracing + Config-Standard

**Komponenten:** neues opencode-Plugin (`.opencode/plugins/agent-tracer.ts`, repo-getrackt und via `scripts/opencode-sync-agents.sh`-Muster nach `~/.config/opencode/plugins/` synchronisiert — Präzedenzfall: `~/.config/opencode/plugins/loop-guard.ts` nutzt bereits `tool.execute.before` + `session.idle`/`session.deleted`-Hooks aus `@opencode-ai/plugin`), neue Referenzdatei `.claude/skills/references/agent-config-standard.md`.

**Decision — Hook-Punkt:** `tool.execute.before` (akkumuliert Tool-Call-Sequenz pro Session) + `session.idle`/`session.deleted` (Flush des akkumulierten Trace via `ingest_traces`). Dieses Muster ist im Repo bereits durch `loop-guard.ts` bewährt — kein neuer, unverifizierter Hook-Mechanismus.

**Decision — Sink ist `ingest_traces`, nicht Grafana/Loki:** Nutzer-Entscheidung im Brainstorming — Traces sollen über den Wissensgraphen (`query_graph`/`trace_path`) abfragbar sein, nicht als weiteres Grafana-Dashboard.

**Decision — Detailgrad "Voll":** Tool-Call-Sequenz wird vollständig miterfasst (nicht nur Modell/Dauer), plus der begleitende Config-Standard. Trade-off: höherer Instrumentierungsaufwand, aber explizit vom Nutzer gewünscht ("klarer Standard, kein Rätselraten").

**Risiko:** Der Plugin-Ordner liegt außerhalb des Repos (`~/.config/opencode/`) — Tests können den synchronisierten Zielpfad nicht direkt in CI ausführen (kein opencode-Runtime in GitHub Actions). Die Tests (Partial 5) prüfen daher die Repo-Quelle (`​.opencode/plugins/agent-tracer.ts`) auf Structural/Unit-Ebene (z.B. Mock des `@opencode-ai/plugin`-Interfaces), nicht den Live-Sync.

### Partial 4 — Alertmanager-Secret-Fix

**Komponenten:** `environments/.secrets/<env>.yaml` (git-crypt), `environments/sealed-secrets/<env>.yaml`, kein Code-Diff im engeren Sinn.

**Decision — Bündelung als Plan-Partial statt Ad-hoc-Fix:** Der Nutzer hat sich explizit dafür entschieden, diesen Fix als dokumentiertes Partial im selben Branch zu führen (nicht sofort außerhalb des Plans zu beheben), damit der Prozess (Secret befüllen → `task env:seal` → Verify) nachvollziehbar bleibt. Die echten Pushover-Credentials sind ein manueller Nutzer-Input — kein Agent kann diesen Schritt automatisiert abschließen.

### Partial 5 — Tests (Pflicht)

- BATS-Erweiterung `tests/spec/centralized-logging.bats`: Promtail-Pipeline-Stage-Konfiguration (Level-Mapping, Brand-Relabel-Reihenfolge) strukturell prüfen (Rendered-YAML-Assertion, kein Live-Cluster-Test in CI).
- Backend-Test (Vitest) für Goal-Auswertungsfunktion (Partial 2).
- Playwright-E2E für die neue Health-Goal-UI (Nutzer-Entscheidung).
- Verify-Task (Partial 4): dokumentierter manueller Check der Operator-Logs nach Secret-Reseed (kein automatisierbarer CI-Test, da echte Credentials nötig).

## Testing-Strategie (Gesamt)

Jedes Partial folgt RED→GREEN: ein fehlschlagender Test vor dem Fix/Feature, dann die Implementierung.
CI-Gates bleiben unverändert (`task test:changed`, `task freshness:regenerate`, `task freshness:check`).
Partial 4 ist die einzige Ausnahme mit einem manuell auszuführenden Verify-Schritt (Live-Cluster-Zustand, nicht CI-fähig ohne echte Secrets).

## Risiken

- Otel-collector-Root-Cause ist noch nicht diagnostiziert (nur Symptom bekannt) — Partial 1 beginnt mit Diagnose, Aufwand kann variieren.
- Promtail-Relabel-Semantik (Rule-Reihenfolge/Fallback) muss der Plan-Subagent gegen die Live-Config verifizieren, bevor er die exakte Korrektur schreibt — im Design bewusst als "Ansatz", nicht als fertige YAML-Diff, belassen.
- Agent-Tracer-Plugin liegt außerhalb des Repos — Sync-Schritt ist manuell/außerhalb CI, Tests decken nur die Repo-Quelle ab.
