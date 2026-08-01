# Gemma-Thinking verbraucht das max_tokens-Budget — Design

**Ticket:** T002501 · **Typ:** bug · **Datum:** 2026-08-01

## Problem

Der lokale Gemma-Server (`:8091`, via llm-proxy `:18235`) läuft mit `thinking = 1`
(Serverlog: `srv init: chat template, thinking = 1`). Gemma schreibt zuerst nach
`reasoning_content`; `choices[0].message.content` bleibt **leer**, bis das Denken
abgeschlossen ist. Ist `max_tokens` vorher erschöpft, kommt `finish_reason=length`
mit leerem `content` zurück — kein Fehler, kein Log-Eintrag, kein HTTP-Status ungleich 200.

### Symptom vs. Ursache

Getrennt gemäß der Bug-Triage-Konvention (T002448-M5):

- **Symptom (beobachtet):** Konsumenten des lokalen LLM erhalten leere Antworten.
- **Ursache (verifiziert, nicht vermutet):** Thinking verbraucht das Budget vor dem
  ersten `content`-Token. **Nicht** ein zu klein gewähltes `max_tokens`.

### Reproducer

Gegen den laufenden Server, identischer Prompt, `temperature: 0`:

| Aufruf | `finish_reason` | `content` | `reasoning_content` |
|---|---|---|---|
| `max_tokens: 20` | `length` | leer | 58 Zeichen |
| `max_tokens: 500` | `length` | leer | 1635 Zeichen |
| `max_tokens: 8192` + `enable_thinking:false` | `stop` | `'Data loss'` | 0 |
| **`max_tokens: 20`** + `enable_thinking:false` | `stop` | `'Data loss'` | 0 |

Die letzte Zeile ist der Beweis: 20 Tokens genügen **ohne** Thinking für das, woran
500 Tokens **mit** Thinking scheitern. Mehr `max_tokens` ist deshalb die falsche
Reaktion — der Hebel ist `chat_template_kwargs: {enable_thinking: false}`.

## Betroffener Umfang

Maßgeblich ist **nicht** der Modellname, sondern wohin die Anfrage geht: der Proxy
`:18235` liefert ausschließlich Gemma, `deepseek-chat` läuft remote.

| Skript | Endpoint | Betroffen |
|---|---|---|
| `scripts/health-goals-llm-fill.sh` | `:18235` (Gemma), `max_tokens: 300` | **ja** |
| `scripts/factory/auto-triage.sh` | route-provider → Gemma, Flag nur für `*qwen*` | **ja** |
| `scripts/factory/scout-llm-fallback.sh` | Gemma, Flag gesetzt | nein — Vorlage |
| `scripts/mishap-categorize.sh` | `api.deepseek.com` | nein |
| `scripts/vda/release-notes.sh` | `api.deepseek.com` | nein |
| `scripts/plan-qa-check.sh` | `api.deepseek.com` | nein |
| `scripts/brain-ingest-transform.sh` | `:8093` (qwen3.6-fablevibes, läuft nicht) | anderes Backend |

### `health-goals-llm-fill.sh` ist der schwerere Fall

Das Skript liest nicht über `// empty`, sondern parst in Python:

```python
content = data['choices'][0]['message']['content']   # ''
parsed  = json.loads(content)                        # wirft
except Exception: print('PARSE_FAILED')              # → "unfillable (Parse-Fehler)"
```

Mit dem exakten Body reproduziert, beide Modell-Aliase:

```
model=bonsai        finish=length  content=''  reasoning=1071
model=gemma-4-12b   finish=length  content=''  reasoning=1067
```

Das ergibt eine **100-%-Fehlerquote**: jedes Health-Goal wird als „unfillable
(Parse-Fehler)" protokolliert, und das sieht aus wie eine ehrliche Messung. Relevant
für T002440, wo drei Familien als „fehlen belegt" geführt werden — ob sie unbelegbar
sind oder nur nie eine Antwort bekamen, kann dieses Skript derzeit nicht unterscheiden.

## Lösung

### Komponente 1 — `scripts/factory/auto-triage.sh`

