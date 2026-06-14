---
title: "KI-Provider-Auswahl pro Sektion + GPU-Worker-Integration"
date: 2026-06-14
status: draft
ticket_id: null
plan_ref: null
domains: [website, ki-config]
---

# KI-Provider-Auswahl pro Sektion + GPU-Worker-Integration

## Ziel

Die KI-Konfigurationsseite (`/admin/ki-konfiguration`) soll in jeder Sektion den lokalen GPU-Worker
(LM Studio localhost:1234 oder Ollama localhost:11434) als wählbaren Provider anbieten.
DeepSeek bleibt Standard für komplexe Aufgaben (bereits Priority=1 in DB).
Coaching soll alle Katalog-Provider anzeigen statt nur 3 hardcodierte.

## Ist-Stand

- 5 Sektionen: Standard, Website-LLM, Assistent-Chat, Ticket-Triage, Embeddings
- Jede Sektion hat bereits Fallback-Ketten mit wählbarem Provider
- `local-llm` im Katalog verweist nur auf Cluster-ServiceName (`llm-gateway-chat.workspace.svc...`)
- Keine localhost-Optionen im Katalog
- DeepSeek ist bereits Priority=1 (Standard) ✅
- Coaching: 3 hardcodierte Provider (openai/mistral/lumo) in `KNOWN_FIELD_MAP`

## Lösungsansatz

### 1. Katalog-Erweiterung (`ki-catalog.ts`)

Zwei neue Provider-Einträge:

```typescript
{
  id: 'local-lmstudio',
  label: 'LM Studio (GPU-Worker localhost:1234)',
  kind: ['chat'],
  defaultBaseUrl: 'http://localhost:1234/v1',
  apiKeyEnv: null,
  availableModels: ['qwen2.5-7b', 'deepseek-r1-7b', 'llama-3.1-8b', 'mistral-7b'],
  perRowApiKey: false,
  customEndpoint: false,
},
{
  id: 'local-ollama',
  label: 'Ollama (GPU-Worker localhost:11434)',
  kind: ['chat'],
  defaultBaseUrl: 'http://localhost:11434/v1',
  apiKeyEnv: null,
  availableModels: ['qwen2.5', 'llama3.1', 'mistral', 'deepseek-r1'],
  perRowApiKey: false,
  customEndpoint: false,
},
```

Der bestehende `local-llm`-Eintrag bleibt (Cluster-intern), wird aber umbenannt zu
`local-cluster` für Klarheit.

### 2. Connectivity-Check für GPU-Worker (`env-status.ts`)

`GET /api/admin/ki/env-status` wird erweitert:

```typescript
// Prüft ob localhost:1234 (LM Studio) oder localhost:11434 (Ollama) antwortet
const lmStudioReachable = await checkLocalEndpoint('http://localhost:1234/v1/models')
const ollamaReachable   = await checkLocalEndpoint('http://localhost:11434/v1/models')
```

Rückgabe:
```json
{
  "localGpu": {
    "lmstudio": { "reachable": true, "models": ["qwen2.5-7b", ...] },
    "ollama":   { "reachable": false }
  }
}
```

Der Check läuft server-seitig (Astro API-Route), timeout 1s.

### 3. UI-Status-Banner (`KiKonfiguration.svelte`)

Neues "GPU-Worker"-Badge neben dem bestehenden LLM-Status-Banner:
- Grün: LM Studio erreichbar (zeigt Modell-Count)
- Blau: Ollama erreichbar
- Grau: Nicht erreichbar (Provider trotzdem wählbar, Fehler erst bei Nutzung)

### 4. Provider-Dropdown-Erweiterung

Das bestehende Formular-`provider`-Dropdown liest bereits aus `KI_CATALOG`.
Durch das Hinzufügen der neuen Einträge erscheinen sie automatisch.

Zusätzlich: wenn `local-lmstudio` oder `local-ollama` gewählt wird,
wird `base_url` automatisch mit `defaultBaseUrl` vorausgefüllt
(bleibt editierbar für fortgeschrittene Konfiguration).

### 5. Coaching: Dynamischer Provider-Feldmapper

