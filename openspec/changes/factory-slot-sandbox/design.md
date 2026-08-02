# Design: Factory Slot Sandbox

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│ GPU Host (RTX 5070 Ti, 16 GB VRAM)                      │
│                                                         │
│  llama-server :8091 -np 3 -kvu                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │
│  │ Slot 0  │  │ Slot 1  │  │ Slot 2  │                 │
│  │ KV-0    │  │ KV-1    │  │ KV-2    │  shared pool    │
│  └────┬────┘  └────┬────┘  └────┬────┘                 │
│       │            │            │                       │
│  ┌────┴────────────┴────────────┴────┐                  │
│  │        llm-proxy :18235           │                  │
│  │  pipeline_slot → Slot-ID/Backend  │                  │
│  └────────────────┬──────────────────┘                  │
└───────────────────┼──────────────────────────────────────┘
                    │
┌───────────────────┼──────────────────────────────────────┐
│ WSL/Linux Host    │                                      │
│                   │                                      │
│  ┌────────────────┴──────────────────┐                  │
│  │       Factory Dispatcher          │                  │
│  │  schedule.sh → slots.sh claim     │                  │
│  │  pipeline_slot 1, 2, oder 3       │                  │
│  └────────────────┬──────────────────┘                  │
│                   │                                      │
│  ┌────────────────┼──────────────────┐                  │
│  │ Container A    │  Container B     │  Container C     │
│  │ slot=1         │  slot=2          │  slot=3          │
│  │                │                  │                  │
│  │ claude -p ...  │  opencode run .. │  claude -p ...   │
│  │   --slot-id=1  │    --slot-id=2   │    --slot-id=3   │
│  │                │                  │                  │
│  │ cgroups:       │  cgroups:        │  cgroups:        │
│  │  cpu=2,mem=4Gi │  cpu=2,mem=4Gi   │  cpu=2,mem=4Gi   │
│  │                │                  │                  │
│  │ net:           │  net:            │  net:            │
│  │  default-deny  │  default-deny    │  default-deny    │
│  │  + allowlist   │  + allowlist      │  + allowlist     │
│  │                │                  │                  │
│  │ fs:            │  fs:             │  fs:             │
│  │  /work → wt/A  │  /work → wt/B    │  /work → wt/C    │
│  │  /tmp  → tmp/A │  /tmp  → tmp/B   │  /tmp  → tmp/C   │
│  └────────────────┴──────────────────┴──────────────────┘
```

## Slot-Kopplung

### Mapping-Tabelle

```
pipeline_slot (tickets)  →  llama.cpp slot_id  →  llm-proxy route
─────────────────────────────────────────────────────────────────
         1                →         0           →  ?slot_id=0
         2                →         1           →  ?slot_id=1
         3                →         2           →  ?slot_id=2
```

### Routing-Entscheidung

**Variante 1: Proxy-Header** — llm-proxy fügt `X-Slot-ID: N` Header ein, llama.cpp
müsste den auswerten (benötigt Patch oder Feature-Request).

**Variante 2: Per-Slot-Backends** — Je pipeline_slot ein `llm_proxy_backends`-Eintrag
mit dediziertem Port. `slots.sh` schreibt die Port→Slot-Zuordnung in die DB.
```
llm_proxy_backends:
  llamacpp-gemma-slot0 → :8091 (Slot 0)
  llamacpp-gemma-slot1 → :8091?slot_id=1 (Slot 1)
  llamacpp-gemma-slot2 → :8091?slot_id=2 (Slot 2)
