# Proposal: observability-remediation

## Why

Der zentrale Logging-Stack (Loki/Promtail/Grafana) transportiert zwar echte
Log-Payloads, aber vier Konfigurationsfehler machen ihn faktisch unbrauchbar:
pino-Level kommen als Zahl statt Text an (Error-Rate-Panel matcht nie),
Lokis `detected_level` bleibt dauerhaft `unknown`, das Promtail-Brand-
Relabeling überschreibt `korczewski` immer mit `mentolder`, und der
otel-collector bekommt seit 25 Tagen keinen Traffic von der Factory-Pipeline.
Ein Live-Check ergab denselben Fehlertyp beim Alerting: Der
`alertmanager-pushover`-Secret ist leer, der Operator verwirft daraufhin die
`AlertmanagerConfig`-Ressourcen — kritische Alerts (Disk voll, CrashLoop, 5xx)
kommen aktuell nirgendwo an, obwohl Kubernetes "Reconciled: True" meldet.

Zusätzlich fehlen zwei Fähigkeiten komplett: ein Soll/Ist-Konzept für
Service-Gesundheit über Zeit (die bestehende `health.ts`-Probe ist nur
Point-in-Time, keine Historie) und jegliche Nachvollziehbarkeit der lokal
gerenderten opencode-Agentenläufe (Modellwahl, Effort, Tool-Nutzung), die der
Hauptentwickler braucht, um seine Settings zu justieren.

## What

Ein Feature-Branch mit fünf Partials:

1. **Logging-Pipeline-Fixes** — Promtail-Pipeline-Stage für Text-Level-Mapping
   (global, alle JSON-Log-Quellen), Brand-Relabel-Korrektur, Grafana-Dashboard-
   Anpassung, otel-collector-Traffic-Reparatur.
2. **Service-Health-Goal-States** — neue Tabellen `service_health_checks` /
   `service_health_goals`, periodischer CronJob-Trigger, Admin-UI-Historie mit
   Soll/Ist-Ampel.
3. **Agent-Tracing + Config-Standard** — opencode-Plugin erfasst volle
   Tool-Call-Sequenz pro Session und speist `ingest_traces`
   (codebase-memory-mcp); neue Referenzdatei dokumentiert die Bedeutung jedes
   Config-Feldes in `agent-models.jsonc`.
4. **Alertmanager-Secret-Fix** — dokumentierter Reseed-Prozess für die echten
   Pushover-Credentials (manueller Schritt, User liefert die Werte) plus
   Verify-Task gegen die Operator-Logs.
5. **Tests** (Pflicht-Partial) — BATS für Pipeline-Stage-Verhalten,
   Backend-Tests für Goal-Persistenz, Playwright-E2E für die Health-Goal-UI,
   Verify-Task für Alertmanager-Config-Akzeptanz.

Alle Root-Causes wurden vor der Planung live auf dem fleet-Cluster verifiziert
(siehe Design-Dokument für Details und Diagnose-Belege).

_Ticket: T002151_
