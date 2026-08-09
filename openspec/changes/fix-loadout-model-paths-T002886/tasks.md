---
title: Loadout-Registry gegen die Platte richten
ticket_id: T002886
domains: [bachelorprojekt-ops, bachelorprojekt-infra]
status: plan_staged
plan_ref: openspec/changes/fix-loadout-model-paths-T002886/tasks.md
---

# Loadout-Registry gegen die Platte richten (T002886) — Implementation Plan

## File Structure

| Datei | Vorgang | S1-Budget |
|---|---|---|
| `scripts/llm/loadouts.json` | geaendert — Pfade, Betriebspunkte, zwei neue Loadouts, zwei entfernt | `.json` hat kein S1-Limit (Ist 419) |
| `tests/spec/local-llm-proxy/loadout-aux-files-exist.bats` | **neu** — Guard fuer mmproj/draft-Nebendateien | `.bats` hat kein S1-Limit (Ist 118) |
| `tests/spec/local-llm-proxy/loadout-model-files-exist.bats` | geaendert — Fehlerliste vor die Assertion | `.bats` hat kein S1-Limit (Ist 76) |
| `website/src/data/test-inventory.json` | regeneriert (CI-Gate vergleicht) | generiert, kein Budget |
| `openspec/changes/fix-loadout-model-paths-T002886/design.md` | **neu** — traegt das Wissen der entfernten Loadouts | Doku |

Die Betriebspunkte sind **nicht** in diesem Plan zu recherchieren: sie stehen belegt in `design.md`
(Messreihe 2026-08-09, llama.cpp b10241, jeder Punkt zweimal). Wer hier eine Zahl aendert, misst neu.

## Partials

**Ein Partial.** Der Fix haengt an einer einzigen Datei (`scripts/llm/loadouts.json`); die
Testaenderungen sind an sie gebunden, weil derselbe Guard sie verifiziert. Eine Aufteilung
brauchte disjunkte `target_files` und erzeugte hier nur einen Koordinationsaufwand ohne
Parallelitaetsgewinn — der Registry-Teil waere ohne den Testteil nicht abnehmbar.

| Partial | target_files |
|---|---|
| p1 | `scripts/llm/loadouts.json`, `tests/spec/local-llm-proxy/loadout-aux-files-exist.bats`, `tests/spec/local-llm-proxy/loadout-model-files-exist.bats`, `website/src/data/test-inventory.json` |

## Aufgaben

### 1. RED — der Guard fuer Nebendateien schlaegt fehl

Der Guard `tests/spec/local-llm-proxy/loadout-aux-files-exist.bats` prueft, was
`loadout-model-files-exist.bats` (T002753) auslaesst: `args.mmprojPath` und
`speculative.draftModelPath`. Genau dadurch stand in `gemma26-factory` ein `mmprojPath` auf
`gemma4/mmproj-F16.gguf`, den es nicht gibt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/loadout-aux-files-exist.bats
```

**expected: FAIL** — `not ok 2 … Nebendateien ohne Datei: gemma26-factory (mmprojPath)`.
Test 1 (Positiv-Anker) muss dabei **gruen** sein; ist er es nicht, misst der Guard nichts und
die Rot-Meldung waere wertlos.

Zusaetzlich ist der bestehende Guard bereits rot — auch das ist Ausgangszustand, nicht Regression:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/loadout-model-files-exist.bats
```

**expected: FAIL** — `not ok 1 … 'gptoss-context OK' failed`.

### 2. Registry gegen die Platte richten

In `scripts/llm/loadouts.json`:

- `gptoss-context` und `brain-ingest`: `model` auf `gptoss20/gpt-oss-20b-UD-Q4_K_XL.gguf`
  (11,87 GB, vorhanden). Die bisherige `gptoss20/gpt-oss-20b-Q8_0.gguf` existiert nicht.
- `gemma26-factory`: `model` auf `gemma4-26A4-it/gemma-4-26B-A4B-it-UD-IQ4_XS.gguf`
  (nur das Verzeichnis war falsch, die Datei stimmt).
