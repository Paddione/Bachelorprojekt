# p6 — Tests und Kalibrierung

**Rolle:** tests · **Hängt ab von:** p1, p2, p3, p4, p5

**Dateien:** `tests/spec/openspec-pgvector/context-retrieve-cli.bats`,
`tests/spec/openspec-pgvector/context-retrieve-fallback.bats`,
`tests/spec/openspec-pgvector/context-retrieve-recall.bats`,
`tests/fixtures/context-retrieve/golden-queries.json`

Alle Tests verifizieren **Kommando-Ausgaben** (`run`, `$output`, `$status`) statt Skript-Interna
(Repo-Konvention T002448-M4). Ablage nach `tests/spec/openspec-pgvector/` gemäss T002416: ein
Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang. Der vendorierte Runner ist
`tests/unit/lib/bats-core/bin/bats` — nicht `which bats`.

## 1. Failing-Test zuerst schreiben und rot sehen

Lege `tests/spec/openspec-pgvector/context-retrieve-cli.bats` an mit einem Test, der
`scripts/context-retrieve.mjs --task-prompt "…" --role bachelorprojekt-infra --json` ausführt und
in der Ausgabe genau einen Embedding-Aufruf sowie höchstens einen Rerank-Aufruf erwartet.
Führe ihn aus, **bevor** p2 bis p4 implementiert sind:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-pgvector/context-retrieve-cli.bats
# expected: FAIL — scripts/context-retrieve.mjs existiert noch nicht
```

## 2. Fallback-Verhalten

`context-retrieve-fallback.bats`:
- Bei unerreichbarem Embedding-Backend: Exit-Status 0, Header meldet `mode=rulefilter`,
  Blockkörper enthält den Klartext-Warnsatz.
- `--budget 0`: die Guardrail-Inhalte erscheinen dennoch, `mode` ist `truncated`.
- Null Kandidaten ergeben einen **nicht-leeren** Block.

## 3. Recall gegen das Golden-Set

`context-retrieve-recall.bats` gegen `tests/fixtures/context-retrieve/golden-queries.json`:
mindestens zehn reale Aufgabentexte mit je mindestens einem Chunk, der im Ergebnis erscheinen
muss. Die Fixture-Einträge referenzieren Chunks über **stabile Merkmale** — Slug plus
Abschnittstitel — statt über Chunk-UUIDs, die sich bei jedem Reindex ändern.

Die Fixture verlangt nur, dass der geforderte Chunk **enthalten** ist, nicht dass er an erster
Stelle steht: ein wachsender Korpus kann bessere Treffer liefern, ohne dass die Qualität sank.

## 4. Positiv-Anker in jedem Negativtest ⚠

Wo ein Test behauptet, etwas dürfe nicht auftreten, prüft **derselbe Test zuerst**, dass der
gültige Fall durchläuft (T002356-M1). Ohne diesen Anker besteht ein Negativtest vakuos, sobald
die Kandidatenliste leer ist — „1 ist nicht in []" gilt trivial.

## 5. Index-Existenz

Eigener Fall: `pg_indexes` liefert `chunks_embedding_hnsw` für `knowledge.chunks`. Die Assertion
liest die **Datenbank**, nicht den Text der Migrationsdatei aus p1.

## 6. Kalibrierung

Miss mit `--json` über das Golden-Set, wie sich Recall und Token-Verbrauch bei `limit` 20, 40 und
60 sowie Budget 2000, 4000 und 8000 verhalten. Referenzlatenzen nach T002661: Rerank über 20
Kandidaten 3,42 s, über 40 Kandidaten 6,35 s — die Wahl ist Recall gegen Latenz, nicht mehr
Machbarkeit.

Trage die gewählten Vorgabewerte samt Messwerten in `design.md` unter „Offene Parameter" nach.
Die Werte bleiben konfigurierbar; die Messung ersetzt die Schätzung, sie verdrahtet sie nicht fest.

## 7. Inventar

`task test:inventory` regenerieren und `website/src/data/test-inventory.json` mitcommitten — CI
vergleicht das Inventar gegen den Commit-Stand. Ebenso `task freshness:regenerate`, damit
`docs/code-quality/repo-index.json` die neuen Testdateien kennt.

<!-- vitest: kein neuer Test nötig, weil dieser Change keine Dateien unter website/src/lib oder
     website/src/pages/api anlegt oder ändert — die Schicht lebt vollständig unter scripts/. -->
