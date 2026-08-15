---
ticket_id: T006840
plan_ref: openspec/changes/unterstuetzermodelle-inbetriebnahme/tasks.md
status: active
date: 2026-08-15
---

# Design: Unterstützermodelle in Betrieb — Gemma-4-12B (PK-Tablet) und Qwen3.5-4B (PK-L-1) als benannte Slots

## Zweck

S2 aus dem Design `2026-08-15-laptop-bge-topologie` (T006143): Die beiden Unterstützermodelle
aus E6 — Gemma-4-12B UD-IQ3_XXS (~4,64 GB, PK-Tablet) und Qwen3.5-4B Q6_K (~3,3 GB, PK-L-1) —
werden als benannte Slots in Betrieb genommen. Beide laufen in LM Studio auf den Laptop-Geräten
und werden über den llm-proxy (:18235) sichtbar. S2 registriert **nur** die Slots und misst die
Vulkan-Performance; das Feintuning (S3, T006361) ersetzt später das Stock-Modell auf PK-L-1.

## Ausgangslage (erhoben 2026-08-15)

- **S1 gemergt** (PR #4560): `loadouts.json`-Rollenketten zeigen `embed` → LM Studio (:1234,
  LM Link, PK-L-1) vor Cluster, `rerank` → PK-Tablet (:8080, WG-Mesh `.12`) vor Cluster vor
  `bge-rerank-cpu`. `scripts/lm-studio/lmstudio-bge-autoload.sh` enthält keine Rerank-Versuche
  mehr (K3 aus S1 erledigt).
- **`lmstudio`-Provider** in `.opencode/agent-models.jsonc` (Zeile 227): Modelleinträge ohne
  baseURL, Muster `name@quant` mit `limit.context`/`limit.output` — z. B. `qwen3-14b@q4_k_m`
  (32768/8192), `google/gemma-4-12b-qat` (180000). Die Provider-Definition mit
  `baseURL: http://127.0.0.1:1234/v1` liegt in `.opencode/opencode.jsonc` (Zeile 59–63) und ist
  **nicht** Teil der tracked surfaces des `gateway-consumer-lint` — unangetastet lassen.
- **SSOT-Verträge** (`openspec/specs/local-llm-proxy.md`): `gateway-consumer-lint.bats`
  verbietet nicht-kommentierte `:8093`-/`127.0.0.1:1234`-Literale in `.opencode/
  agent-models.jsonc` und den drei Factory-Skripten; der Kontextzahl-Guard
  (`opencode-routes-via-proxy.bats`) prüft deklarierte Kontextzahlen von `--fit`-**Loadouts**
  gegen den laufenden Server mit ±20 %-Korridor — LM-Studio-Slots sind keine Loadouts, für sie
  gilt die statische Deklaration (Auto-Compact-Grenze für opencode).
- **llm-proxy-Discovery**: `scripts/llm-proxy/backends.mjs` kennt Backend-Kind `lmstudio`
  (Modell-Discovery über `/v1/models`); der Proxy meldet die geladenen LM-Studio-Modelle über
  `:18235/v1/models`.
- **Device-Seite**: LM Studio 0.4.21 auf beiden Geräten; iGPU/Vulkan seit 0.4.17 default-aus
  (Recherche-Fakt aus T006143). PK-Tablet hat bisher keinen LM-Link-Zugang aus WSL.
- **Modellgrößen** (Hub-verifiziert, E6): `gemma-4-12b-it-UD-IQ3_XXS.gguf` 4,64 GB (unsloth),
  Qwen3.5-4B Q6_K ~3,3 GB (unsloth). Summen: Tablet ~5,3 GB, PK-L-1 ~4 GB — im 6,5-GB-Budget.

## Zielbild

```
.opencode/agent-models.jsonc → "lmstudio" (unverändert als Provider)
  └─ models:
       gemma-4-12b@ud-iq3_xxs   (PK-Tablet, limit 32768/8192 → GEMESSEN nach Messung)
       qwen3.5-4b@q6_k          (PK-L-1,  limit 32768/8192 → GEMESSEN nach Messung)

Konsumenten: llm-proxy :18235/v1/models (Discovery) → opencode-Subagenten referenzieren
die Slots über den Proxy — kein direkter Backend-Port in agent-models.jsonc.
```

## Entscheidungen

### D1 — Slots in den bestehenden `lmstudio`-Provider-Block, Muster `name@quant`

Neue Modelleinträge folgen exakt dem vorhandenen Muster (`qwen3-14b@q4_k_m`): Name + `limit`
ohne baseURL. Die Provider-Definition in `.opencode/opencode.jsonc` bleibt unangetastet —
sie ist kein Ziel dieses Changes und nicht vom gateway-consumer-lint erfasst. Slot-Namen:
`gemma-4-12b@ud-iq3_xxs` und `qwen3.5-4b@q6_k`. Die exakte Modell-ID, die der llm-proxy per
Discovery meldet, verifiziert der Implementer live gegen `:18235/v1/models` (Verifikations-
schritt im Plan) — weicht die Konvention ab, folgt der Eintrag der gemeldeten ID, nicht dem
geratenen Namen.

