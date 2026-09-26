---
title: "p3 — BATS-Verdrahtung: Eval-Gate und Node-Parity"
ticket_id: T900448
domains: [brain, tests]
status: active
---

# p3 — BATS-Verdrahtung: Eval-Gate und Node-Parity

Files: `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats`, `tests/spec/brain-k4-brain-wiki/node-parity.bats` (neu; target_files dieses Partials; disjunkt zu p1/p2).

## S1-Budgets (Messung 2026-09-26, Branch feature/brain-eval-baseline-T900448)

Messbefehle (Pflichtquellen aus plan-quality-gates.md):

```bash
wc -l tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
for f in tests/spec/brain-k4-brain-wiki/retrieval-eval.bats tests/spec/brain-k4-brain-wiki/node-parity.bats; do
  echo -n "$f baseline="; jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json
done
grep -A15 '  limits:' docs/code-quality/gates.yaml
bash scripts/plan-lint.sh residual_budget tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
bash scripts/plan-intel-filter.sh brain-eval-baseline tests/spec/brain-k4-brain-wiki/retrieval-eval.bats tests/spec/brain-k4-brain-wiki/node-parity.bats
```

Ergebnis:

| Datei | Ist (wc -l) | S1-Schwelle | Restbudget |
|---|---|---|---|
| `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats` | 101 | keine — Extension `.bats` hat kein s1.limits-Limit, kein Baseline-Eintrag | n/a (S1-ungated, `residual_budget` leer, Intel-Subset bestätigt `s1_budget: null`) |
| `tests/spec/brain-k4-brain-wiki/node-parity.bats` | Datei existiert noch nicht | keine — Extension `.bats` hat kein s1.limits-Limit, kein Baseline-Eintrag | n/a (S1-ungated, neue Datei mit Reserve) |

Das S1-Gate misst keine dieser beiden Dateien (B1b greift nicht, kein Split nötig). Die neue Datei bleibt bewusst kompakt (eine setup-Funktion, zwei Tests, Sweep-Skripte als flüchtige Dateien unter `BATS_TEST_TMPDIR`). Es entstehen keine Brand-Literale (S3 ohne Befund), keine neuen Gate-Pfade (S4 ohne Befund); CQ02- und Vitest-Pflicht greifen außerhalb von `components/website/src` nicht.

## Task 3.1: retrieval-eval.bats um das versionierte Set erweitern

Voraussetzung: p1 ist gelandet (`tests/fixtures/brain/retrieval-eval.jsonl` mit 12 Cases committed). Die bestehende Fixture (`setup()` mit alpha/beta/gamma) und die zwei bestehenden Tests bleiben unverändert; die Datei behält Shebang, SSOT-Header und `ROOT`-Ableitung aus `BATS_TEST_DIRNAME`. Der bestehende Ticket-Header bleibt stehen, die Change-Ticketzeile kommt dazu (`# Ticket: T900448 (Erweiterung: versioniertes Set)`).

1. Neuen Test `versioned eval set runs deterministically without threshold gating` anhängen. Der Test lädt das versionierte Set gegen die lokale Fixture (hermetisch, ohne Bezug auf reale Wiki-Pfade) und prüft ausschließlich Struktur plus Determinismus — keine Recall-Werte, weil die versionierten Queries auf reale Slugs zielen und gegen die 3-Seiten-Fixture definitionsgemäß ins Leere laufen:
   ```bash
   local evalset="$ROOT/tests/fixtures/brain/retrieval-eval.jsonl"
   [ -f "$evalset" ]
   run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --top-k 5 --format json
   [ "$status" -eq 0 ]
   local out1="$output"
   run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --top-k 5 --format json
   [ "$status" -eq 0 ]
   [ "$output" = "$out1" ]
   python3 - "$out1" <<'PY'
   import json, sys
   d = json.loads(sys.argv[1])
   assert d["schema_version"] == 1
   assert d["case_count"] == 12
   assert d["eval_set"].endswith("tests/fixtures/brain/retrieval-eval.jsonl")
   PY
   [[ "$out1" != *'threshold'* ]]
   run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --format human
   [ "$status" -eq 0 ]
   [[ "$output" == *'cases=12'* ]]
   [[ "$output" != *'threshold'* ]]
   ```
   Das beweist in D4-Manier (nur Exit-Code und Stdout): versioniertes Set geladen (`eval_set`-Pfad plus `case_count` 12 statt der 3 Inline-Cases), Byte-Identität zweier JSON-Läufe, kein Threshold-String in beiden Formaten. Der Runner-Quelltext selbst enthält ebenfalls keine solche Zeichenkette (verifiziert 2026-09-26 per Suche über `scripts/brain-retrieval-eval.py`, einziger Treffer im Repo ist die Negativ-Assertion in dieser BATS-Datei); der Test bleibt trotzdem reine Output-Verifikation und greift keine Skript-Interna ab.