**Datei:** `website/src/components/admin/CoachingSettings.svelte`

Ersetzt die hardcodierte `KNOWN_FIELD_MAP` durch dynamische Feldsteuerung aus `KI_CATALOG`:

```typescript
// Statt:
const KNOWN_FIELD_MAP = { openai: [...], mistral: [...], lumo: [...] }

// Neu:
function getFieldsForProvider(providerId: string): string[] {
  const catalog = KI_CATALOG.find(p => p.id === providerId)
  if (!catalog) return ['apiKey', 'apiEndpoint'] // Fallback
  const fields = ['apiEndpoint']
  if (catalog.apiKeyEnv || catalog.perRowApiKey) fields.push('apiKey')
  if (catalog.thinkingMode) fields.push('thinkingMode')
  if (catalog.euEndpoint) fields.push('euEndpoint')
  return [...fields, 'temperature', 'maxTokens', 'systemPrompt']
}
```

Provider-Dropdown in Coaching zeigt alle `kind: ['chat']` Provider aus `KI_CATALOG`.
`local-lmstudio` und `local-ollama` sind damit direkt verfügbar.

### 6. Runtime-Routing für localhost-Provider

`provider-config.ts` (Funktion `resolveProviderEndpoint`):
- `local-lmstudio` → `base_url` aus DB (default `http://localhost:1234/v1`), kein API-Key
- `local-ollama` → `base_url` aus DB (default `http://localhost:11434/v1`), kein API-Key
- Kompatibel mit OpenAI-kompatiblem SDK (`createOpenAI({ baseURL, apiKey: 'sk-dummy' })`)

## Datenbankänderungen

Keine Schema-Änderungen. Der bestehende `tickets.provider_config`-Table kann
`local-lmstudio` und `local-ollama` als `provider`-Werte aufnehmen.

Optional: Default-Rows für die neuen Provider in `provider-config-schema.ts` ergänzen
(priority=50, disabled by default, Enablen via UI).

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/ki-catalog.ts` | +2 Provider (`local-lmstudio`, `local-ollama`), rename `local-llm` → `local-cluster` |
| `website/src/pages/api/admin/ki/env-status.ts` | +GPU-Worker-Connectivity-Check |
| `website/src/components/admin/KiKonfiguration.svelte` | +GPU-Worker-Badge, base_url-Autofill |
| `website/src/components/admin/CoachingSettings.svelte` | Dynamischer Feldmapper statt KNOWN_FIELD_MAP |
| `website/src/lib/schema/provider-config-schema.ts` | Optionale Default-Rows für neue Provider |
| `website/src/lib/ki-catalog.test.ts` | Tests für neue Provider-Einträge |
| `website/src/pages/api/admin/ki/env-status.test.ts` | Tests für GPU-Worker-Check (neu) |

## Was NICHT geändert wird

- Kein DB-Schema-Change (keine Migration nötig)
- `local-llm` bleibt als `local-cluster` erhalten (Cluster-Nutzer nicht brechen)
- DeepSeek-Priority in DB nicht anfassen (bereits korrekt)
- Embedding-Konfiguration unverändert (separates System)
- `provider-config.ts` Runtime-Routing: minimale Anpassung nur für null-API-Key-Handling

## Teststrategie

1. **Unit-Tests `ki-catalog.test.ts`:** neue Provider-Einträge validieren (id, label, kind, defaultBaseUrl)
2. **Unit-Tests `env-status.test.ts`:** Mock-fetch für localhost-Check, reachable/unreachable Szenarien
3. **Unit-Tests `CoachingSettings`-Feldmapper:** dynamische Felder pro Provider korrekt
4. **Vitest:** `task test:unit` muss grün bleiben
5. **Manueller Check:** `/admin/ki-konfiguration` öffnen, neue Provider im Dropdown sehen

## Nicht im Scope

- Automatisches Modell-Discovery (Dropdown vorausfüllen aus lokalem API)
- Tier-Auswahl pro Sektion (Sonnet/Haiku-Radio) — separates Feature
- Neue Sektion "Lokal" in der UI — die bestehenden Karten reichen