### D2 — Nur Slots registrieren, kein Subagent-Umhängen (User-Entscheidung 2026-08-15)

Die ~10 tok/s auf Iris sind Annahme. Ein Umhängen von gemma-/qwen-Subagenten vor der Messung
riskiert einen Rückbau nach der Messung. Umhängen ist Folge-Ticket nach Vorliegen der
Messwerte.

### D3 — Konservative Limits bis zur Messung, dann GEMESSEN nachziehen

`limit.context = 32768`, `limit.output = 8192` als Start (Muster `qwen3-14b@q4_k_m`). Nach
dem Vulkan-Messschritt werden die Werte auf die gemessenen Größen gesetzt — die Datei trägt
die GEMESSEN-Konvention (Messlauf + Datum im Kommentar), wie bei den llama.cpp-Loadouts.

### D4 — Messung als User-Task im Plan (User-Entscheidung 2026-08-15)

Der Plan enthält einen Mess-Task mit ausführbarem Befehl (tok/s prompt/decode je Modell über
den llm-proxy) — Mess-Konvention T002717: Befehl und Stand dokumentieren. Ergebnis wird als
Ticket-Kommentar festgehalten; das Limits-Update ist ein Folge-Task im selben Ticket.

### D5 — Guards: statische Deklaration + Erreichbarkeit mit Skip

- Neuer Guard `tests/spec/local-llm-proxy/support-model-slots.bats` (Output-Verifikation,
  T002448-M4): (a) die zwei Slots sind im `lmstudio`-Block deklariert (Positiv-Anker) und
  (b) die neuen Einträge enthalten kein `:1234`-/`:8093`-Literal (Negativ-Aussage mit
  Positiv-Anker, T002356-M1 — der bestehende gateway-consumer-lint deckt die Datei bereits
  global ab, der neue Guard prüft gezielt die neuen Einträge).
- Erreichbarkeits-Check: läuft der llm-proxy und meldet er die Modelle, müssen beide Slots in
  `:18235/v1/models` erscheinen; sind Geräte/Server offline, skippt der Test (Muster
  `llm_endpoint_healthy`-Helper mit Skip-Guard).
- Test-Inventory regenerieren (CI-Gate).

## Komponenten

### K1 — Slot-Einträge (`.opencode/agent-models.jsonc`)

Zwei Einträge im `lmstudio`-Provider-Block, D1/D3. Kommentar mit Gerätezuordnung und
Quantisierung (Muster der Datei).

### K2 — Device-Runbook (Plan-Tasks, User-ausgeführt)

Auf beiden Geräten: Hardware-Settings → iGPU/Vulkan aktivieren (default-aus seit 0.4.17);
PK-Tablet: `gemma-4-12b-it-UD-IQ3_XXS.gguf` laden, LM Link einrichten (wie PK-L-1);
PK-L-1: Qwen3.5-4B Q6_K laden. Verifikation je Schritt: Modell erscheint in
`:18235/v1/models`.

### K3 — Vulkan-Messschritt (User-Task)

Messung von tok/s (prompt/decode) je Modell über den llm-proxy; ausführbarer Befehl im Plan,
Ergebnis als Ticket-Kommentar, Limits-Update als Folge-Task (D4).

### K4 — Guards (tests/spec/local-llm-proxy/)

Neuer Guard nach D5; bestehende Guards (`gateway-consumer-lint`, `opencode-agent-model-drift`,
`opencode-routes-via-proxy`) bleiben unverändert grün.

## Testing

- Bestand: `tests/spec/local-llm-proxy/*` bleibt grün (die neuen Einträge sind Daten; der
  gateway-consumer-lint prüft sie automatisch mit).
- Neu: `support-model-slots.bats` (D5) mit Skip-Guard für offline Geräte; STRUCT2-Failing-Test
  im Tests-Partial.
- Test-Inventory regenerieren.

## Scope & Reihenfolge

- **S2 (dieser Change):** K1–K4. Device-Schritte (K2) und Messung (K3) sind User-Tasks.
- **S3 (T006361, läuft):** Feintuning, Registry-Registrierung, Stock-Austausch auf PK-L-1.

## Risiken & offene Punkte

- **Slot-Namen vs. Discovery-ID:** Die exakte Modell-ID, die der llm-proxy meldet, ist erst
  live verifizierbar — der Plan trägt einen Verifikationsschritt; bei Abweichung gilt die
  gemeldete ID (D1).
- **Vulkan-Performance:** ungemessen — genau dafür existiert K3; bis zur Messung gelten die
  konservativen Limits.
- **LM Link fürs Tablet:** neuer Zugang; T006143 hat die Mechanik als vorhanden dokumentiert,
  die Einrichtung am Gerät ist User-Task.

## Referenzen

- `openspec/changes/2026-08-15-laptop-bge-topologie/design.md` (E6, K3, K4, S2)
- `openspec/specs/local-llm-proxy.md` (SSOT: gateway-consumer-lint, Kontextzahl-Guard,
  Discovery)
- T005557 (bge-Embed-Backup via LM Link), T005594 (LM-Studio-Autoload), T002717
  (Mess-Konvention), T006361 (S3-Lauf)