2. Neuen Test `invalid eval sets fail with exit 2` anhängen (drei Fehlformen, alle gegen `load_cases` und `run` im Runner verifiziert: doppelte id verletzt die Eindeutigkeitsregel, `top_k` 0 verletzt die Positivitätsregel, fehlendes Wiki-Verzeichnis meldet `EvalError`):
   ```bash
   local bad="$BATS_TEST_TMPDIR/invalid.jsonl"
   printf '%s\n' '{"id":"dup","query":"a","relevant_slugs":["alpha"]}' '{"id":"dup","query":"b","relevant_slugs":["beta"]}' > "$bad"
   run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$bad" --format json
   [ "$status" -eq 2 ]
   printf '%s\n' '{"id":"k","query":"a","relevant_slugs":["alpha"],"top_k":0}' > "$bad"
   run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$bad" --format json
   [ "$status" -eq 2 ]
   run python3 "$RUNNER" --wiki-dir "$BATS_TEST_TMPDIR/kein-wiki" --eval-set "$ROOT/tests/fixtures/brain/retrieval-eval.jsonl" --format json
   [ "$status" -eq 2 ]
   ```
3. Akzeptanz:
   ```bash
   bats tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
   echo "bats-exit=$?"
   ```
   Assertion: `bats-exit=0`, vier Tests grün, kein Test berührt reale Wiki-Pfade (nur `$WIKI` unter `BATS_TEST_TMPDIR` und `$ROOT`-Fixtures). Semantischer Rot-Zustand dieses Tests vor p1: `case_count` wäre 2 statt 12 gewesen — die Zahl pinnt den p1-Stand.

## Task 3.2: node-parity.bats neu anlegen (STRUCT2-Failing-Step)

Voraussetzung: p2 ist gelandet (Signatur-Fix plus Index-Angleichung). Diese Datei pinnt den reparierten Zustand dauerhaft: gleiche Fixture, gleiche Queries, identische Slugs in identischer Reihenfolge aus Python- und Node-Index, Scores innerhalb 0.0001, `brain_search` über den Node-Server liefert Treffer statt Fehler.

1. Rot-Zustand belegen — die Datei existiert noch nicht, daher scheitert der Runner-Befehl (expected: FAIL):
   ```bash
   bats tests/spec/brain-k4-brain-wiki/node-parity.bats; echo "bats-exit=$?"
   ```
   Assertion: `bats-exit` ungleich 0 (Datei fehlt). Derselbe Befehl ist nach Schritt 3 grün; der tiefere Rot-Zustand (Parity-Assertions gegen den ungefixten Node-Code) ist in p2 mit dem `text.match`-Crash belegt und dort geschlossen — diese Suite pinnt das reparierte Grün.
2. Datei anlegen mit BATS-Konventionen: `#!/usr/bin/env bats`, Header mit SSOT-Spec (`openspec/specs/brain-k4-brain-wiki.md`) und Ticket (`T900448`), `ROOT`-Ableitung aus `BATS_TEST_DIRNAME`, Node-Guard in `setup()`:
   ```bash
   command -v node >/dev/null 2>&1 || skip "node nicht verfügbar"
   ```
   Fixture unter `$BATS_TEST_TMPDIR/wiki` mit vier Seiten (alpha/beta/gamma wie in `retrieval-eval.bats`, dazu `dated.md` mit `tags: [Alpha]`, `source_kind: runbook`, `valid_from: 2025-01-01`, Text `Dated banana content here.`). Die Fixture deckt Stämme, Tags-Case, `valid_from` und Freshness-Fenster ab und bleibt gegen reale Wiki-Pfade unberührt.
