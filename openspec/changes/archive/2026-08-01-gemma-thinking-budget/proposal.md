---
title: "Gemma-Thinking verbraucht das max_tokens-Budget"
domains: [factory, scripts, test]
ticket_id: T002501
status: active
parent_feature: null
---

# gemma-thinking-budget

**Ticket:** T002501

## Problem

Der lokale Gemma-Server (`:8091`, via llm-proxy `:18235`) läuft mit `thinking = 1`.
Er schreibt zuerst nach `reasoning_content`; `choices[0].message.content` bleibt **leer**,
bis das Denken abgeschlossen ist. Ist `max_tokens` vorher erschöpft, kommt
`finish_reason=length` mit leerem `content` zurück — ohne Fehler, ohne Log-Eintrag,
mit HTTP 200.

Gemessen am laufenden Server, identischer Prompt, `temperature: 0`:

| Aufruf | `finish_reason` | `content` | `reasoning_content` |
|---|---|---|---|
| `max_tokens: 20` | `length` | leer | 58 Zeichen |
| `max_tokens: 500` | `length` | leer | 1635 Zeichen |
| `max_tokens: 8192` + `enable_thinking:false` | `stop` | `'Data loss'` | 0 |
| **`max_tokens: 20`** + `enable_thinking:false` | `stop` | `'Data loss'` | 0 |

Die letzte Zeile ist der Beweis: 20 Tokens genügen **ohne** Thinking für das, woran
500 Tokens **mit** Thinking scheitern. Mehr `max_tokens` ist die falsche Reaktion.

Zwei Konsumenten sind betroffen — maßgeblich ist nicht der Modellname, sondern das Ziel
(der Proxy `:18235` liefert ausschließlich Gemma, `deepseek-chat` läuft remote):

- `scripts/factory/auto-triage.sh` setzt das Flag nur für `*qwen*`; Gemma fällt seit dem
  Factory-Cutover durch das Raster.
- `scripts/health-goals-llm-fill.sh` parst die leere Antwort als JSON, fängt die Exception
  und protokolliert **jedes** Health-Goal als „unfillable (Parse-Fehler)" — eine
  100-%-Fehlerquote, die wie eine ehrliche Messung aussieht.

## Lösung

Das Gate hängt künftig an der **baseUrl** statt am Modellnamen: jedes lokal servierte
hybride Reasoning-Modell hat dasselbe Verhalten, und `chat_template_kwargs` ist bei remote
APIs ein unbekanntes Feld, das abgelehnt werden kann.

Beide Request-Bauer wandern in eigene, direkt aufrufbare Dateien
(`scripts/factory/triage-body.sh`, `scripts/health-goals-payload.py`). Das ist keine
Kosmetik: `auto-triage.sh` hat keinen Sourcing-Guard, und der health-goals-Payload steckte
in einem inline `python3 -c` mitten in der Kandidaten-Schleife — beide waren offline nicht
prüfbar.

## Abgrenzung

Das Tool-Calling selbst ist **intakt** und nicht Gegenstand dieser Änderung. Sieben Pfade
gemessen (Single-Turn, Multi-Turn-Rückfütterung, komplexes MCP-Schema, 30-Tool-Katalog,
20k-Kontext, Streaming, Default-Temperatur) — alle grün; das Serverlog meldet
`Chat format: peg-gemma4`.

Nicht angefasst: `mishap-categorize.sh`, `vda/release-notes.sh`, `plan-qa-check.sh`
(alle remote `deepseek-chat`), `brain-ingest-transform.sh` (anderes Backend),
`scout-llm-fallback.sh` (setzt das Flag bereits korrekt und diente als Vorlage).

Bewusst kein zentraler Request-Helper: es bleiben zwei Aufrufer in zwei Sprachen, eine
Bash-Abstraktion hätte genau einen Nutzer. Bewusst kein serverseitiges `reasoningBudget: 0`:
das wirkt erst nach dem Merge von T002459 und nähme allen Konsumenten das Reasoning.