Das Gate `[[ "$model" == *qwen* ]]` fragt das Falsche ab. Nicht der Modellname
entscheidet, ob Thinking das Budget frisst, sondern **ob das Modell lokal serviert
wird**: jedes lokale hybride Reasoning-Modell hat dasselbe Verhalten, und
`chat_template_kwargs` ist bei remote APIs ein unbekanntes Feld, das abgelehnt werden
kann. Das Routing liefert `baseUrl` bereits mit — das Gate stellt darauf um.

Damit der Body offline prüfbar wird, wandert seine Konstruktion in eine reine Funktion:

```
_build_triage_body <model> <base_url> <system> <user> <schema>   # JSON auf stdout
```

Keine DB-, Netz- oder Slot-Abhängigkeit. `_call_llm_inner` ruft sie auf.

### Komponente 2 — `scripts/health-goals-llm-fill.sh`

`'chat_template_kwargs': {'enable_thinking': False}` in den Python-Payload.
Zusätzlich `HG_PRINT_PAYLOAD=1`: gibt den Payload aus und beendet vor dem `curl`,
damit der Test ohne laufenden Server an ihn herankommt.

### Bewusst nicht Teil dieser Lösung

- **Kein zentraler Request-Helper.** Es bleiben zwei Aufrufer in zwei Sprachen
  (Bash, Python); eine Bash-Abstraktion hätte genau einen Nutzer.
- **Kein serverseitiges `reasoningBudget: 0`.** Das wirkt erst nach dem Merge von
  T002459 und nähme allen Konsumenten das Reasoning.
- **Kein Fail-Loud auf `finish_reason`.** Sinnvoll, aber eigener Vorgang — dieser
  Fix beseitigt die Ursache, nicht die Stille.

## Test

`tests/spec/llm-pipeline/gemma-thinking-budget.bats` — das Verzeichnis besteht bereits
(Konvention T002416: ein Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang).

Prüfmodus: **Ergebnis-basiert** (T002448-M4) — die Tests rufen die Funktion bzw. das
Skript auf und prüfen den erzeugten JSON-Body, nicht Muster im Quelltext.

| # | Fall | Erwartung |
|---|---|---|
| 1 | `_build_triage_body` mit lokaler `baseUrl` | `chat_template_kwargs.enable_thinking == false` |
| 2 | `_build_triage_body` mit remote `baseUrl` | Feld nicht vorhanden |
| 3 | `HG_PRINT_PAYLOAD=1` | Flag im Payload |

Fall 2 ist eine Negativ-Aussage und trägt deshalb im selben Test einen Positiv-Anker
(T002356-M1): erst wird geprüft, dass der lokale Fall das Feld **setzt** — fehlt die
Funktion, ist der Test rot, statt vakuos zu bestehen.

Kein Test benötigt einen laufenden Server; die Suite läuft offline in CI.

## Nicht im Scope, festgehalten

- **`loadouts.json` auf `feature/llama-stack-T002459`** übernimmt für
  `gemma-factory`/`gemma-multiagent` `cacheTypeK/V = q4_0`. Das ist der
  **ps1-Default**, nicht das überwachte Profil (`q8_0`, so läuft der Server live seit
  T002297). Der Skriptkopf von `start-gemma-server.ps1` schreibt q4_0 ausdrücklich zu,
  es degradiere „Tool-Call-Argumente". Der Cutover würde die Tool-Qualität also senken.
  Korrektur gehört auf jenen Branch, nicht hierher.
- **Build-Abstand:** der Fork `llama-bonsai-cuda13.3` steht auf b9603, die
  Upstream-Server (bge/rerank) auf b10090 — 487 Builds. Der Fork existiert
  ausschließlich wegen `--spec-type draft-mtp`.
- **Tool-Calling selbst ist intakt.** Sieben Pfade gemessen (Single-Turn,
  Multi-Turn-Rückfütterung, komplexes MCP-Schema mit `anyOf`/Integer-Enum/verschachtelt,
  30-Tool-Katalog, 20k-Kontext, Streaming, Default-Temperatur) — alle grün. Serverlog
  meldet `Chat format: peg-gemma4`; das Chat-Template ist der aktuelle
  Upstream-Unsloth-Stand. Bei Tool-Calls ist `content` allerdings immer leer, während
  `tool_calls` korrekt befüllt ist — dieselbe Mechanik wie oben.