3. Test `python and node indexes return identical slugs in identical order`: Sweep über sechs Query-Filter-Kombinationen (`banana` ungefiltert; `tags` klein und groß; `type` note; `as_of` innerhalb und außerhalb der Gültigkeit). Beide Sweeps laufen als flüchtige Skriptdateien unter `BATS_TEST_TMPDIR` (keine Einzeiler mit Schachtel-Quotes): ein `.mjs`-Sweep importiert `BrainIndex` aus `$ROOT/scripts/brain-mcp-node/index.mjs` (Filter-Keys `tags`/`pageType`/`asOf`), ein `.py`-Sweep lädt `$ROOT/scripts/brain-index.py` per importlib (Filter-Keys `tags`/`page_type`/`as_of`). Beide geben pro Query `[{slug, score}]` als JSON aus; der Vergleich (kleines Node-Skript, `node` ist durch den Guard garantiert) asseriert: gleiche Trefferzahl, gleiche Slugs in gleicher Reihenfolge, Score-Abweichung höchstens 0.0001, kein Slug enthält `/`, `dated` ist ungefiltert enthalten, die großgeschriebene Tags-Query liefert leer (case-sensitiver Match).
4. Test `brain_search via node server returns hits instead of errors`: stdio-Aufruf mit vier Requests (Suche `banana` mit `top_k` 5, Suche mit `top_k` 1, Suche mit fehlerhaftem `top_k`):
   ```bash
   run bash -c 'printf "%s\n" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}" "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"brain_search\",\"arguments\":{\"query\":\"banana\",\"top_k\":5}}}" "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"brain_search\",\"arguments\":{\"query\":\"banana\",\"top_k\":1}}}" "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"brain_search\",\"arguments\":{\"query\":\"x\",\"top_k\":\"bad\"}}}" | BRAIN_WIKI_DIR="$0" timeout 20 node "$1"' "$WIKI" "$NODE_SERVER"
   [ "$status" -eq 0 ]
   [[ "$output" != *'Internal error'* ]]
   ```
   Danach JSON-Auswertung der vier Antworten: id 2 liefert mindestens einen Treffer ohne `error`, id 3 höchstens einen Treffer (`top_k` geehrt), id 4 meldet Code -32602 (Argumentfehler-Pfad intakt). Die Negativ-Assertion auf `Internal error` schließt R1 aus design.md auf Testebene.
5. Akzeptanz — derselbe Runner-Befehl wie in Schritt 1, jetzt grün:
   ```bash
   bats tests/spec/brain-k4-brain-wiki/node-parity.bats
   echo "bats-exit=$?"
   ```
   Assertion: `bats-exit=0`, beide Tests grün (oder beide sauber geskippt falls `node` fehlt — der Skip ist der einzige erlaubte Nicht-Grün-Pfad). Kein Test liest reale Wiki-Pfade oder Netz.

## Akzeptanzkriterien

- `retrieval-eval.bats` lädt das versionierte Set (`case_count` 12, `eval_set`-Pfad), belegt Byte-Identität zweier Läufe, meldet drei Fehlformen mit Exit 2 und findet in keinem Format einen Threshold-String — alles per Exit-Code und Stdout, ohne Griff in Skript-Interna.
- `node-parity.bats` ist neu angelegt (Shebang, SSOT-Header, `ROOT` aus `BATS_TEST_DIRNAME`, Node-Guard mit Skip), belegt Slug- und Reihenfolge-Identität bei Score-Toleranz 0.0001 und Treffer statt Fehler über `brain_search`.
- Beide Suiten laufen deterministisch, offline und ohne reale Wiki-Pfade (nur `BATS_TEST_TMPDIR`-Fixture plus `$ROOT`-Fixtures).
- Der STRUCT2-Schritt in Task 3.2 ist rot vor und grün nach der Implementierung (`expected: FAIL` zum fehlenden File, danach `bats-exit=0`).
- Keine andere Datei wurde angefasst (Fixtures und Baseline gehören zu p1, Runner- und Server-Fixes zu p2, der STRUCT3-Verify-Task mit den drei Pflicht-Commands steht im Index).
