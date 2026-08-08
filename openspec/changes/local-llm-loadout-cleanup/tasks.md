---
title: "Lokale Loadouts ohne Gewichte entfernen, gemma26/qwen mit gemessenem Kontext verdrahten"
ticket_id: T002753
domains: [bachelorprojekt-ops, bachelorprojekt-test]
status: plan_staged
---

# local-llm-loadout-cleanup — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
| `scripts/llm/loadouts.json` | 490 | kein S1-Limit für `.json` |
| `scripts/llm/templates/gemma4-26b-tools.jinja` | 402 | kein S1-Limit für `.jinja` |
| `.opencode/agent-models.jsonc` | 453 | kein S1-Limit für `.jsonc` |
| `tests/spec/local-llm-proxy/loadout-model-files-exist.bats` | 69 | kein S1-Limit für `.bats` |
| `tests/spec/local-llm-proxy/gemma-kv-quant.bats` | 272 | kein S1-Limit für `.bats` |
| `tests/spec/llm-local-dev.bats` | 206 | kein S1-Limit für `.bats` |
| `scripts/llm-proxy/exclusive-conflict.test.mjs` | 77 | 723 |
| `website/src/data/test-inventory.json` | generiert | kein S1-Limit für `.json` |

`scripts/llm-proxy/exclusive-conflict.test.mjs` ist die einzige Datei unter S1
(`.mjs`-Limit 800, nicht gebaselined). Die anderen Endungen führt `gates.yaml` in
`s1.limits` nicht, sie sind damit nicht zeilengegated. Die Änderung an der `.mjs` entfernt
Fixture-Zeilen und wächst nicht.

## Partials

| ID | Rolle | Zieldateien |
|----|-------|-------------|
| p1 | ops | `scripts/llm/loadouts.json`, `scripts/llm/templates/gemma4-26b-tools.jinja` |
| p2 | ops | `.opencode/agent-models.jsonc` |
| p3 | tests | `tests/spec/local-llm-proxy/loadout-model-files-exist.bats`, `tests/spec/local-llm-proxy/gemma-kv-quant.bats`, `tests/spec/llm-local-dev.bats`, `scripts/llm-proxy/exclusive-conflict.test.mjs`, `website/src/data/test-inventory.json` |

Die Zieldateien sind disjunkt (D1). p3 ist die Tests-Rolle und trägt den Failing-Test-Step.

---

## Task 1 — Failing Test: kein Loadout ohne Modelldatei (p3)

Der Guard ruft die kanonische Auflösung auf und wertet ihr Ergebnis aus, statt Modellpfade
im JSON zu greppen (Output-Verifikation, T002448-M4). Ein Pfad im JSON belegt nur, dass Text
da ist — genau diese Lücke ließ die gewichtslosen Loadouts seit dem 2026-08-03 unbemerkt
stehen.

