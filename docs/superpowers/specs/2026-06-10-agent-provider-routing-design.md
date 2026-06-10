# Agent Provider Routing — Design Spec
**Datum:** 2026-06-10  
**Branch:** feature/agent-provider-routing  
**Status:** draft

---

## Ziel

Zentrale, zur Laufzeit konfigurierbare Mechanik, die steuert welche Quelle (Factory-Phasen, dev-flow, website LLM) auf welchem API-Provider (Anthropic, DeepSeek, OpenAI-kompatibel, Ollama) mit wie vielen parallelen Subagenten läuft. Primärziele: Kostenoptimierung durch Verteilung auf günstige Provider; automatischer Fallback via Circuit-Breaker bei Ausfällen.

**Invariante:** `tier=opus` wird hardcodiert immer auf Anthropic geroutet — diese Regel liegt im Code, nicht in der DB, damit kein Konfigurationsfehler plan-kritische Tasks degradiert.

---

## Architektur-Überblick

```
┌─────────────────────────────────────────────────────┐
│  Aufrufende Quelle (pipeline.js, dev-flow, claude.ts)│
└──────────────────────┬──────────────────────────────┘
                       │ routeProvider(source, tier)
┌──────────────────────▼──────────────────────────────┐
│  scripts/factory/provider-router.js  (ESM)           │
│  • liest provider_config aus DB                      │
│  • prüft provider_health (cooldown? capacity?)       │
│  • gibt {provider, modelId, baseUrl?, releaseSlot()} │
│  • schreibt Fehler zurück via recordFailure()        │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  PostgreSQL  factory.provider_config                 │
│              factory.provider_health                 │
└─────────────────────────────────────────────────────┘
```

---

## DB-Schema

```sql
-- Welche Provider für welche Source/Tier, in welcher Reihenfolge
CREATE TABLE factory.provider_config (
  id             BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,
  -- 'factory-scout' | 'factory-plan' | 'factory-implement'
  -- 'factory-review' | 'dev-flow-execute' | 'website-llm' | '*'
  tier           TEXT NOT NULL,
  -- 'sonnet' | 'haiku'  (opus ist hardcodiert → Anthropic, nie hier konfiguriert)
  priority       INT  NOT NULL,   -- 1 = erste Wahl, 2 = zweite, ...
  provider       TEXT NOT NULL,   -- 'anthropic' | 'deepseek' | 'ollama' | 'openai'
  model_id       TEXT NOT NULL,   -- z.B. 'deepseek-chat', 'qwen2.5:14b', 'claude-sonnet-4-6'
  base_url       TEXT,            -- NULL = Anthropic default; gesetzt für OpenAI-kompatible
  max_concurrent INT  NOT NULL DEFAULT 3,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, tier, priority)
);

-- Circuit-Breaker Zustand pro Provider (global, nicht per source)
CREATE TABLE factory.provider_health (
  provider        TEXT PRIMARY KEY,
  failure_count   INT  NOT NULL DEFAULT 0,
  last_failure    TIMESTAMPTZ,
  cooldown_until  TIMESTAMPTZ,   -- NULL = gesund
  active_agents   INT  NOT NULL DEFAULT 0,  -- laufende Agents (Concurrency-Cap)
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Anmerkungen:**
- `source = '*'` wirkt als Wildcard-Fallback — Quellen ohne eigenen Eintrag erben diese Regel.
- `active_agents` wird atomar via `UPDATE ... RETURNING` inkrementiert/dekrementiert.
- Die `factory_control`-Tabelle bleibt unverändert (Kill-Switch, Daily-Cap).

---

## Routing-Logik (`provider-router.js`)

```
routeProvider(source, tier):

  1. Wenn tier == 'opus'
     → sofort {provider: 'anthropic', modelId: OPUS_MODEL, releaseSlot: no-op}

  2. Lade provider_config WHERE source IN ($source, '*') AND enabled = true
     ORDER BY (source = $source) DESC, priority ASC
     → source-spezifische Einträge vor Wildcard, innerhalb nach Priority

  3. Für jeden Eintrag in der Liste:
     a. Lade provider_health für diesen Provider
     b. SKIP wenn cooldown_until > now()           ← Circuit Breaker offen
     c. SKIP wenn active_agents >= max_concurrent  ← Capacity-Cap (3 default)
     d. Inkrementiere active_agents (atomares UPDATE)
     e. Gib {provider, modelId, baseUrl, releaseSlot(success)} zurück

  4. Kein Provider verfügbar
     → Notfall-Fallback: Anthropic-Sonnet
     → logge WARNING (sichtbar im Dashboard)

recordFailure(provider):
  failure_count++, last_failure = now()
  WENN failure_count >= 3:
    cooldown_until = now() + interval '10 minutes'
  → Circuit Breaker öffnet nach 3 Fehlern, erholt sich nach 10 Minuten

