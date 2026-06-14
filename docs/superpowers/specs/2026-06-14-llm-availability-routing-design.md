---
ticket_id: T000718
plan_ref: null
created: 2026-06-14
status: staged
---

# Spec: LLM Availability-Based Routing

## Ziel

Website-LLM-Assistent-Chat, Ticket-Triage und Embeddings sollen dynamisch entweder DeepSeek oder ein Modell vom GPU-Worker nutzen — ohne hardcoded Modell-IDs. Das System soll automatisch erkennen, welcher Provider verfügbar ist.

## Kontext

Das `tickets.provider_config`-System (PR #1651) ermöglicht bereits DB-gesteuertes Multi-Provider-Routing mit Priorität + Cooldown. Es fehlen:
1. `classify.ts` nutzt hardcoded `claude-haiku-4-5-20251001` und `ANTHROPIC_API_KEY` — muss auf `getProviderConfig` migriert werden
2. Keine DeepSeek/GPU-Worker Seed-Rows für `assistant-chat` und `ticket-triage` Sources
3. `embeddings.ts` nutzt statisches `LLM_ENABLED` Env-Var ohne Laufzeit-Fallback
4. Fehler in den Hot-Paths werden nicht in Cooldowns umgewandelt (kein aktives Provider-Health-Update)

## Design-Entscheidungen

### 1. classify.ts Migration
- Ersetze direkten `new Anthropic(...)` + hardcoded Modell durch `getProviderConfig(SOURCE.ticketTriage, 'haiku')`
- Gleiche Logik wie das bestehende `ticket-triage.ts` — beide Triage-Paths nutzen dann denselben Provider-Config-Eintrag

### 2. DB-Seed: DeepSeek + GPU-Worker Rows
Migration-SQL in `website/migrations/` mit idempotenten UPSERTs:
- `source='assistant-chat'`, tier='sonnet', priority=1: DeepSeek (`deepseek-chat`, `https://api.deepseek.com/v1`, `DEEPSEEK_API_KEY`)
- `source='assistant-chat'`, tier='sonnet', priority=2: GPU-Worker Chat (`llm-gateway-chat` cluster service, kein API-Key)
- `source='ticket-triage'`, tier='haiku', priority=1: DeepSeek (`deepseek-chat`)
- `source='ticket-triage'`, tier='haiku', priority=2: GPU-Worker Chat
- Bestehende Anthropic-Rows erhalten priority=99 (letzter Fallback, falls beide nicht verfügbar)

### 3. Error-Driven Cooldown
In den Hot-Paths (assistant/llm.ts, ticket-triage.ts, classify.ts) wird bei Provider-Fehlern `setProviderCooldown(pool, source, provider, 5min)` aufgerufen. Beim nächsten Request wählt `getProviderConfig` automatisch den nächsten Provider in der Prioritätsliste.

### 4. Embeddings — Runtime Fallback
`embeddings.ts` bekommt eine Try/Catch-Schicht um den GPU-Worker-Call:
- Bei Verbindungsfehler (ECONNREFUSED, timeout) → Voyage-Fallback + console.warn
- Constraint: Nur erlaubt wenn Collection-Typ homogen ist — Mixed-Vector-Space-Problem besteht weiterhin. Kein stiller Fallback bei aktiven bge-m3-Collections, sondern expliziter Error mit Hinweis auf `LLM_ENABLED=false`.
- Der Fallback ist eine Notfall-Brücke, kein normaler Betriebsmodus.

### 5. Kein neuer GPU-Worker Kubernetes Service
`llm-gateway-chat` existiert als Cluster-Service in `prod/llm-router.yaml` (prod-only). Für dev: `LLM_ROUTER_URL` Env-Var. Die DeepSeek-Route braucht keinen neuen Service.

## Betroffene Dateien
- `website/src/pages/api/admin/tickets/[id]/classify.ts` (hardcoded entfernen)
- `website/src/lib/provider-config.ts` (ggf. `setProviderCooldown` Funktion hinzufügen)
- `website/src/lib/assistant/llm.ts` (Error-Cooldown in catch)
- `website/src/lib/ticket-triage.ts` (Error-Cooldown in catch)
- `website/src/lib/embeddings.ts` (Runtime-Fallback mit Fehlerbehandlung)
- `website/migrations/YYYYMMDD_llm_availability_seed.sql` (neue Migration)
- `k3d/secrets.yaml` (DEEPSEEK_API_KEY für dev, falls nicht schon vorhanden)
- `environments/schema.yaml` (DEEPSEEK_API_KEY als registrierte Variable)

## Out of Scope
- Aktiver Health-Poller (würde Infra-Aufwand bedeuten; passives Cooldown-Muster reicht)
- Neues Admin-UI für Provider-Prioritäten (besteht bereits unter `/admin/ki-konfiguration`)
- Coaching-Subsystem (bereits vollständig multi-provider)
