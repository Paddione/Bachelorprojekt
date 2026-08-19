# P4 — Deterministische Retrieval-Evaluation und Task-Einstiegspunkte

Rolle: **impl**. Disjunkter Partial des Change `brain-knowledge-lifecycle` (T012913),
Offline-Retrieval-Evaluation aus `brain-k4-brain-wiki`. Dieser Partial hat
`depends_on: [p2-retrieval]`, weil er `BrainIndex` aus `scripts/brain-index.py` direkt
verwendet. Er implementiert keine zweite Parsing-, Filter- oder Rankinglogik.

Die versionierte JSONL-Fixture und sämtliche BATS-Abdeckung gehören ausschließlich zu p5.
Dieser Partial ändert exakt diese exklusiven Zielpfade:

- `scripts/brain-retrieval-eval.py`
- `taskfiles/Taskfile.brain.yaml`

## File Structure

| Datei | Ist | Wirksames S1-Budget |
|---|---:|---:|
| `scripts/brain-retrieval-eval.py` | 0 (neu) | 800 |
| `taskfiles/Taskfile.brain.yaml` | 83 | kein S1-Limit für `.yaml` |

`scripts/brain-retrieval-eval.py` bleibt bei höchstens 360 Zeilen und damit unter 45 %
des `.py`-Limits; mindestens 440 Zeilen Wachstumsreserve bleiben. Die Taskfile ist nicht
S1-limitiert. Keine Baseline-/Ignore-Ausnahme anlegen. Der neue Python-Entrypoint ist über
`task brain:eval` erreichbar und damit kein S4-Orphan.

---

## Task P4.1 — Eval-CLI und versionierten JSONL-Vertrag implementieren

- [ ] Eine ausschließlich standardbibliotheksbasierte CLI
      `scripts/brain-retrieval-eval.py` anlegen. Pflichtargumente sind
      `--wiki-dir PATH` und `--eval-set PATH`; Optionen sind `--top-k N` mit Default `5`
      und positiver Ganzzahl sowie `--format human|json` mit Default `human`. Ungültige
      Argumente, nicht lesbare Pfade, leere Evalsets und strukturell ungültige Zeilen enden
      mit Exit 2 und einer einzeiligen Diagnose auf stderr. Der Runner führt keine
      Netzwerkzugriffe und keine Schreiboperationen aus.
- [ ] Den Evalset-Vertrag als UTF-8-JSONL mit genau einem Objekt pro nichtleerer Zeile
      implementieren. Pflichtfelder: `id` als nichtleerer, im Set eindeutiger String,
      `query` als nichtleerer String und `relevant_slugs` als nichtleere Liste eindeutiger
      nichtleerer Strings. Optional sind `top_k` als positive Ganzzahl und `filters` als
      Objekt mit ausschließlich `type`, `tags`, `status`, `source_kind`, `as_of`.
      `tags` ist eine Liste eindeutiger Strings, die übrigen Filter sind Strings. Unbekannte
      Schlüssel auf Top-Level oder in `filters`, doppelte IDs/Slugs und falsche Typen werden
      fail-closed als Usage-/Datensatzfehler abgelehnt, statt still ignoriert.
- [ ] Das Modul `scripts/brain-index.py` relativ zu `__file__` mit
      `importlib.util.spec_from_file_location` laden, genauso wie der p2-MCP-Adapter. Genau
      eine `BrainIndex(Path(args.wiki_dir))`-Instanz pro Lauf aufbauen und pro Fall deren
      `search(query, top_k=..., page_type=..., tags=..., status=...,
      source_kind=..., as_of=...)` aufrufen. Nicht gesetzte Filter werden nicht erfunden;
      das fallbezogene `top_k` überschreibt den CLI-Default. Slugs, Reihenfolge,
      Metadatenfilter und `freshness` stammen ausschließlich aus diesem Shared Index.
