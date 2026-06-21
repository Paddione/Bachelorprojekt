---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-21
---

# Sidekick AI-Quality Widget — Design Spec

**Datum:** 2026-06-21  
**Status:** plan_staged  
**ticket_id:** TBD  
**plan_ref:** openspec/changes/sidekick-ai-quality/tasks.md  

---

## Zusammenfassung

Neuer Sidekick-View `'ai-quality'` im bestehenden `PortalSidekick`-Panel.
Trackt die Qualität aller AI-Workflows (Coaching-Chat, RAG-Search, Embeddings, Grilling, Plan-QA)
entlang vier Dimensionen: Latenz, Cost/Token-Budget, Fehlerrate, Output-Güte.

Kernansatz: zentraler `withAiMetrics()`-Middleware-Wrapper + neue `ai_call_log`-Tabelle +
dedizierter API-Endpoint + kompakter Svelte-View.

---

## 1. Datenschicht

### Tabelle `ai_call_log` (website-DB)

```sql
CREATE TABLE ai_call_log (
  id                BIGSERIAL PRIMARY KEY,
  ts                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow          TEXT NOT NULL,
  model             TEXT,
  prompt_tokens     INT,
  completion_tokens INT,
  latency_ms        INT NOT NULL,
  error             TEXT,
  user_sub          TEXT,
  metadata          JSONB
);

CREATE INDEX ai_call_log_ts       ON ai_call_log (ts DESC);
CREATE INDEX ai_call_log_workflow ON ai_call_log (workflow, ts DESC);
```

**Workflow-Werte:** `'coaching_chat'` | `'rag_search'` | `'embedding'` | `'grilling'` | `'plan_qa'`

**`metadata` JSONB** nimmt workflow-spezifische Zusatzdaten auf (RAG: chunk_count, threshold,
collection_id; Embeddings: batch_size, collection_name). Keine festen Spalten, da sich die
Felder je nach Workflow unterscheiden.

**Cost-Berechnung** erfolgt zur Query-Zeit im API-Layer (Tokens × Preis/1k), nicht in der
Tabelle — so bleiben Rohwerte auch nach Preisänderungen korrekt auswertbar.

**Retention:** `DELETE FROM ai_call_log WHERE ts < NOW() - INTERVAL '90 days'`
als neuer Taskfile-Task `maintenance:ai-log-cleanup`, aufrufbar manuell und per
`task maintenance:all` (analog zu bestehenden Cleanup-Tasks).

---

## 2. Middleware-Wrapper

### `website/src/lib/ai-metrics.ts` (neue Datei)

```typescript
export type AiWorkflow =
  | 'coaching_chat'
  | 'rag_search'
  | 'embedding'
  | 'grilling'
  | 'plan_qa';

interface AiCallMeta {
  workflow: AiWorkflow;
  model?: string;
  userSub?: string;
  metadata?: Record<string, unknown>;
}

export async function withAiMetrics<T>(
  fn: () => Promise<T & { usage?: { input_tokens?: number; output_tokens?: number } }>,
  meta: AiCallMeta
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const promptTokens     = result?.usage?.input_tokens;
    const completionTokens = result?.usage?.output_tokens;
    void logAiCall({ ...meta, latencyMs: Date.now() - start, promptTokens, completionTokens });
    return result;
  } catch (err) {
    void logAiCall({ ...meta, latencyMs: Date.now() - start, error: String(err) });
    throw err;
  }
}
```

**Garantien:**
- `void logAiCall(...)` ist fire-and-forget — das Logging blockiert nie den AI-Call.
- DB-Insert-Fehler werden auf `stderr` geloggt und geschluckt (Observability bricht nie die Hauptfunktion).
- Fehler aus `fn()` werden immer rethrown — kein silent-swallow.

### Instrumentation-Stellen

| Datei | Call-Site | Was wird erfasst |
|---|---|---|
| `lib/assistant/llm.ts` | Anthropic `.messages.create()` | prompt_tokens, completion_tokens, latency_ms, error |
| `lib/knowledge-db.ts` | `queryNearest()` | latency_ms, metadata.chunk_count, metadata.threshold |
| `lib/ki-services.ts` | `embedBatch()` | latency_ms, metadata.batch_size, model |
| Grilling-Handler | LLM-Call in Grilling-Flow | prompt_tokens, completion_tokens, latency_ms |
| Plan-QA-Handler | LLM-Call in Plan-QA-Flow | prompt_tokens, completion_tokens, latency_ms |

---

## 3. API-Endpoint

### `GET /api/admin/ai-quality`

Nur Admin-zugänglich (bestehende `requireAdmin()` Middleware).

**Response:**