```
Nachteil: llama.cpp's OpenAI-API kennt keinen `slot_id` Query-Parameter.

**Variante 3: Direktes Routing** — `slots.sh` schreibt die Slot-ID beim Claim in die
DB, `pipeline.mjs` übergibt sie als `PIPELINE_SLOT`-Env an den Agenten. Der Agent
sendet sie im `X-Slot-ID` Header. Der llm-proxy leitet sie an llama.cpp weiter (falls
supported) oder serialisiert selbst per Slot-ID (Queue pro Slot).

**Empfehlung: Variante 3** — minimal invasiv, keine llama.cpp-Änderung nötig.
llm-proxy führt N interne Queues (eine pro Slot), leitet Requests an llama.cpp mit
`?slot_id=N` falls supported, sonst FIFO pro Slot. `max_inflight` wird pro Slot
statt global interpretiert.

### slots.sh — Erweiterung

```bash
# claim() — zusätzlich zu pipeline_slot:
# 1. llama.cpp Slot-ID bestimmen (pipeline_slot - 1)
# 2. In tickets.pipeline_slot_meta JSONB persistieren:
#    { "llama_slot_id": 0, "claimed_at": "..." }
# 3. KV-Cache für diesen Slot laden (T002482)
```

## Sandbox-Upgrade

### sandbox-run.sh — Stufe 2

Heute: `sandbox-run.sh <worktree> <command>` → führt einen Befehl im Container aus.

Neu: `sandbox-run.sh --agent <worktree> --slot <N> -- <agent-command>`
- `--agent`: Agent-Modus (lange laufend, nicht Einmal-Command)
- `--slot N`: pipeline_slot für cgroups-Naming und Netzwerk-Isolation
- Mounts: `/work` (worktree), `/tmp` (dediziertes TMPDIR pro Slot)
- Network: `factory-sandbox-slot-N` mit default-deny + egress_allowlist
- cgroups: `cpu.max`, `memory.max` pro Slot

### sandbox.Dockerfile

```dockerfile
FROM node:22-bookworm
RUN apt-get update && apt-get install -y go-task curl git jq
RUN npm install -g @anthropic-ai/claude-code opencode
# playwright not needed for agent sessions (headed tests bleiben Stufe 1)
WORKDIR /work
USER 1000:1000
```

### egress_allowlist() — Enforcement

```bash
# Pro Container: iptables-Regeln für default-deny + allowlist
docker run --cap-add=NET_ADMIN \
  --network factory-sandbox-slot-1 \
  ...
```

Die `egress_allowlist()`-Funktion existiert bereits in `sandbox-run.sh:26-29`,
wird aber nicht enforced. Für Stufe 2 wird sie pro Slot-Container aktiv.

### pipeline.mjs — Integration

```javascript
// Vorher:
const result = execSync(`claude -p "${prompt}"`, { cwd: WORK_WT });

// Nachher:
const slotId = process.env.PIPELINE_SLOT;
const result = execSync(
  `sandbox-run.sh --agent ${WORK_WT} --slot ${slotId} -- claude -p "${prompt}"`,
  { cwd: WORK_WT }
);
```

## Abhängigkeiten

| Ticket | Beschreibung | Status |
|--------|-------------|--------|
| T002482 | KV-Offload + Slot-Save/Restore | Blockiert Persistenz |
| T002370 | Epic: Slot-gebundener Kontextraum | Parent |

Ohne T002482: Slot-Kopplung funktioniert (richtiger Slot wird genutzt), aber
Kontexte sind flüchtig — jeder Dispatcher-Neustart verliert den KV-Cache.

## Risiken

1. **VRAM-Budget:** 3 Slots mit `-kvu` und geteiltem 200k-Kontext brauchen ~12 GB —
   passt in 16 GB, aber eng mit mmproj (Vision). Ggf. `-np 2` statt 3.
2. **llama.cpp Slot-API:** Wenn `/v1/chat/completions` keinen `slot_id` akzeptiert,
   muss der llm-proxy intern queuen (N Queues, Round-Robin an llama.cpp).
3. **Container-Overhead:** 3 parallele Container auf dem WSL-Host plus llama-server
   plus llm-proxy → Ressourcen-Engpass möglich.
4. **cgroups v1 vs v2:** WSL nutzt cgroup v2, Docker sollte das unterstützen.