- [ ] Determinismus absichern: Evalzeilen in Dateireihenfolge verarbeiten, keine Uhrzeit in
      Berichte aufnehmen, JSON mit `sort_keys=True`, stabilen Listen und abschließendem
      Newline ausgeben. Ein fixer Evalfall mit `as_of` bleibt vollständig zeitunabhängig;
      Fälle ohne `as_of` verwenden bewusst die vom Shared Index definierte aktuelle
      Frischeklassifikation und sollten im versionierten Baseline-Set keine zeitkritischen
      Erwartungen enthalten.

## Task P4.2 — Recall@k, MRR und stale-result rate exakt berechnen

- [ ] Für jeden Fall die geordneten Ergebnis-Slugs aus den höchstens `k` Treffern ableiten.
      `Recall@k = |relevant_slugs ∩ returned_slugs[:k]| / |relevant_slugs|`.
      Reciprocal Rank ist `1 / rank` des ersten relevanten Treffers (Rank beginnt bei 1),
      andernfalls `0`. Die aggregierten Werte sind das arithmetische Mittel der Fallwerte.
- [ ] Die stale-result rate als
      `Anzahl zurückgegebener Treffer mit freshness == "stale" / Anzahl aller
      zurückgegebenen Treffer` berechnen; bei null Treffern ist sie `0`. `future` und
      `unknown` werden separat gezählt und im Report sichtbar gemacht, aber nicht als
      `stale` umetikettiert. Dadurch bleibt die Metrik an den p2-Frischevertrag gebunden und
      Legacy-Wissen wird nicht als nachweislich veraltet behauptet.
- [ ] JSON-Ausgabe mit stabilem Schema erzeugen:
      `schema_version: 1`, `eval_set`, `top_k`, `case_count`, `metrics` mit
      `recall_at_k`, `mrr`, `stale_result_rate`, `returned_results`, `stale_results`,
      `future_results`, `unknown_results` sowie `cases`. Jeder Case enthält `id`, `query`,
      `top_k`, normalisierte `filters`, `relevant_slugs`, `returned_slugs`, `recall_at_k`,
      `reciprocal_rank` und die vier Freshness-Zähler. Fließkommazahlen auf sechs
      Dezimalstellen runden, sodass wiederholte Läufe byte-identische JSON-Ausgabe liefern.
- [ ] Human-Ausgabe aus denselben berechneten Daten rendern: eine stabile Kopfzeile mit
      Evalset, Fallzahl und effektivem Default-k, danach exakt eine Zeile je Fall und eine
      Summary mit `Recall@k`, `MRR`, `stale-result rate` und den Trefferzählern. Es gibt
      keine getrennte Berechnung für das Textformat.
- [ ] Baseline-only Semantik umsetzen: Ein gültig ausgeführter Lauf endet unabhängig von den
      gemessenen Qualitätswerten mit Exit 0. Weder `--min-recall`, `--min-mrr` noch ein
      anderer harter Schwellwert wird angeboten. Nur CLI-/Datensatz-/Indexfehler liefern
      Exit 2. Ein Quality-Gate bleibt einem späteren, anhand der gespeicherten Baseline
      begründeten Spec-Delta vorbehalten.

## Task P4.3 — Taskfile als einheitliche Bedienoberfläche verdrahten

- [ ] In `taskfiles/Taskfile.brain.yaml` diese vier Tasks ergänzen; alle Argumente werden über
      `{{.CLI_ARGS}}` weitergereicht und keine Skriptlogik wird in YAML dupliziert:

