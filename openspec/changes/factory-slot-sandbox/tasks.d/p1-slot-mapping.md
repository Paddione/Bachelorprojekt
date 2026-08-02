# Partial p1 — Slot-Mapping

## Scope

Pipeline-Slot → llama.cpp-Slot-ID Mapping in `slots.sh`, llm-proxy Slot-Routing,
und Multi-Slot-Loadout-Aktivierung.

## Task List

### 1. scripts/factory/slots.sh — Slot-Mapping

- [ ] **1.1** `claim()`: Nach `pipeline_slot`-Zuweisung `llama_slot_id = pipeline_slot - 1` berechnen
- [ ] **1.2** `pipeline_slot_meta` JSONB in `tickets.tickets` schreiben: `{"llama_slot_id": N, "claimed_at": "<iso8601>"}`
- [ ] **1.3** `release()`: `pipeline_slot_meta` auf NULL setzen
- [ ] **1.4** Neuer Befehl `slot-id <ticket>`: gibt `llama_slot_id` aus `pipeline_slot_meta` zurück
- [ ] **1.5** DB-Migration: `pipeline_slot_meta JSONB` Spalte zu `tickets.tickets` hinzufügen (falls nicht existent)

### 2. scripts/llm-proxy/server.mjs — Slot-Routing

- [ ] **2.1** `X-Slot-ID` Header aus eingehenden Requests lesen
- [ ] **2.2** Per-Slot-Queue statt globaler Queue: `Map<slotId, {inflight, waiters}>`
- [ ] **2.3** `enqueue()` um Slot-Parameter erweitern: `enqueue(backend, slotId, fn)`
- [ ] **2.4** Response-Header `X-LLM-Proxy-Slot` setzen
- [ ] **2.5** Fallback ohne `X-Slot-ID`: Round-Robin über verfügbare Slots

### 3. scripts/llm/loadouts.json — Multi-Slot aktivieren

- [ ] **3.1** `gemma-multiagent` Loadout (`parallel: 3`) als aktiv markieren
- [ ] **3.2** `gemma-factory` Loadout deaktivieren oder `parallel` auf 3 setzen
- [ ] **3.3** `start-gemma-server.ps1` prüfen: `-np 3` mit `-kvu` wird korrekt gesetzt

## Verification

```bash
# Slot-Mapping testen
bash scripts/factory/slots.sh claim T002483 2>&1
bash scripts/factory/slots.sh slot-id T002483 2>&1

# llm-proxy Slot-Routing testen
curl -s -H "X-Slot-ID: 0" http://127.0.0.1:18235/health | jq .
```