```typescript
{
  health: Record<AiWorkflow, 'green' | 'yellow' | 'red'>,
  last24h: {
    hour: string,          // ISO timestamp
    calls: number,
    errors: number,
    avg_latency_ms: number,
  }[],
  byWorkflow: {
    workflow: AiWorkflow,
    calls: number,
    error_rate: number,    // 0–1
    avg_latency_ms: number,
    p95_latency_ms: number,
    total_tokens: number,
    est_cost_eur: number,
  }[],
  recentErrors: {          // LIMIT 5, neueste zuerst
    ts: string,
    workflow: AiWorkflow,
    model: string | null,
    error: string,
  }[],
}
```

**Health-Schwellwerte** (Basis: letzte 1 Stunde):

| Status | Bedingung |
|---|---|
| `green` | avg_latency < 800ms **und** error_rate < 5% |
| `yellow` | avg_latency < 2000ms **und** error_rate < 20% — oder kein Call in letzter Stunde |
| `red` | sonst |

**Cost-Preise** (hardcoded, updatebar):

```typescript
const PRICE_PER_1K_EUR = {
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5':  { input: 0.00025, output: 0.00125 },
  'bge-m3':            { input: 0, output: 0 },  // lokal
};
```

---

## 4. Sidekick-View UI

### `AiQualitySidekickView.svelte` (neue Datei)

Folgt dem Muster von `CockpitSidekickView.svelte`: lädt Daten per `fetch` in `onMount`,
localStorage für aufklappbare Sektionen, Auto-Refresh alle 60 Sekunden.

**Layout (460px Desktop, Fullscreen Mobile):**

```
┌─────────────────────────────────────┐
│ ① Health-Header                     │
│   ● coaching_chat  342ms  1.2% err  │
│   ● rag_search      89ms  0.0% err  │
│   ○ embedding      210ms  0.0% err  │
├─────────────────────────────────────┤
│ ② 24h-Verlauf  [▾ aufgeklappt]      │
│   ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁  (CSS-Balken)   │
│   Farbe = Fehlerrate (grün→rot)     │
├─────────────────────────────────────┤
│ ③ Kosten 7 Tage                     │
│   Workflow       Calls  Tokens  EUR │
│   coaching_chat   142   48 320  0.82│
│   rag_search      398    6 114  0.02│
│   embedding        23   92 000  —   │
├─────────────────────────────────────┤
│ ④ Fehler-Log (nur wenn vorhanden)   │
│   [rot] 14:32 coaching_chat         │
│   Connection timeout after 30s      │
└─────────────────────────────────────┘
```

**Sektionen:**
- **①** immer sichtbar; Hover-Tooltip zeigt letzten Fehler des Workflows
- **②** default zugeklappt; `localStorage['ai-quality:24h-open']`
- **③** sortiert nach Kosten absteigend; lokale Modelle zeigen `—` bei EUR
- **④** ausgeblendet wenn keine Fehler in letzter Woche

**Balkendiagramm (kein Canvas):** `display:flex` mit 24 Elementen, `height` als Prozent des
Max-Werts per CSS-Variable — kein Chart-Library-Overhead.

**Auto-Refresh:** `setInterval` alle 60s + `onDestroy`-Cleanup (wie `CockpitSidekickView`-Pattern).

### Navigation-Integration

| Datei | Änderung |
|---|---|
| `lib/assistant/sidekick-nudge.ts` | `'ai-quality'` zu `KNOWN_VIEWS` hinzufügen |
| `components/assistant/SidekickHome.svelte` | Item `08 KI-Qualität` mit Badge (Fehleranzahl) |
| `components/PortalSidekick.svelte` | `{#if view === 'ai-quality'}` Branch + Import |

---

## 5. Out of Scope

- **Output-Güte / User-Feedback:** Thumbs-up/down-Erfassung ist ein separates Feature — 
  das `metadata`-JSONB-Feld ist vorbereitet, aber die UI dafür kommt nicht in dieser PR.
- **Alerts / Nudges:** Automatische Sidekick-Nudges bei Qualitätsverschlechterung sind
  vorbereitet (Health-Status liegt vor), aber nicht implementiert.
- **Plan-QA + Grilling Call-Sites:** Werden instrumentiert, sofern diese Flows tatsächlich
  direkte LLM-Calls im Website-Code haben; anderenfalls dokumentiert und für spätere PRs notiert.

---

## 6. Akzeptanzkriterien

1. Nach jedem Coaching-Chat-Request erscheint ein Eintrag in `ai_call_log`.
2. Nach jedem `queryNearest()`-Aufruf erscheint ein Eintrag mit `workflow = 'rag_search'`.
3. `GET /api/admin/ai-quality` gibt HTTP 200 mit vollständigem Response-Shape zurück.
4. Der Sidekick-View ist über das Home-Menü erreichbar und zeigt Health-Dots.
5. Kein LLM-Call schlägt fehl, weil das Logging fehlschlug.
6. `task test:changed` + `task freshness:check` laufen grün durch.