```yaml
  eval:
    desc: "Run deterministic offline Brain retrieval evaluation (report-only)"
    cmds:
      - 'python3 scripts/brain-retrieval-eval.py --wiki-dir "${BRAIN_WIKI_DIR:-$HOME/brain/wiki}" --eval-set tests/fixtures/brain/retrieval-eval.jsonl {{.CLI_ARGS}}'

  lifecycle:audit:
    desc: "Audit Brain provenance, validity and claims without mutation"
    cmds:
      - 'python3 scripts/brain-lifecycle-audit.py --brain-repo "${BRAIN_REPO:-$HOME/brain}" --source-root . {{.CLI_ARGS}}'

  expertise:fetch:
    desc: "Fetch and redact evidence for one explicitly selected GitHub PR"
    cmds:
      - 'python3 scripts/brain-expertise.py fetch {{.CLI_ARGS}}'

  expertise:stage:
    desc: "Render a local review candidate from redacted PR evidence"
    cmds:
      - 'python3 scripts/brain-expertise.py stage {{.CLI_ARGS}}'

  expertise:approve:
    desc: "Approve a reviewed expertise candidate into the allowlisted source tree"
    cmds:
      - 'python3 scripts/brain-expertise.py approve {{.CLI_ARGS}}'
```

- [ ] Die Taskfile ändert weder `scripts/brain-lifecycle-audit.py` aus p1 noch
      `scripts/brain-expertise.py` aus p3. `task brain:eval -- --format json`,
      `task brain:lifecycle:audit -- --format json`,
      `task brain:expertise:fetch -- --repo Paddione/Bachelorprojekt --pr 123
      --revision 0123456789abcdef0123456789abcdef01234567`,
      `task brain:expertise:stage -- --repo Paddione/Bachelorprojekt --pr 123
      --revision 0123456789abcdef0123456789abcdef01234567` und
      `task brain:expertise:approve -- --repo Paddione/Bachelorprojekt --pr 123
      --revision 0123456789abcdef0123456789abcdef01234567 --slug
      review-gated-brain-ingest --approval-file /tmp/brain-expertise-approval.txt` sind die
      dokumentierten Einstiegspunkte. Fetch/Stage/Approve werden hier nur per `--help` auf
      Erreichbarkeit geprüft, damit der Plan weder Netzwerkzugriff noch eine Freigabe auslöst.

## Task P4.4 — Syntax, Determinismus und report-only Verhalten abnehmen

- [ ] Nach Integration von p5 zuerst dessen fokussierten Test gegen den noch fehlenden Runner
      ausführen:

```bash
bats tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
# expected: FAIL — scripts/brain-retrieval-eval.py und task brain:eval fehlen vor diesem Partial.
```

- [ ] Nach Implementierung Syntax und Task-Erreichbarkeit ohne Netz oder Mutation prüfen:

```bash
python3 -m py_compile scripts/brain-retrieval-eval.py
python3 scripts/brain-retrieval-eval.py --help
task brain:eval -- --help
task brain:lifecycle:audit -- --help
task brain:expertise:fetch -- --help
task brain:expertise:stage -- --help
task brain:expertise:approve -- --help
```

- [ ] Den p5-Test grün ausführen. Er muss denselben Fixture-Wiki- und JSONL-Input zweimal mit
      `--format json` auswerten, byte-identische Ausgaben vergleichen, die Handrechnung für
      Recall@k/MRR/stale-result rate prüfen, Offline-Betrieb erzwingen und bestätigen, dass
      schlechte Metriken wegen der Baseline-only Semantik trotzdem Exit 0 liefern:

```bash
bats tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
# expected: PASS
```

## Scope-Grenzen

- Keine Änderungen an `scripts/brain-index.py` oder `scripts/brain-mcp-server.py`; p2 besitzt
  Shared Index, Filter, Ranking und Freshness-Vertrag.
- Keine Evalset-, Wiki-Fixture- oder BATS-Dateien und kein Test-Inventar; p5 besitzt diese
  exklusiv.
- Keine Änderungen an Lifecycle-Audit, Expertise-Pilot, Ingest, Schema oder Manifesten.
- Keine Netzwerkzugriffe, Ergebnisdateien, Datenbank, Vektor-/Graph-Suche oder automatische
  Wiki-Mutation.
- Kein harter Retrieval-Schwellwert und kein CI-Qualitätsgate im ersten Baseline-Release.
