---
title: "llama-stack P5 — Tests: Loadout-Schema, argv/Autorestart, Auto-Start-Queue, BATS-Abdeckung"
ticket_id: T002459
domains: [test]
status: plan_staged
file_locks: [scripts/llm-proxy/loadouts.test.mjs, scripts/llm-proxy/runner.test.mjs, scripts/llm-proxy/server.test.mjs, tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [p1, p2, p3]
---

# llama-stack — Implementation Plan

Partial **P5 — Tests**. Scope: ausschließlich Testdateien plus das generierte Test-Inventar.
Kein Produktionscode: `loadouts.json`/`loadouts.mjs` gehören zu P1, `runner.mjs` zu P2,
`server.mjs` zu P3, die `.ps1`-Dateien zu P4.

Dieses Partial trägt den rot→grün-Failing-Test-Step und den abschließenden Verify-Task des
Gesamtplans — beides existiert in keinem anderen Partial.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/llm-proxy/loadouts.test.mjs` | 106 | 694 |
| `scripts/llm-proxy/runner.test.mjs` | 125 | 675 |
| `scripts/llm-proxy/server.test.mjs` | 166 | 634 |

Alle drei sind **nicht gebaselined**
(`jq -r '."S1:scripts/llm-proxy/server.test.mjs".metric // "nicht-baselined"' docs/code-quality/baseline.json`
→ `nicht-baselined`), wirksame Schwelle ist daher das statische `.mjs`-Limit 800 aus
`docs/code-quality/gates.yaml`. Die geplanten Ergänzungen liegen je Datei unter 60 Zeilen — kein
Split, keine Extraktion nötig.

Weiter berührt, ohne Zeilen-Gate:

- `tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats` (**neu**) — `.bats` ist keine
  im S1-Gate gemessene Extension.
- `tests/spec/local-llm-proxy.bats` (**bestehend**) — genau eine bestehende Assertion wird
  angepasst (Task P5.6). Es kommt **kein** neuer `@test`-Block in diese Sammeldatei; neue Blöcke
  gehören laut T002416/CLAUDE.md in das Spec-Verzeichnis.
- `website/src/data/test-inventory.json` — generiert (Task P5.7).

<!-- vitest: kein neuer Test nötig, weil dieses Partial nichts unter website/src/lib oder
     website/src/pages/api anfasst; die llm-proxy-Suite läuft unter node:test, die
     vitest-Ausnahme ist allein scripts/llm-proxy/mcp-bridge.test.mjs (unverändert) -->

## Testframework und Laufwege (vor dem Schreiben geprüft)

- `scripts/llm-proxy/{loadouts,models,runner,server}.test.mjs` nutzen **`node:test`**
  (`import { test } from 'node:test'` + `node:assert/strict`), nicht vitest. Einzig
  `mcp-bridge.test.mjs` läuft unter vitest — es wird hier nicht angefasst.
- Sammelziel ist `task test:llm-proxy` (`Taskfile.yml`, Zeilen 725–733). Es fährt beide Wege:
  `npx vitest run scripts/llm-proxy/mcp-bridge.test.mjs` und
  `node --test scripts/llm-proxy/loadouts.test.mjs scripts/llm-proxy/models.test.mjs scripts/llm-proxy/runner.test.mjs scripts/llm-proxy/server.test.mjs`.
- BATS-Runner ist die vendorierte Fassung `tests/unit/lib/bats-core/bin/bats`, nicht das globale
  `bats` aus npm.
- Syntaxprüfung einer `.bats`-Datei erfolgt mit `tests/unit/lib/bats-core/bin/bats --count <datei>`
  — `bash -n` meldet für `@test "name" { … }` einen irreführenden Fehler (T002351-M2).

## Kontrakt an P3 (`server.mjs`): reine Auto-Start-Entscheidungsfunktion

`server.mjs` ist als Modul **nicht importierbar**: es ruft auf Top-Level `startRegistryPoll`,
`startDiscovery`, `await discovery.probeNow()` und `server.listen(...)` auf. Ein
`import('./server.mjs')` in einer Unit-Suite startet also einen echten Proxy-Prozess auf Port
18235. Die Auto-Start-Logik aus D4 lässt sich deshalb nur dann ohne laufende GPU und ohne systemd
prüfen, wenn ihre **Entscheidung** als reine Funktion außerhalb von `server.mjs` liegt.

Verbindlicher Kontrakt, gegen den dieses Partial testet:

```js
// Ort: scripts/llm-proxy/loadouts.mjs (reines Modul, keine Seiteneffekte beim Import)
planAutoStart({ doc, model, activeSlugs })
// doc:         validiertes Loadout-Dokument (parseLoadouts)
// model:       angefragte model-ID aus dem Request-Body
// activeSlugs: string[] der aktuell laufenden Loadout-Slugs (server.mjs speist das aus unitStatus)
// →  { action: 'start',    slug }                       Loadout bekannt, gestoppt, konfliktfrei
// →  { action: 'conflict', slug, conflictSlug, group }  exclusiveGroup-Kollision
// →  { action: 'none' }                                 kein passendes Loadout / laeuft bereits
```

`proxyV1` in `server.mjs` konsumiert diese Entscheidung: `start` → `startUnit` + `waitHealthy` +
`enqueue`, `conflict` → HTTP 409 mit `conflictSlug` im Text, `none` → bisheriges Verhalten
(`503 no_backend`).

Damit dieses Partial nicht an einer Platzierungsentscheidung von P3 scheitert, lösen die Tests den
Export über beide plausiblen Orte auf (`./loadouts.mjs`, ersatzweise `./autostart.mjs`) und
scheitern erst, wenn **keiner** von beiden ihn exportiert — dasselbe Muster wie der dynamische
Import bei `evaluateReadiness` in `server.test.mjs` (Zeilen 63–66): ein statischer named import auf
einen fehlenden Export ist ein `SyntaxError` beim Modul-Laden und färbt die **ganze** Datei rot
statt nur den betroffenen Test.

## Cross-Partial-Befund: `-kvu` fehlt in P1s `gemma-multiagent`

Die Delta-Spec verlangt für das Multi-Agent-Profil ausdrücklich `-np 5`, **`-kvu`** und einen
größeren Kontextpool; `design.md` D1 schreibt `-np 5 -c 200000 -kvu`. Der JSON-Entwurf in
`tasks.d/p1-loadout-schema.md` setzt `"parallel": 5`, lässt aber `"extraArgs": []` — `-kvu` taucht
nirgends auf, und `runner.mjs` kennt kein eigenes Feld dafür. Ohne `-kvu` ist der Kontext **pro
Slot** statt geteilt, also genau das Gegenteil der spezifizierten „Shared-Full-Context"-Absicht.

Task P5.5 testet gegen die Spec, nicht gegen den P1-Entwurf: die Assertion auf `-kvu` in der argv
von `gemma-multiagent` wird rot bleiben, bis P1 `"extraArgs": ["-kvu"]` einträgt. Dieser Befund
gehört in den PR-Body, damit die Anpassung bei P1 landet und nicht still im Testpartial
verschwindet.

## Task P5.1 — Failing-Test-Step (RED), vor jeder Implementierung

Die neuen Assertions werden geschrieben und ausgeführt, **bevor** P1 bis P3 gemergt sind. Alle
drei Läufe müssen rot sein; ist einer grün, prüft er nichts Neues.

```bash
node --test scripts/llm-proxy/loadouts.test.mjs scripts/llm-proxy/runner.test.mjs scripts/llm-proxy/server.test.mjs
# expected: FAIL — parseLoadouts kennt exclusiveGroup/mmprojPath noch nicht (P1),
#           buildServerArgv kennt --spec-draft-model/--mmproj noch nicht (P2),
#           planAutoStart existiert in keinem Modul (P3)

tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats
# expected: FAIL — gemma-factory/gemma-multiagent stehen noch nicht in scripts/llm/loadouts.json
#           und buildStartCommand setzt --property=Restart=on-failure noch nicht
```

Erwartete Reihenfolge des Grünwerdens: P1 → `loadouts.test.mjs`, P2 → `runner.test.mjs` und die
Autorestart-Assertions der BATS-Datei, P3 → die `planAutoStart`-Assertions in `server.test.mjs`
und der BATS-Datei.

## Task P5.2 — `scripts/llm-proxy/loadouts.test.mjs`: neue Schema-Felder

Anhängen an die bestehende Datei; das `valid`-Fixture (Zeilen 10–27) bleibt unverändert, damit die
Bestandstests weiterhin den Zustand *ohne* die neuen Felder abdecken.

- **`exclusiveGroup` wird akzeptiert.** `structuredClone(valid)` plus
  `loadouts[0].exclusiveGroup = 'chat-gpu'` läuft ohne Wurf durch `parseLoadouts`, und das Feld
  überlebt den Round-Trip (`doc.loadouts[0].exclusiveGroup === 'chat-gpu'`). Positiv-Anker im
  selben Test, in dieser Reihenfolge zuerst: ein weiterhin unbekanntes Feld (`bogusGroup`) wirft
  nach wie vor `unbekanntes Feld` — sonst bestünde der Test auch gegen eine Fassung, die die
  Key-Whitelist komplett entfernt hat.
- **`args.mmprojPath` wird akzeptiert und gegen Path-Traversal geprüft.** Gesetzter gültiger Pfad
  parst; `'../../etc/passwd'` wirft mit `..` in der Meldung. Der Positiv-Anker ist der gültige
  Fall im selben Test, vor der Negativ-Aussage (T002356-M1).
- **`speculative.draftModelPath` überlebt den Parse.** `validateLoadout` prüft `speculative`
  bewusst nicht gegen eine Key-Whitelist; der Test hält fest, dass das Feld unverändert
  durchkommt — eine später ergänzte Whitelist ohne dieses Feld würde hier auffallen.
- **Beide Gemma-Loadouts sind in der ausgelieferten Registry auffindbar.** Über
  `readLoadouts('scripts/llm/loadouts.json')`:
  `findLoadout(doc, 'gemma-factory')` und `findLoadout(doc, 'gemma-multiagent')` sind definiert,
  beide `port === 8091`, beide `exclusiveGroup === 'chat-gpu'`. Der Test prüft die **echte**
  ausgelieferte Datei, nicht das Fixture — das ist die Aussage „P1 hat die Einträge wirklich
  angelegt".
- **`findLoadout` bleibt für unbekannte Slugs `undefined`.** Bestandstest (Zeile 96), unverändert
  — er ist der Anker gegen eine Fassung, die jeden Slug auf das erste Loadout abbildet.

## Task P5.3 — `scripts/llm-proxy/runner.test.mjs`: argv und Start-Kommando

Anhängen an die bestehende Datei. Das `base`-Fixture (Zeilen 8–20) trägt weiterhin
`speculative: { draftHfRepo: null, draftNgl: null }` und kein `mmprojPath` — es bleibt der
Regressionsanker für `gptoss-context`/`devstral-quality`.

- **Lokaler Draft-Pfad erzeugt `--spec-draft-model`, nicht `--spec-draft-hf`.** Fixture mit
  `speculative.draftModelPath = '/models/gemma/mtp-draft.gguf'`:
  `argv[argv.indexOf('--spec-draft-model') + 1]` ist genau dieser Pfad, und
  `argv.includes('--spec-draft-hf')` ist `false`. Positiv-Anker im selben Test **zuvor**: ein
  Fixture mit ausschließlich `draftHfRepo` liefert weiterhin `--spec-draft-hf <repo>` — ohne ihn
  wäre die Negativ-Aussage auch gegen eine Fassung wahr, die den Speculative-Block ganz gelöscht
  hat.
- **`args.mmprojPath` erzeugt `--mmproj <pfad>` genau einmal.** Zählung über
  `argv.filter((x) => x === '--mmproj').length === 1`. Positiv-Anker: `base` ohne das Feld liefert
  `argv.includes('--mmproj') === false`.
- **`resolved` schlägt den Loadout-Rohwert.** Aufruf
  `buildServerArgv(loadout, MODEL, defaults, { draftModelPath: '/abs/draft.gguf', mmprojPath: '/abs/mm.gguf' })`
  bei gleichzeitig gesetzten Loadout-Werten: in argv stehen die `resolved`-Pfade, die Rohwerte
  nicht. Das ist der in P2 fixierte Kontrakt zu P3.
- **Rückwärtskompatibilität der Signatur.** `buildServerArgv(base, MODEL, defaults)` ohne viertes
  Argument wirft nicht und liefert dieselbe argv-Länge wie vor der Änderung — geprüft über die
  bestehenden Assertions der Datei, die unverändert grün bleiben müssen.
- **`buildStartCommand` setzt die Autorestart-Properties vor dem Trenner.**
  `cmd.includes('--property=Restart=on-failure')` und `cmd.includes('--property=RestartSec=5')`
  sind wahr, **und** beide Indizes sind kleiner als `cmd.indexOf('--')`. Die Reihenfolge ist die
  eigentliche Aussage: alles nach `--` ginge als Argument an `llama-server`, das mit unbekanntem
  Argument abbräche. Im selben Test bleibt `--collect` erhalten und steht ebenfalls vor `--`
  (D3-Nebenwirkung: beide Properties koexistieren), und `cmd[cmd.indexOf('--') + 1]` ist weiterhin
  der Binary-Pfad.

## Task P5.4 — `scripts/llm-proxy/server.test.mjs`: Auto-Start-Entscheidung und Portregel

Anhängen an die bestehende Datei, plus **eine** Anpassung an einem Bestandstest (letzter
Punkt unten).

- **Auto-Start eines konfliktfreien, gestoppten Loadouts.** Fixture-Dokument mit
  `bge-rerank-batch` (kein `exclusiveGroup`) und laufendem `gemma-factory`
  (`exclusiveGroup: 'chat-gpu'`):
  `planAutoStart({ doc, model: 'bge-rerank-batch', activeSlugs: ['gemma-factory'] })` liefert
  `{ action: 'start', slug: 'bge-rerank-batch' }`. Das ist das Spec-Szenario „Request auto-starts
  a conflict-free stopped loadout" auf Entscheidungsebene; die HTTP-Weiterleitung nach Health-OK
  deckt Task P5.5 ab.
- **Konflikt liefert `conflict` und nennt das laufende Loadout.** Gleiches Dokument:
  `planAutoStart({ doc, model: 'gptoss-context', activeSlugs: ['gemma-factory'] })` liefert
  `action === 'conflict'`, `conflictSlug === 'gemma-factory'` und `group === 'chat-gpu'`. Der
  Positiv-Anker steht im selben Test **davor**: dasselbe Modell bei `activeSlugs: []` liefert
  `action === 'start'` — ohne ihn wäre „liefert conflict" auch gegen eine Fassung wahr, die
  pauschal jede Anfrage ablehnt.
- **Kein Stop als Nebenwirkung.** `planAutoStart` ist eine reine Funktion: der Test hält fest, dass
  das übergebene `doc` und das `activeSlugs`-Array nach dem Aufruf `deepEqual` zu ihren Kopien vor
  dem Aufruf sind. Damit ist „does not stop `gemma-factory`" strukturell garantiert und nicht bloß
  behauptet — der einzige Ort, der Units stoppt, ist `stopUnit` in `runner.mjs`, und diese Funktion
  erreicht die Entscheidungsfunktion nicht.
- **Unbekanntes Modell bleibt `none`.** `planAutoStart({ doc, model: 'ghost', activeSlugs: [] })`
  liefert `{ action: 'none' }` — der Regressionsanker dafür, dass der bestehende
  `503 no_backend`-Pfad erhalten bleibt und nicht jede unbekannte ID einen Modellstart auslöst.
- **Bereits laufendes Loadout löst keinen zweiten Start aus.**
  `planAutoStart({ doc, model: 'gemma-factory', activeSlugs: ['gemma-factory'] })` liefert
  `action === 'none'`.
- **Portregel: geteilte Ports nur innerhalb derselben `exclusiveGroup`.** Der Bestandstest
  `scripts/llm/loadouts.json ist gueltig und portkollisionsfrei` (Zeilen 130–135) fordert heute
  global eindeutige Ports und **muss** rot werden, sobald `gemma-factory` und `gemma-multiagent`
  beide auf 8091 stehen — das ist kein Fehler von P1, sondern der ausdrückliche Entwurf D1. Die
  Assertion wird ersetzt durch: für jeden mehrfach belegten Port müssen **alle** Loadouts dieses
  Ports dieselbe nicht-leere `exclusiveGroup` tragen; ein Port ohne Gruppe darf weiterhin nur
  einmal vorkommen. Positiv-Anker im selben Test: die Zahl der geprüften mehrfach belegten Ports
  wird gezählt und muss ≥ 1 sein — sonst liefe die neue Regel vakuos durch, sobald die
  Gemma-Einträge fehlen.

## Task P5.5 — Neue Datei `tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats`

Eigene Datei im Spec-Verzeichnis, **nicht** angehängt an `tests/spec/local-llm-proxy.bats`
(T002416, CLAUDE.md). Genau dieser Change ist der Anlassfall: fünf Partials, deren Testpartial
sonst am Dateiende jeder Parallelarbeit im Weg stünde. Der Runner läuft seit T002416 mit
`bats -r tests/spec/` und erfasst beide Formen.

**Header-Kommentar der Datei (Prüfmodus, Test-Resultats-Konvention T002448-M4):** Diese Datei prüft
**Laufzeitergebnisse** — `node --input-type=module` mit eigenen Assertions, `node --test` als
Wrapper und `curl` gegen einen real gestarteten Proxy. Sie greppt **nicht** in `server.mjs` oder
`runner.mjs` nach Flag-Namen. Was ohne GPU-Host und ohne User-systemd nicht messbar ist (echter
Kill-und-Neustart-Zyklus, `--collect`-Aufräumung, Live-Cutover-Smoke-Test), ist bewusst **nicht**
hier abgebildet, sondern in den Live-Verifikations-Tasks von P2 und P4.

Harnisch (aus `tests/spec/local-llm-proxy.bats`, Zeilen 9–66 übernommen — bewusst dupliziert statt
per `load` geteilt, weil die Sammeldatei keine Helper exportiert und ein Umbau dort fremden Scope
anfassen würde): `_free_port`, `_start_stub`, `_start_proxy` mit `/livez`-Warteschleife,
`LLM_PROXY_BACKENDS_JSON` als Registry-Override, `teardown` killt Stubs und Proxy.

Testblöcke, je Requirement der Delta-Spec:

1. **Requirement „Loadout autorestart on failure"** — `buildStartCommand` mit einem
   Minimal-Loadout aufrufen (`node --input-type=module`, Assertions in node, damit kein
   Shell-Escaping nötig ist) und prüfen: beide `--property=`-Argumente vorhanden, beide Indizes
   kleiner als der Index von `--`, `--collect` weiterhin vorhanden. Ausgewertet werden `$status`
   und die node-Assertion, nicht `$output`-Substrings.
2. **Requirement „Gemma single-agent and shared multi-agent loadout profiles"** — über
   `readLoadouts()` auf der ausgelieferten `scripts/llm/loadouts.json`: beide Slugs vorhanden,
   beide `port === 8091`, beide `fit.enabled === true` mit gesetzten `targetMarginMib` **und**
   `minCtx`, beide `args.ctx === null` und `args.ngl === null` (sonst wäre `-fit` tot),
   `gemma-factory.args.parallel === 1`, `gemma-multiagent.args.parallel === 5`.
3. **Gegenseitige Exklusivität (Szenario „Starting one Gemma profile blocks the other")** — der
   `409 port_busy`-Pfad in `server.mjs` (Zeilen 342–344) greift genau dann, wenn zwei Loadouts
   denselben Port teilen und eines aktiv ist. Ohne User-systemd ist der aktive Zustand nicht
   herstellbar, prüfbar ist aber die **Vorbedingung als Laufzeitergebnis**: die Menge der
   Loadouts mit `port === 8091` hat genau zwei Elemente und beide tragen
   `exclusiveGroup === 'chat-gpu'`. Positiv-Anker im selben Test: ein Loadout mit einem
   ausschließlich einmal belegten Port existiert weiterhin (`bge-embed-batch`) — sonst wäre die
   Aussage auch gegen eine Registry wahr, in der alles auf 8091 liegt.
4. **`-kvu` im Multi-Agent-Profil** — argv von `gemma-multiagent` über `buildServerArgv` erzeugen
   und `-kvu` darin erwarten (siehe Cross-Partial-Befund oben; bleibt rot, bis P1 `extraArgs`
   ergänzt). Im selben Test der Anker, dass `gemma-factory` **kein** `-kvu` trägt — das ist der
   inhaltliche Unterschied beider Profile.
5. **Requirement „Auto-start and queue" — Auto-Start-Fall** — `planAutoStart` über den
   Modul-Resolver aufrufen: gestopptes, konfliktfreies Loadout ergibt `action: 'start'` mit dem
   erwarteten Slug.
6. **Requirement „Auto-start and queue" — Konfliktfall** — gleicher Aufruf mit laufendem
   `gemma-factory` und angefragtem `gptoss-context` ergibt `action: 'conflict'` und nennt
   `gemma-factory`; `activeSlugs` und `doc` sind nach dem Aufruf unverändert (kein Stop).
   Positiv-Anker: derselbe Aufruf mit leerer `activeSlugs`-Liste ergibt `action: 'start'`.
7. **HTTP-Regressionsanker für `503 no_backend`** — mit dem Stub-Harnisch: beide Backend-Stubs vor
   dem Proxystart killen, Request auf ein Modell schicken, das **kein** Loadout-Slug ist
   (`does-not-exist`), und weiterhin HTTP 503 mit `"no_backend"` im Body erwarten. Das ist die
   Zusicherung, dass die Auto-Start-Erweiterung den bestehenden Fehlerpfad nicht verschluckt und
   keine 240-Sekunden-Health-Wartezeit für unbekannte Modelle einführt.
8. **Suite-Wrapper** — `node --test` über `loadouts.test.mjs`, `runner.test.mjs` und
   `server.test.mjs`, Erwartung `$status -eq 0` und `fail 0` im Output. Muster übernommen von
   `T002336: node --test llm-proxy suite passes` (Zeilen 331–335): der Wrapper bringt die
   node-Suiten unter `task test:all`, das die spec-Reihe fährt.

Assertion-Hygiene für die ganze Datei: kein unqualifiziertes
`[[ "$output" == *"<term>"* ]]` gegen volles stdout+stderr — Assertions werden zuvor auf die
relevante Ausgabezeile eingegrenzt oder ganz nach node verlagert, wo `assert.strictEqual` den
Exit-Code setzt. Grund: mehrere Skripte drucken `$0` in ihrer Usage, und das Worktree-Verzeichnis
heißt `llama-stack-T002459` — ein Substring-Treffer auf `llama` wäre trivial erfüllbar, ohne dass
die geprüfte Funktion existiert.

## Task P5.6 — Bestandsassertion in `tests/spec/local-llm-proxy.bats` nachziehen

Der Block `T002394: loadouts.json-Ports sind eindeutig` (Zeilen 385–392) fordert global eindeutige
Ports und wird durch die zwei Gemma-Loadouts auf 8091 rot — dieselbe Ursache wie beim
node-Bestandstest in Task P5.4. Angepasst wird **nur diese eine Assertion**, kein neuer `@test`
kommt in die Sammeldatei:

Ein mehrfach belegter Port ist gültig, wenn alle Loadouts dieses Ports dieselbe nicht-leere
`exclusiveGroup` tragen; ein Port ohne Gruppe bleibt exklusiv. Der Testname wird entsprechend
präzisiert (`… Ports sind eindeutig oder teilen eine exclusiveGroup`), und der Kommentar hält
fest, dass die geteilte Portbelegung der Umschalter aus D1 ist und nicht versehentlich entsteht.
Positiv-Anker wie in P5.4: die Anzahl der geprüften Mehrfachbelegungen wird gezählt und muss ≥ 1
sein.

## Task P5.7 — Test-Inventar regenerieren

```bash
task test:inventory
```

`website/src/data/test-inventory.json` mitcommitten. CI re-runt `task test:inventory` und failt den
Job, wenn die committete Fassung abweicht — die neue `.bats`-Datei und die neuen `node:test`-Blöcke
schlagen dort durch.

## Task P5.8 — Verifikation (letzter Task des Gesamtplans)

Erst die gezielten Suiten, dann die Pflicht-Gates:

```bash
task test:llm-proxy
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartung: alle vier Testläufe grün (`fail 0`), `task freshness:check` ohne Baseline-Wachstum —
dieses Partial legt genau eine neue Datei an, und `.bats` wird vom S1-Ratchet nicht gemessen, also
darf `docs/code-quality/baseline.json` unverändert bleiben. Wächst die Key-Anzahl trotzdem, ist
eine `.mjs`-Testdatei über ihr Limit gelaufen und muss aufgeteilt werden, statt eine
Baseline-Ausnahme zu bekommen.