Die Datei existiert bereits im Branch. Dieser Schritt weist ihren roten Zustand nach, bevor
Task 2 die Ursache beseitigt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/loadout-model-files-exist.bats
# expected: FAIL — "Loadouts ohne Modelldatei: gemma-factory gemma-multiagent gemma9-factory"
```

Der zweite `@test` der Datei muss im selben Lauf **grün** sein. Er schickt ein garantiert
nicht existierendes Loadout durch `resolveModelPath()` und verlangt `MISSING`. Ohne ihn
bliebe offen, ob der rote Test die Sache trifft oder nur das Prüfmittel kaputt ist.

Ebenso Pflicht ist der Positiv-Anker im ersten `@test` (T002356-M1): er verlangt mindestens
ein aufgelöstes Loadout und namentlich `gptoss-context OK`. Fehlt er, bestünde der Test
vakuos, sobald die Auflösung gar nichts mehr liefert — „0 fehlende in einer leeren Liste"
ist trivial wahr.

## Task 2 — Gewichtslose Loadouts entfernen (p1)

Aus `scripts/llm/loadouts.json` die Einträge `gemma9-factory`, `gemma-factory` und
`gemma-multiagent` streichen. Prüfen, dass die Datei danach gültiges JSON ist
(`jq empty scripts/llm/loadouts.json`).

`gemma9-factory` nimmt seine `--override-kv gemma2.context_length=int:98304` mit. Der Wert
streckte den Kontext auf das Zwölffache des trainierten Bereichs; belegt aus
`unsloth/gemma-2-9b-it/config.json` mit `max_position_embeddings: 8192` und unskaliertem
`rope_theta: 10000.0`.

Nach dem Entfernen muss Task 1 grün laufen — das ist die Grün-Hälfte des Rot-Grün-Paares.

## Task 3 — gemma26-factory auf den gemessenen Betriebspunkt (p1)

Im Loadout `gemma26-factory` setzen:

- `model` auf `gemma4/gemma-4-26B-A4B-it-UD-IQ4_XS.gguf`
- `fit.targetMarginMib` auf `128`
- `args.mmprojPath` auf die mmproj-Datei des 26B-Repos, damit `gemma26-vision` seinem Namen
  entspricht. Die Datei ist vorher zu beschaffen:
  `hf download unsloth/gemma-4-26B-A4B-it-GGUF mmproj-F16.gguf --local-dir ~/models/gguf/gemma4`
- `extraArgs` um `--chat-template-file` auf `scripts/llm/templates/gemma4-26b-tools.jinja`
  ergänzen

Die Marge 128 ist gemessen, nicht geschätzt: zwischen 256 und 128 sind die tok/s
ununterscheidbar (100,2 / 100,3 gegen 104,3 / 97,6), 128 bringt 8448 Kontext umsonst; erst
64 fällt klar ab (84,3 / 84,3). Nach dem Laden der mmproj sinkt der erreichte Kontext um
deren VRAM-Bedarf — der neue Wert ist zu messen und in `limit.context` (Task 5) einzutragen,
nicht aus dieser Messreihe zu übernehmen.

## Task 4 — qwen3-coder-30b auf q4_0 mit Ausnahme-Eintrag (p1, p3)

Im Loadout `qwen3-coder-30b` `fit.targetMarginMib` auf `64` und `args.cacheTypeK`/
`cacheTypeV` auf `q4_0` setzen (gemessen: 96000 ctx / 177,4 tok/s).

In `tests/spec/local-llm-proxy/gemma-kv-quant.bats` `qwen3-coder-30b` in die Liste
`_KV_Q4_ALLOWED` aufnehmen und `gemma9-factory` daraus entfernen. Der Kommentarblock über
der Liste führt je Ausnahme ihre Begründung; für qwen ist einzutragen, dass sie **gegen**
den T002501-Befund vom 2026-08-08 gesetzt wurde (39k Tokens, temperature 0: Symbole
vertauscht, Pfade verwechselt, Tool-Call-Argument nicht wortgetreu) und auf ausdrückliche
Betreiber-Anweisung beruht, nicht auf einer bestandenen Probe.

Der Positiv-Anker-Test „die q4_0-Ausnahme ist wirksam und nicht bloss deklariert" prüft, dass
ein Loadout der Ausnahmeliste tatsächlich auf `q4_0` steht. Er darf nach dem Entfernen von
`gemma9-factory` nicht auf einen verschwundenen Slug zeigen — er ist auf `gemma26-factory`
oder `qwen3-coder-30b` zu richten.

## Task 5 — opencode-Agenten auf die überlebenden Loadouts (p2)

In `.opencode/agent-models.jsonc`:

- Unter `llamacpp-local` einen Modelleintrag `gemma26-factory` anlegen; `limit.context` auf
  den in Task 3 gemessenen Wert setzen, mit Messdatum im Kommentar.
- `limit.context` von `qwen3-coder-30b` von `32768` auf den gemessenen Wert aus Task 4 heben.
- `gemma26-primary` und `gemma26-vision` von `llamacpp-local/gptoss-context` auf
  `llamacpp-local/gemma26-factory` umhängen.
- Subagent `gemma` von `llamacpp-local/gemma4` auf `llamacpp-local/gemma26-factory` umhängen.
- Die Beschreibung von `gemma26-vision` korrigieren: sie sagt heute „Vision is NOT available",
  was nach Task 3 nicht mehr zutrifft.
- Den Kommentar bei `gemma26-primary`, der die Modellwahl mit „gpt-oss-20b, 105472 ctx"
  begründet, auf das neue Modell umschreiben.

Der Eintrag `gemma4` (12B, Port 8090) bleibt bestehen — seine Gewichte sind vorhanden, und
das Eval-Paar aus T002634 nutzt dieselbe Datei.

## Task 6 — Fixtures und Restreferenzen (p3)

`gemma9-factory` aus `scripts/llm-proxy/exclusive-conflict.test.mjs` (Fixture `DOC` und die
Assertions, die den Slug als Konfliktpartner nennen) und aus `tests/spec/llm-local-dev.bats`
entfernen. Als Konfliktpartner in den Fixtures ist ein Slug zu verwenden, der nach Task 2
noch existiert.

Die Fixtures dürfen nicht bloß umbenannt werden: die Assertions prüfen den
`conflictSlug`-Rückgabewert, also muss der Ersatz-Slug auch in der Fixture-`DOC` mit
`exclusiveGroup: 'chat-gpu'` stehen, sonst prüft der Test eine andere Sache als vorher.

```bash
node --test scripts/llm-proxy/exclusive-conflict.test.mjs
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats
```

Der zweite Pfad oben ist bewusst gegen `tests/spec/llm-local-dev.bats` zu führen; der Runner
erfasst mit `-r` beide Konventionsformen (Sammeldatei und Verzeichnis, T002416).

## Task 7 — Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats
node --test scripts/llm-proxy/*.test.mjs
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```

`task test:inventory` ist Pflicht, weil dieser Change eine neue Testdatei anlegt — CI
vergleicht `website/src/data/test-inventory.json` gegen die neu erzeugte Fassung und failt
bei Abweichung.

Erwartet fehlschlagend bleibt `scripts/llm-proxy/mcp-bridge.test.mjs`: es ist ein
Vitest-Test, der unter `node --test` an `vi.queueMock()` scheitert. Der Zustand ist
vorbestehend und gegen `main` gegengeprüft — er gehört nicht zu diesem Change und ist nicht
hier zu beheben.

Abschließend ein Startnachweis mit der realen Loadout-Konfiguration: `llama-server` mit den
Argumenten aus `gemma26-factory` starten, `n_ctx_slot` aus dem Log lesen und einen
Tool-Call-Request absetzen. Der zurückgegebene `tool_calls[0].function` muss Name und
Argument wortgetreu tragen — das prüft Template und Modell gemeinsam, was kein Unittest
abdeckt.
