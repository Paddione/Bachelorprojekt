---
title: "gemma-thinking-budget — Implementation Plan"
ticket_id: T002501
domains: [factory, scripts, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gemma-thinking-budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei Aufrufer des lokalen Gemma-Servers setzen `enable_thinking:false`, damit
`content` nicht leer bleibt, weil Thinking das `max_tokens`-Budget aufbraucht.

**Architecture:** Beide Request-Bauer wandern in eigene, direkt aufrufbare Dateien —
`scripts/factory/triage-body.sh` (sourcebar) und `scripts/health-goals-payload.py`
(argv + stdin). Nur so kommt ein Offline-Test an ihr Ergebnis: `auto-triage.sh` hat
keinen Sourcing-Guard, und der health-goals-Payload steckte in einem inline `python3 -c`
mitten in der Kandidaten-Schleife. Das Gate für das Flag hängt am **Ziel** (lokal
serviert ja/nein), nicht am Modellnamen.

**Tech Stack:** Bash, `jq`, Python 3, BATS (vendored unter `tests/unit/lib/bats-core/`).

Design: `docs/superpowers/specs/2026-08-01-gemma-thinking-budget-design.md`

_Ticket: T002501_

## Global Constraints

- Prüfmodus ist **ergebnis-basiert** (T002448-M4): Tests rufen die Bauer auf und prüfen
  das erzeugte JSON. Kein `grep` auf Script-Interna.
- BATS-Runner ist **`tests/unit/lib/bats-core/bin/bats`** (vendored), nicht `which bats`.
- Syntax-Check für `.bats` ist **`bats --count`**, niemals `bash -n` (T002351-M2).
- Gültige Commit-Scopes: `factory`, `scripts`, `ops`, `test`, `docs`, `plans` u. a.
  (`bash scripts/validate-commit-msg.sh scopes`).
- Der Prompt-Text in `health-goals-payload.py` bleibt **wörtlich** unverändert — er ist
  Teil des Vertrags mit dem Modell.
- S1-Limit ist 800 Zeilen pro Datei. Beide geänderten Skripte **schrumpfen**.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/factory/triage-body.sh` | 0 (neu) | n/a (neue Datei, Limit 800) |
| `scripts/factory/auto-triage.sh` | 451 | 349 (Block wandert raus, wird kleiner) |
| `scripts/health-goals-payload.py` | 0 (neu) | n/a (neue Datei, Limit 800) |
| `scripts/health-goals-llm-fill.sh` | 299 | 501 (Block wandert raus, wird kleiner) |
| `tests/spec/llm-pipeline/gemma-thinking-budget.bats` | 104 | 696 (RED-Test, bereits geschrieben) |

---

## Task 1: Triage-Body-Bauer herausziehen und das Gate umstellen

**Files:**
- Create: `scripts/factory/triage-body.sh`
- Modify: `scripts/factory/auto-triage.sh:318-334`
- Test: `tests/spec/llm-pipeline/gemma-thinking-budget.bats`

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: `_build_triage_body <model> <base_url> <system> <user> <schema_json>` —
  schreibt den OpenAI-kompatiblen Request-Body als JSON auf stdout, Rückgabe 0.
  `<schema_json>` ist das fertige `json_schema`-Objekt als JSON-String.

- [ ] **Step 1: Den vorhandenen RED-Test laufen lassen**

Der Test ist bereits geschrieben. Vor jeder Änderung bestätigen, dass er rot ist.

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/gemma-thinking-budget.bats`
Expected: FAIL — die ersten vier Fälle scheitern an `scripts/factory/triage-body.sh:
No such file or directory`.

- [ ] **Step 2: `scripts/factory/triage-body.sh` anlegen**

```bash
#!/usr/bin/env bash
# scripts/factory/triage-body.sh — Request-Body fuer die KI-Triage [T002501]
#
# Bewusst eine eigene, SOURCEBARE Datei ohne Seiteneffekte: auto-triage.sh hat
# keinen Sourcing-Guard. Argument-Parsing und die BRAND-Pflicht laufen dort beim
# Sourcen sofort los, danach folgt der DB-Zugriff — die Funktion waere aus einem
# Offline-Test nicht erreichbar. Hier gibt es nur die Definition.

# _is_local_llm_url <base_url>
# Wahr, wenn die URL auf diesen Host zeigt. Das ist das richtige Kriterium fuer
# das Thinking-Gate: nicht der Modellname entscheidet, sondern ob lokal serviert
# wird. Jedes lokal servierte hybride Reasoning-Modell verbrennt max_tokens im
# reasoning_content, bevor content beginnt — Gemma 4 genauso wie Qwen3. Und
# umgekehrt ist chat_template_kwargs bei remote APIs ein UNBEKANNTES Feld, das
# abgelehnt werden kann; es dort mitzuschicken waere ein neuer Fehler.
_is_local_llm_url() {
  case "${1:-}" in
    http://127.0.0.1[:/]*|http://127.0.0.1|\
    http://localhost[:/]*|http://localhost|\
    http://0.0.0.0[:/]*|http://0.0.0.0|\
    http://[::1][:/]*) return 0 ;;
    *) return 1 ;;
  esac
}

# _build_triage_body <model> <base_url> <system> <user> <schema_json>
_build_triage_body() {
  local model="$1" base_url="$2" system_prompt="$3" user_prompt="$4" schema="$5"
  local thinking_off=false
  _is_local_llm_url "$base_url" && thinking_off=true

  # response_format json_schema (nicht json_object): llama.cpp und LM Studio
  # constrainen damit schon beim Sampling auf die enum-gueltigen Werte, statt
  # erst hinterher in validate_triage() zu pruefen.
  jq -n \
    --arg model "$model" \
    --arg sys "$system_prompt" \
    --arg user "$user_prompt" \
    --argjson schema "$schema" \
    --argjson thinking_off "$thinking_off" \
    '{
      model: $model,
      messages: [
        {role: "system", content: $sys},
        {role: "user", content: $user}
      ],
      temperature: 0.2,
      max_tokens: 512,
      response_format: {type: "json_schema", json_schema: $schema}
    }
    + (if $thinking_off then {chat_template_kwargs: {enable_thinking: false}} else {} end)'
}
```

- [ ] **Step 3: Die vier Triage-Fälle laufen lassen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/gemma-thinking-budget.bats`
Expected: PASS für die Fälle 1–4 („triage body …"). Die beiden `health-goals`-Fälle
bleiben rot — sie sind Task 2.

- [ ] **Step 4: `auto-triage.sh` auf den Bauer umstellen**

`scripts/factory/auto-triage.sh` Zeile 19 — nach `source "$HERE/lib.sh"` ergänzen:

```bash
source "$HERE/triage-body.sh"
```

Danach den `jq -n`-Block in Zeile 318–334 vollständig ersetzen durch:

```bash
  _build_triage_body "$model" "$base_url" "$system_prompt" "$user_prompt" "$schema" > "$tmp_req"
```

`base_url` ist an dieser Stelle bereits als lokale Variable vorhanden (aus
`route-provider`). `LAST_MODEL_USED`, das Slot-Handling und die `apiKeyEnv`-Logik
bleiben unberührt.

- [ ] **Step 5: Syntax und Umfang prüfen**

Run: `bash -n scripts/factory/auto-triage.sh && bash -n scripts/factory/triage-body.sh && wc -l scripts/factory/auto-triage.sh`
Expected: kein Syntaxfehler; `auto-triage.sh` unter 451 Zeilen.

- [ ] **Step 6: Commit**

```bash
git add scripts/factory/triage-body.sh scripts/factory/auto-triage.sh
git commit -m "fix(factory): Thinking-Gate an lokaler baseUrl statt am Modellnamen [T002501]"
```

---

## Task 2: Health-Goals-Payload herausziehen und Flag setzen

**Files:**
- Create: `scripts/health-goals-payload.py`
- Modify: `scripts/health-goals-llm-fill.sh:168-184`
- Test: `tests/spec/llm-pipeline/gemma-thinking-budget.bats`

**Interfaces:**
- Consumes: nichts aus Task 1 — die beiden Komponenten sind unabhängig.
- Produces: `python3 scripts/health-goals-payload.py <model> <gid>` — liest den Kontext
  von stdin, schreibt den Payload als JSON auf stdout, Rückgabe 0.

- [ ] **Step 1: Die beiden health-goals-Fälle als rot bestätigen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/gemma-thinking-budget.bats --filter 'health-goals'`
Expected: FAIL — `python3: can't open file '…/scripts/health-goals-payload.py'`.

- [ ] **Step 2: `scripts/health-goals-payload.py` anlegen**

Der Prompt-Text ist wörtlich aus dem bisherigen inline-Block übernommen. Modell und
Goal-ID kommen jetzt über `argv` statt über Shell-Interpolation in den Python-Quelltext
— dadurch kann ein Anführungszeichen in einer Goal-ID den Code nicht mehr zerlegen.

```python
#!/usr/bin/env python3
"""Baut den Request-Payload fuer health-goals-llm-fill.sh [T002501].

Usage: python3 health-goals-payload.py <model> <gid>   # Kontext auf stdin

Eigene Datei statt inline `python3 -c`: der Payload lag mitten in der
Kandidaten-Schleife und war ohne goals.md, ohne Kontext und ohne laufenden
Server nicht erreichbar — also auch nicht offline testbar.
"""
import json
import sys


def build_payload(model: str, gid: str, context: str) -> dict:
    prompt = (
        f'Du bekommst ein Health-Goal aus .claude/lib/goals.md. Liefere eine '
        f'strukturierte Bewertung als JSON. Goal-ID: {gid}. Kontext: {context}. '
        f'Antworte NUR als JSON: {{"id":"{gid}","value":"<aktueller Wert>",'
        f'"unit":"<Einheit>","confidence":0.0,"evidence":"<Begründung>",'
        f'"reproducible_cmd_suggestion":"<reproduzierbarer Messbefehl>"}}'
    )
    return {
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
        'response_format': {'type': 'json_object'},
        'max_tokens': 300,
        # Ohne dies bleibt content LEER, bis das Denken fertig ist. Gemessen am
        # laufenden Server: bei max_tokens 300 gehen ~1070 Zeichen ins
        # reasoning_content, content bleibt '', finish_reason ist 'length'.
        # Das Skript parst das leere content dann als JSON, faengt die Exception
        # und protokolliert JEDES Goal als "unfillable (Parse-Fehler)" — eine
        # 100-Prozent-Fehlerquote, die wie eine ehrliche Messung aussieht.
        'chat_template_kwargs': {'enable_thinking': False},
    }


def main() -> int:
    if len(sys.argv) != 3:
        print('usage: health-goals-payload.py <model> <gid>', file=sys.stderr)
        return 2
    context = sys.stdin.read().strip()
    print(json.dumps(build_payload(sys.argv[1], sys.argv[2], context)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 3: `health-goals-llm-fill.sh` auf die Datei umstellen**

`scripts/health-goals-llm-fill.sh` Zeile 168–184 (von `  JSON_PAYLOAD=$(python3 -c "`
bis `" <<< "$CONTEXT_AND_EXISTING")`) vollständig ersetzen durch:

```bash
  JSON_PAYLOAD=$(python3 "$(dirname "${BASH_SOURCE[0]}")/health-goals-payload.py" \
    "$LLM_MODEL" "$gid" <<< "$CONTEXT_AND_EXISTING")
```

- [ ] **Step 4: Beide health-goals-Fälle laufen lassen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/gemma-thinking-budget.bats`
Expected: PASS — alle sechs Fälle grün.

- [ ] **Step 5: Syntax und Umfang prüfen**

Run: `bash -n scripts/health-goals-llm-fill.sh && python3 -c 'import ast,sys; ast.parse(open("scripts/health-goals-payload.py").read())' && wc -l scripts/health-goals-llm-fill.sh`
Expected: kein Syntaxfehler; `health-goals-llm-fill.sh` unter 299 Zeilen.

- [ ] **Step 6: Commit**

```bash
git add scripts/health-goals-payload.py scripts/health-goals-llm-fill.sh
git commit -m "fix(scripts): health-goals-Payload ohne Thinking, Bauer herausgezogen [T002501]"
```

---

## Task 3: Verifikation

**Files:**
- Modify: keine — dieser Task prüft nur.
- Test: `tests/spec/llm-pipeline/gemma-thinking-budget.bats`

**Interfaces:**
- Consumes: `_build_triage_body` aus Task 1, `health-goals-payload.py` aus Task 2.
- Produces: nichts.

- [ ] **Step 1: Die volle Spec-Suite laufen lassen**

Der neue Bauer wird von `auto-triage.sh` gesourced — angrenzende Factory-Tests müssen
mitlaufen, nicht nur die neue Datei.

Run: `tests/unit/lib/bats-core/bin/bats -r tests/spec/llm-pipeline/`
Expected: PASS

- [ ] **Step 2: Geänderte Tests und Freshness**

Run: `task test:changed`
Expected: PASS

Run: `task freshness:regenerate`
Expected: keine Fehler; erzeugte Dateien anschließend committen, falls sie sich ändern.

Run: `task freshness:check`
Expected: PASS

- [ ] **Step 3: Gegenprobe am laufenden Server**

Nur ausführen, wenn `:18235` erreichbar ist. Belegt, dass der Fix in der Realität wirkt
und nicht nur im Body-JSON.

```bash
curl -s --max-time 60 http://localhost:18235/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d "$(echo 'Kontext' | python3 scripts/health-goals-payload.py bonsai G-DORA03)" \
  | jq -r '.choices[0] | "finish=\(.finish_reason) content_len=\(.message.content | length)"'
```

Expected: `finish=stop` mit `content_len` größer 0. Vor dem Fix lieferte derselbe
Aufruf `finish=length` und `content_len=0`.

- [ ] **Step 4: Commit etwaiger Freshness-Artefakte**

```bash
git status --porcelain
git add -A && git commit -m "chore(scripts): Freshness-Artefakte nach T002501" || true
```