releaseSlot(provider, success):
  active_agents-- (immer, auch bei Fehler)
  WENN NOT success → recordFailure(provider)
```

**Concurrency-Cap:** 3 Agents pro Provider, max. 6 gesamt bei 2 aktiven Providern.

---

## Integration Points

### Factory Pipeline (`scripts/factory/pipeline.js`)

```js
// Jede Phase: route holen, Agent spawnen, Slot freigeben
const route = await routeProvider('factory-scout', 'sonnet')
try {
  const result = await agent(prompt, {
    model: route.modelId,
    ...(route.baseUrl && { env: { ANTHROPIC_BASE_URL: route.baseUrl } })
  })
  await route.releaseSlot(true)
  return result
} catch (err) {
  await route.releaseSlot(false)  // → recordFailure
  throw err
}

// Plan-Phase: opus-Invariante greift automatisch
const planRoute = await routeProvider('factory-plan', 'opus')
// → immer Anthropic, kein baseUrl-Override nötig
```

### dev-flow-execute (Bash-Wrapper)

Da dev-flow-execute Subagenten via Bash spawnt, gibt es einen CLI-Wrapper:

```bash
# route-provider.sh <source> <tier>
# Gibt JSON aus: {"modelId":"deepseek-chat","baseUrl":"...","slotId":"uuid"}
ROUTE=$(bash scripts/factory/route-provider.sh dev-flow-execute sonnet)
MODEL=$(echo "$ROUTE" | jq -r .modelId)
SLOT_ID=$(echo "$ROUTE" | jq -r .slotId)

# ... Agent-Aufruf mit $MODEL ...

# Danach Slot freigeben (success=true/false)
bash scripts/factory/release-slot.sh "$SLOT_ID" true
```

### Website LLM (`website/src/lib/claude.ts`)

```typescript
// Statt hardcodiertem Modell:
const providerConfig = await getProviderConfig('website-llm', 'sonnet')
const client = new Anthropic({
  apiKey: providerConfig.apiKey,
  ...(providerConfig.baseUrl && { baseURL: providerConfig.baseUrl })
})
// Bei DB-Fehler: Fallback auf ANTHROPIC_API_KEY + claude-sonnet-4-6
```

### Autopilot Override (`autopilot.env`)

`ANTHROPIC_MODEL` in `autopilot.env` bleibt als Notfall-Override erhalten. Wenn gesetzt, überschreibt er den Router für alle Factory-Calls. Erlaubt schnelle manuelle Eingriffe ohne DB-Zugriff.

---

## CLI-Management (`scripts/factory/provider-config.sh`)

```bash
# Provider-Routing setzen
./scripts/factory/provider-config.sh set \
  --source factory-implement --tier sonnet \
  --priority 1 --provider deepseek --model deepseek-chat \
  --base-url https://api.deepseek.com/v1

# Aktuellen Stand anzeigen
./scripts/factory/provider-config.sh list [--source factory-implement]

# Circuit Breaker manuell zurücksetzen
./scripts/factory/provider-config.sh reset --provider deepseek

# Health-Status aller Provider
./scripts/factory/provider-config.sh health
```

Alle Subcommands nutzen `kubectl exec` auf den shared-db Pod — kein eigener Service nötig.

---

## Dashboard-Widget (`/dev-status`)

Neuer Abschnitt in `FactoryFloor.svelte` (kein separates Component), 30s Poll:

```
Provider-Status
──────────────────────────────────────────────────
Anthropic   ● gesund    0/3 aktiv    opus (erzwungen)
DeepSeek    ● gesund    2/3 aktiv    sonnet, haiku
Ollama      ○ cooldown  0/3 aktiv    wieder in 7min
```

Spalten: Name · Status-Dot · Aktive Agents / Cap · Zugewiesene Tiers · ggf. Cooldown-Countdown.

---

## Dateien

| Datei | Neu/Geändert |
|---|---|
| `scripts/factory/provider-router.js` | Neu |
| `scripts/factory/provider-config.sh` | Neu |
| `scripts/factory/route-provider.sh` | Neu (Bash-CLI-Wrapper) |
| `scripts/factory/release-slot.sh` | Neu (Bash-CLI-Wrapper) |
| `scripts/factory/pipeline.js` | Geändert — routeProvider-Calls |
| `website/src/lib/claude.ts` | Geändert — getProviderConfig |
| `website/src/components/FactoryFloor.svelte` | Geändert — Status-Widget |
| DB-Migration (neue Tabellen) | Neu |

---

## Nicht in Scope

- Token-Counting / Tagesbudget-Tracking pro Provider (→ Ansatz C, bewusst ausgelassen)
- Kosten-Reporting / Rechnungs-Dashboard
- Automatisches Modell-Benchmarking (Qualitätsmessung pro Provider)
- Mehr als 2 aktive Provider gleichzeitig (Limit: 3/Provider × 2 = 6 gesamt)
