---
ticket_id: T900688
plan_ref: .agents/plans/langfuse-agent-tracing/tasks.md
status: active
date: 2026-09-27
---

# langfuse-agent-tracing — Design

_Ticket: T900688 · Brainstorming 2026-09-27_

## Ziel

Jede Primär- und Subagent-Session der im Repo genutzten Agent-Harnesses landet als Trace in einem
self-hosted Langfuse auf devmesh. Traces enthalten volle Prompts und Outputs, Secrets werden vor
der Persistierung maskiert.

## Entscheidungen

| # | Entscheidung | Grund |
|---|---|---|
| D1 | Langfuse läuft auf **devmesh** (ADR-008), Namespace `workspace`, als Kustomize-Component `dev-local/components/langfuse`, eingehängt in `dev-local/core`. | Agent-Traces sind Entwicklungsdaten. devmesh hat freie Kapazität (3 × 16 GB, 13–58 % belegt, gemessen 2026-09-27 mit `kubectl --context devmesh top nodes`). |
| D2 | **Schlanke Manifeste nach dem offiziellen `docker-compose.yml`** statt Helm-Chart v2. Images: `langfuse/langfuse:4.46.0`, `langfuse/langfuse-worker:4.46.0`, `clickhouse/clickhouse-server:25.12`, `valkey/valkey:8`, `cgr.dev/chainguard/minio`. Postgres = bestehende `shared-db` mit eigener DB `langfuse`. | Chart v2 verlangt ClickHouse-Operator + cert-manager-CRDs vor dem Install. Das Repo rendert devmesh als Plain-Kustomize (`scripts/devmesh/render-stack.sh`); ein Operator wäre neue Infrastruktur für einen Single-Node-Betrieb. |
| D3 | **Offizielle Integrationen direkt** je Harness: Claude Code (`langfuse-observability`-Plugin v1.2.0), OpenCode 2 (`@langfuse/opencode-observability-plugin@0.5.1`), Pi (`@langfuse/pi-observability-plugin@0.1.2`), Codex (`tracing@codex-observability-plugin` v0.4.0). | Liefern Generations, Tokens, Tool-Calls und Subagent-Hierarchie (`agent`-Observations) ohne eigenen Parser. |
| D4 | **Zentrales Masking über einen OTel-Collector** (`langfuse-otel-redact`) vor dem Langfuse-OTLP-Ingest. Ingress routet `/api/public/otel` auf den Collector, alles andere direkt auf `langfuse-web`. Der Collector ersetzt Secret-Muster in allen Span-Attributen und exportiert per OTLP/HTTP an `langfuse-web`. | Alle vier Integrationen nutzen Langfuse-SDK v4/v5, die per OTLP an `${baseUrl}/api/public/otel` senden. Server-Side-Ingestion-Masking ist Enterprise-only. Client-seitiges Masking müsste in vier fremden Plugins einzeln gepatcht werden. |
| D5 | **Headless Initialization**: Org, Projekt `agent-tracing`, API-Keys und Admin-User kommen aus `LANGFUSE_INIT_*`-Env (SealedSecret). `AUTH_DISABLE_SIGNUP=true`. | Keine manuelle UI-Einrichtung, Keys reproduzierbar aus dem Secret. |
| D6 | **Client-Credentials** zieht `scripts/langfuse/client-env.sh` aus dem devmesh-Secret nach `~/.config/langfuse/agent-tracing.env` (Modus 0600). `scripts/langfuse/setup-harnesses.sh` verdrahtet alle vier Harnesses idempotent und schreibt je Harness die Credential-Datei ihres Plugins (0600). Keine Keys im Repo. | `.claude/settings.json` und `.opencode/opencode.jsonc` sind eingecheckt. |
| D7 | Der **Langfuse-Skill** wird repo-weit über `skills-lock.json` (`npx skills add langfuse/skills --skill langfuse`) nach `.agents/skills/langfuse` installiert. | `.agents/skills` wird von allen Harnesses gelesen. Die nutzerweite Installation unter `~/.claude/skills/langfuse` deckt nur Claude Code ab. |

## Masking-Muster (D4)

Ersetzt durch `[REDACTED:<typ>]`, angewendet auf alle Span-Attribute und Resource-Attribute:

| Typ | Regex |
|---|---|
| langfuse | `(pk\|sk)-lf-[A-Za-z0-9-]{8,}` |
| anthropic-openai | `sk-(ant-)?[A-Za-z0-9_-]{20,}` |
| github | `(ghp\|gho\|ghu\|ghs\|ghr)_[A-Za-z0-9]{30,}` und `github_pat_[A-Za-z0-9_]{40,}` |
| gitlab | `glpat-[A-Za-z0-9_-]{20,}` |
| aws | `AKIA[0-9A-Z]{16}` |
| private-key | `-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----` |
| bearer | `(?i)bearer\s+[A-Za-z0-9._~+/=-]{16,}` |
| kv-secret | `(?i)(password\|passwd\|secret\|token\|api[_-]?key)(["']?\s*[:=]\s*["']?)[^\s"',}]{6,}` → Schlüssel bleibt, Wert maskiert |

## Außerhalb des Scopes

- Hermes und Gemini CLI: auf den Dev-Maschinen nicht installiert (`command -v` leer, 2026-09-27).
- Qwen Code: keine Langfuse-Integration.
- fleet-Factory-Runner: erreicht devmesh (Tailnet-only) nicht.
- Pocket-ID-OIDC für die Langfuse-UI: Zugang über den Headless-Admin, devmesh ist Tailnet-only.
- Media-Uploads (`/api/public/media`) laufen am Collector vorbei direkt an Langfuse. Coding-Agents senden dort nur Screenshots.

## Risiken

- R1: Claude-Code-Plugin speichert den Secret-Key im OS-Keychain. Unter WSL ohne Secret-Service kann das scheitern. Fallback: Env-Variablen aus `agent-tracing.env` (vom Plugin laut README unterstützt, wird im Self-Audit geprüft).
- R2: ClickHouse braucht persistenten Speicher. `local-path` ist auf `gpu-cluster2` gepinnt (ADR-008 Nachtrag #2), ClickHouse-PVC landet dort.
- R3: Global gesetzte `LANGFUSE_*`-Env würde auch `scripts/finetune/langfuse_tracking.py` auf devmesh umlenken. Deshalb bekommt jede Harness ihre eigene Credential-Datei (`~/.config/opencode/opencode-langfuse.json`, `~/.pi/agent/langfuse.json`, `~/.codex/langfuse.json`, Claude-Plugin-Config), keine Shell-Profil-Exports.