- `gemma26-factory`: `args.mmprojPath` **entfernen**. Die Datei existiert nicht, und der
  `notes`-Text derselben Zeile sagt bereits „Kein mmproj: die vorhandene mmproj-F16.gguf gehoert
  zum 12B" — der Eintrag widersprach seiner eigenen Begruendung.

#### 2b. Betriebspunkte auf gemessene Werte setzen

Alle Werte aus `design.md`, nicht neu herleiten:

- `gptoss-context`: `fit.targetMarginMib` 2400 → **256**. Bei 2400 liefert q8_0 nur 119808 statt
  der vollen 131072 (Architekturmaximum). KV bleibt **q8_0** — q4_0 misst identisch, kauft also
  nichts und kostet nur die T002501-Degradation.
- `brain-ingest`: `fit.targetMarginMib` 2400 → **256**, KV bleibt q8_0. Bei `np=4` sind es
  32768 je Slot, in q4_0 wie q8_0 gleich.
- `gemma26-factory`: `fit.targetMarginMib` 128 → **64**. Gemessen bei `np=3` mit `-kvu`:
  166912 statt 148480 Kontext, Durchsatz unveraendert (130,0/132,1 tok/s). KV bleibt **q4_0** —
  hier ist der Gewinn real (+64 % gegenueber q8_0 mit 101888).
- `devstral-quality`: `cacheTypeK`/`cacheTypeV` von `null` (= f16) auf **q8_0**,
  `fit.targetMarginMib` 2400 → **64**. Ist-Zustand war 8192 Kontext bei 19,8/20,2 tok/s;
  danach 33536 bei 59,0/59,1. Die Marge allein verdreifacht den Durchsatz.
  **Nicht q4_0**, obwohl es 60416 braechte: es ist das Code-Loadout, und T002501 nennt als
  Ausfallmodus genau Pfade, Symbolnamen und Tool-Call-Argumente (Betreiberentscheid).

### 3. Die 12B-Luecke schliessen — Familientraeger umhaengen, tote Eintraege entfernen

`gemma4` (Port 8090) zeigt auf ein Gemma-4-12B, das auf keinem `modelRoot` liegt. Umhaengen auf
`gemma4-26A4-it/gemma-4-26B-A4B-it-UD-IQ4_XS.gguf`, KV **q4_0**, `targetMarginMib` **64**
(gemessen: 177920 Kontext, 126,8/125,8 tok/s bei `np=1`). Thinking bleibt aktiv — das war der
erklaerte Unterschied zum Eval-Paar und bleibt es.

`gemma4` steht bereits in `_KV_Q4_ALLOWED`? **Nein** — pruefen. Ist es nicht gelistet, faellt der
Guard `gemma-kv-quant.bats`. Dann entweder Eintrag mit Begruendung ergaenzen (Messwerte oben) oder
auf q8_0 gehen (115968 Kontext). Diese Entscheidung gehoert in den PR-Text, nicht stillschweigend
in die Liste.

#### 3b. Die zwei unaufloesbaren 12B-Loadouts entfernen

`gemma4-base` und `gemma4-tuned` aus `loadouts.json` loeschen. Begruendung und das bewahrenswerte
Wissen aus ihren `notes` (Eval-Paar-Kontrakt T002634, die `clar-01-de`-Endlosschleife, warum
Q4_K_M statt UD-Q4_K_XL, warum MTP dort bewusst aus war) stehen in `design.md` → „Die
12B-Loadouts werden entfernt, ihr Wissen bleibt hier". Ohne diese Uebernahme geht es verloren.

### 4. Zwei Loadouts aufnehmen

**`gemma26-throughput`** auf `gemma4-26A4-qat/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf`,
KV q4_0, `targetMarginMib` 64, `exclusiveGroup: chat-gpu`. Gemessen 118016 Kontext bei
158,7/168,6 tok/s — rund 30 % mehr Durchsatz als `gemma4` (IQ4_XS) gegen 34 % weniger Fenster.
Ursache ist die Quant-Familie, nicht das Training. Auch dieses Loadout braucht einen
`_KV_Q4_ALLOWED`-Eintrag oder q8_0.

