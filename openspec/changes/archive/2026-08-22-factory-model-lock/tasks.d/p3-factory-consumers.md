---
title: P3 — Factory-Konsumenten
ticket_id: T013144
domains: [factory, scripts]
status: implemented
---

# P3 — Factory-Konsumenten

## target_files

- `scripts/factory/lib.sh`
- `scripts/factory/route-provider.sh`
- `scripts/factory/dispatcher-bridge.sh`
- `scripts/factory/provider-register-local.sh`
- `scripts/factory/pipeline.mjs`

## Schritt 3.1 — Ein Leser in `lib.sh` (D5)

```bash
# T013144 — Das Factory-Pin aus dem llm-proxy. EIN Leser, nicht drei: drei Kopien
# derselben Regel laufen auseinander, und dann routet ein Teil der Factory anders
# als der Rest (dieselbe Klasse, die T002616 fuer die Konfliktregel und T003204
# fuer 'enabled' bereits einmal aufloesen musste).
#
# Fail-soft mit hartem Timeout: kein laufender Proxy heisst "kein Pin", nicht
# "Abbruch". Ein Gate, das die Factory anhaelt, weil ein Webinterface nicht
# laeuft, waere eine neue Ausfallquelle fuer ein Bedienkomfort-Feature.
#
# Ausgabe: "<model>\t<locked>" oder leer. locked ist "1" oder "0".
factory_model_pin() {
  local body
  body="$(curl -s -m 2 "http://127.0.0.1:${LLM_PROXY_PORT:-18235}/admin/factory" 2>/dev/null)" || return 0
  [[ -z "$body" ]] && return 0
  local model locked
  model="$(printf '%s' "$body" | jq -r '.model // empty' 2>/dev/null)" || return 0
  [[ -z "$model" ]] && return 0
  locked="$(printf '%s' "$body" | jq -r 'if .locked then "1" else "0" end' 2>/dev/null)"
  printf '%s\t%s\n' "$model" "${locked:-0}"
}
```

Die Pruefung `[[ -z "$model" ]]` steht **vor** der Benutzung, nicht danach: eine leere
Antwort ist kein Urteil ueber das Pin, sondern die Abwesenheit einer Antwort. Wer auf das
Fehlen eines Negativsignals prueft, baut den Fehler ein, den er verhindern will.

## Schritt 3.2 — Sperrzweig in `route-provider.sh`

Direkt nach `SOURCE`/`TIER`/`PHASE`, **vor** dem `opus`-Zweig:

```bash
# T013144 — Sperre schlaegt alles. Vor dem opus-Zweig, vor dem Phase-Pin, vor der
# Kandidatenkette: "gesperrt" heisst gesperrt, nicht "gesperrt, ausser die DB hat
# eine Meinung".
#
# KEIN SLOT-CLAIM: der Aufrufer bekommt slotId:null und hat damit keine
# Freigabepflicht — dieselbe Ueberlegung wie beim opus-Zweig, der genau deshalb
# ohne Claim laeuft. Ginge dieser Zweig durch die Claim-Schleife, stiege
# active_agents bei jedem Aufruf ohne je zu sinken.
PIN="$(factory_model_pin)"
if [[ -n "$PIN" ]]; then
  IFS=$'\t' read -r PIN_MODEL PIN_LOCKED <<< "$PIN"
  if [[ "$PIN_LOCKED" == "1" ]]; then
    # Eine Zeile auf stderr, weil dieser Zweig die Meldung "alle Kandidaten belegt"
    # nie erreicht — Ueberlast bliebe sonst unsichtbar (R2 im Design).
    echo "route-provider: Factory-Modell gesperrt auf '$PIN_MODEL' (source=$SOURCE tier=$TIER) — DB-Routing uebersprungen." >&2
    printf '{"provider":"llamacpp","modelId":"%s","baseUrl":"http://127.0.0.1:18235","slotId":null,"ctx":0,"apiKeyEnv":null,"emergency":false}\n' "$PIN_MODEL"
    exit 0
  fi
fi
```

Danach die beiden bestehenden Defaults so aendern, dass sie das ungesperrte Pin
beruecksichtigen — Datei schlaegt Env schlaegt Default (D4):

```bash
FACTORY_DEFAULT_MODEL="${PIN_MODEL:-${FACTORY_MODEL_ID:-gemma26-throughput}}"
```

und in `OPUS_FALLBACK` sowie im Emergency-`printf` `${FACTORY_MODEL_ID:-gemma26-throughput}`
durch `$FACTORY_DEFAULT_MODEL` ersetzen.

## Schritt 3.3 — `dispatcher-bridge.sh` (D6)

Vor dem Aufbau von `PIPELINE_PROMPT`:

```bash
# T013144 — pipeline.mjs liest NICHT selbst: die Workflow-Sandbox hat keinen
# verlaesslichen Netzzugriff und darf keinen brauchen. Der Bridge-Prozess startet
# den Lauf ohnehin, also setzt er die Umgebung.
PIN="$(factory_model_pin)"
if [[ -n "$PIN" ]]; then
  IFS=$'\t' read -r PIN_MODEL PIN_LOCKED <<< "$PIN"
  export FACTORY_MODEL_ID="$PIN_MODEL"
  if [[ "$PIN_LOCKED" == "1" ]]; then
    export FACTORY_MODEL_LOCKED=1
    # Der Tier-Pin ist die zweite Haelfte der Sperre: ohne ihn traegt der Prompt
    # weiterhin model_tier=sonnet, und ein Leser des Laufprotokolls glaubt, es
    # sei eskaliert worden.
    model_tier="flash"
    echo "dispatcher-bridge: Factory-Modell gesperrt auf '$PIN_MODEL' — tier auf flash gepinnt." >&2
  fi
fi
```

## Schritt 3.4 — `pipeline.mjs`

Zwei Aenderungen im `MODEL_TIERS`-Block:

```js
const LOCAL_MODEL_ID = process.env.FACTORY_MODEL_ID || 'gemma26-throughput'
```

Der Default wechselt von `'gemma26-factory'` auf `'gemma26-throughput'`. Grund: die vier
Default-Stellen sollen denselben Slug nennen — `factory-model-id-default.bats` verlangt das
ausdruecklich, greppt aber nur die beiden Shell-Dateien und uebersieht diese Zeile deshalb.
Die Drift, die der Guard verhindern soll, besteht also bereits. `gemma26-factory` ist
zusaetzlich genau der Name, der in T003538 als tot auffiel.

```js
// T013144 — Bei gesetzter Sperre ist die Leiter inert. args.model_tier wird
// ignoriert, nicht ueberschrieben: der Wert bleibt im Payload sichtbar, damit
// im Protokoll erkennbar ist, welcher Versuch das gewesen waere.
const FACTORY_MODEL = process.env.FACTORY_MODEL_LOCKED === '1'
  ? MODEL_TIERS.flash
  : (MODEL_TIERS[args?.model_tier] ?? MODEL_TIERS.flash)
```

## Schritt 3.5 — `provider-register-local.sh`

```bash
PIN="$(factory_model_pin)"; IFS=$'\t' read -r PIN_MODEL _ <<< "${PIN:-}"
MODEL_ID="${PIN_MODEL:-${FACTORY_MODEL_ID:-gemma26-throughput}}"
```

Die Datei sourced `lib.sh` bereits; kein zusaetzlicher Import noetig — vor dem Einbau
mit `grep -n 'lib.sh' scripts/factory/provider-register-local.sh` bestaetigen und, falls
nicht vorhanden, die `source`-Zeile aus `route-provider.sh` uebernehmen.