**`gemma12-vision`** auf `gemma4-12qat/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` mit:
- `args.mmprojPath`: `gemma4-12qat/mmproj-F16.gguf` (175 MB)
- `speculative.draftModelPath`: `gemma4-12qat/mtp-gemma-4-12B-it.gguf` (254 MB)
- `speculative.specType`: `draft-mtp`, `draftNMax`: 4
- KV **q8_0**, `targetMarginMib` 256
- Sampling nach Modellkarte: `temperature` 1.0, `topP` 0.95, `topK` 64

Gemessen: **262144 Kontext** (Architekturmaximum), 137–149 tok/s Prosa gegen 92 ohne MTP,
Vision-Funktionstest bestanden. q8_0 erreicht denselben Maximalkontext wie q4_0 bei gleichem
Durchsatz und laesst 3,8 GB frei — 4-bit kauft hier nichts.

**Vorbedingung:** `runner.mjs` muss `speculative.specType` in `--spec-type` uebersetzen. Prueft der
Implementierer per `buildServerArgv`-Ausgabe; fehlt die Uebersetzung, ist sie zu ergaenzen — ohne
sie laedt der Head und tut nichts (Default ist `none`, genau der gemessene Nullfall).

### 5. Sampling fuer `qwen3-coder-30b` nachtragen

Das Loadout setzt keine Sampling-Parameter, es gelten die llama.cpp-Defaults (temp 0.8, top-k 40).
Die Modellkarte nennt `temperature` 0.7, `topP` 0.8, `topK` 20, `repetitionPenalty` 1.05.
Dieselbe Luecke hat T002579 fuer die Gemma-Loadouts geschlossen; hier war sie offen.
Traegt `runner.mjs` kein `repetitionPenalty`-Feld, werden die drei uebrigen gesetzt und das
fehlende im PR-Text vermerkt — kein stilles Weglassen.

### 6. Fehlerliste vor die Assertion ziehen

In `tests/spec/local-llm-proxy/loadout-model-files-exist.bats` scheitert der Test heute am
Positiv-Anker (Zeile 54) und erreicht die Diagnosezeile nie. Ein roter Lauf meldet dadurch
`'gptoss-context OK' failed` statt der Liste der fehlenden Loadouts. Die `echo`-Ausgabe der
`missing`-Liste vor den Anker ziehen, damit ein Rotlauf sagt, **was** fehlt.

Verhalten sonst unveraendert: der Anker bleibt bestehen und bleibt an `gptoss-context`.

### 7. Verifikation

```bash
# Guards, beide Formen erfassen (T002696)
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*

# Test-Inventory regenerieren (CI vergleicht gegen die committete Fassung)
task test:inventory

# Registry-Format und KV-Guard
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/loadouts-format.bats
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/gemma-kv-quant.bats

# Output-Verifikation statt Konfigurationslektuere (T002448-M4):
# jedes geaenderte GPU-Loadout startet und liefert toolCallOk.
# exclusiveGroup chat-gpu heisst: eines nach dem anderen, mit stop dazwischen.
for slug in gptoss-context devstral-quality gemma26-factory gemma4 gemma26-throughput gemma12-vision; do
  curl -s -X POST "http://127.0.0.1:18235/admin/loadouts/${slug}/start" -m 400 \
    | jq -c "{\"$slug\": {ctx: .chosen.ctx, toolCallOk}}"
  curl -s -X POST "http://127.0.0.1:18235/admin/loadouts/${slug}/stop" -m 120 > /dev/null
done

task test:changed
task freshness:regenerate
task freshness:check
```

**Abnahme:** `loadout-model-files-exist.bats` und `loadout-aux-files-exist.bats` sind **gruen**
(beide heute rot), `gemma-kv-quant.bats` und `loadouts-format.bats` bleiben gruen, und jedes
gestartete Loadout meldet `toolCallOk: true` mit einem `ctx`, der zum Wert in `design.md` passt.
Weicht ein `ctx` deutlich ab, war die Karte beim Start nicht frei — `--fit` dimensioniert einmalig
(waehrend der Messreihe real passiert: `qwen3-coder` kam mit 78592 statt 96000 hoch). Dann Karte
freimachen und erneut starten, nicht die Zahl im Plan anpassen.
