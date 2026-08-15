---
title: "s3-finetune-dataset-recipe — Implementation Plan"
ticket_id: T006252
domains: [dev-tooling, factory, test]
status: active
---

# s3-finetune-dataset-recipe — Implementation Plan

## Partials

| p1-anreicherung | tasks.d/p1-anreicherung.md | impl | scripts/finetune/collect_factory_traces.py, taskfiles/Taskfile.finetune.yml, scripts/finetune/README.md | |
| p2-tests | tasks.d/p2-tests.md | tests | tests/spec/unsloth-training-env/factory-traces.bats | p1-anreicherung |

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/finetune/collect_factory_traces.py` | 137 | 663 |
| `taskfiles/Taskfile.finetune.yml` | 99 | n.a. (S1-ungated) |
| `scripts/finetune/README.md` | 94 | n.a. (S1-ungated) |
| `tests/spec/unsloth-training-env/factory-traces.bats` | 70 | — (keine wirksame Schwelle) |

Budgetnotiz: `collect_factory_traces.py` ist nicht-baselined, wirksame Schwelle =
statisches `.py`-Limit 800 → Budget 663. `Taskfile.finetune.yml` und `README.md` haben
keine S1-Limit-Extension und keine Baseline (T002265). `.bats` hat keinen Eintrag unter
`s1.limits` in `docs/code-quality/gates.yaml` — das S1-Ratchet überspringt die Extension.

## Task 1 — Partials umsetzen

1. **p1-anreicherung** (`tasks.d/p1-anreicherung.md`): Collector-Flag `--with-context`
   + `--comments-json` in `scripts/finetune/collect_factory_traces.py` (E7-Rollen-Mapping,
   Secret-Redaktion auf angereicherten Feldern), Durchreichung in
   `taskfiles/Taskfile.finetune.yml`, Dokumentation in `scripts/finetune/README.md`.
2. **p2-tests** (`tasks.d/p2-tests.md`): Rotlauf der zwei neuen `@test`-Blöcke in
   `tests/spec/unsloth-training-env/factory-traces.bats` (Failing-Test-Step mit
   `expected: FAIL`, echter BATS-Aufruf), dann GREEN nach p1.

## Task 2 — Recipe-Gates bis DRY_RUN (Ausführung gemäß Design „Recipe-Anforderungen")

Der Scope endet bei DRY_RUN-grün — der echte GPU-Lauf ist ein Folge-Ticket (E6,
Brainstorming-Entscheidung 2026-08-15).

1. **Korpus ziehen (Stufe 1):** ROWS_JSON über die SQL aus design.md „Datensatz-Beschaffung"
   Schritt 2 (Phase-Events mit `verify`+`done`, JOIN auf `tickets.tickets` für
   `description`/`title`), Kommentare über den Kommentar-SQL (Autor, Body, `created_at`).
   → 4251 Phase-Event-Zeilen, 1028 Kommentarzeilen (s. Messbericht §1).
2. **DSGVO-Stichproben-Pass:** Vor dem Export Stichprobe (≥ 10 Zeilen) auf Personen-/
   Brand-Daten prüfen; Funde werden ausgeschlossen oder redigiert. Bei ungeklärten
   Funden: Abbruch und Eskalation, kein Export.
   → GATE PASSED: 0 Emails, 0 IBANs; Phone-Kandidaten sind Datums-/Maschinenkontext (s. Messbericht §2).
3. **JSONL erzeugen:** `task finetune:traces
   ROWS_JSON=outputs/finetune/rows-verify-done.json
   COMMENTS_JSON=outputs/finetune/comments-verify-done.json WITH_CONTEXT=1
   OUT=outputs/finetune/s3-qwen35-lauf1.jsonl`
   (Zielverzeichnis ist gitignored — nie ins Repo).
   → 358 erfolgreiche Laeufe, 338 mit Kontext-Turns (s. Messbericht §1).
4. **E5-Gate:** Unsloth-Support für Qwen3.5-4B über den `unsloth-buddy`-Skill
   verifizieren; Befund (gepatcht/ungepatcht) dokumentieren. Bei ungepatcht:
   Fallback TRL dokumentieren, Entscheidung nach Befund, nicht vorab.
   → GEPATCHT (PR #5442 Loss-Patch, #6968 transformers-5.x-Sidecar); Kaveat: Flaggschiff
   multimodal, Text-Variante `techwithsergiu/Qwen3.5-text-4B`; kein TRL-Fallback (s. Messbericht §3).
5. **Messung:** `task finetune:measure` — `max_seq_length` aus den Perzentilen,
   Machbarkeitsmatrix für Qwen3.5-4B auf RTX 5070 Ti (16 GB) in den Messbericht.
   → Median 805,5 / p95 2092,7; 3072 empfohlen (1,96 % Kuerzung); ~4,4–4,8 GB auf 16 GB (s. Messbericht §4).
6. **Template-Guard:** `task finetune:guard` — Referenz ist das Hub-Template des
   Basismodells; Byte-Gleichheit über den ganzen Korpus.
   → GATE PASSED (358 Zeilen, je 2 Renderings, byte-identisch); Guard um GenerationTag-
   Pass-through-Extension erweitert (Befund: Plain-Jinja2 kann den Marker nicht parsen,
   s. Messbericht §5).
7. **DRY_RUN:** `task finetune:train DRY_RUN=1` — Lernsignal-Anteil ausgeben,
   Zeilen ohne Lernsignal verwerfen und zählen; Abbruch bei leerem Lernsignal.
   Ergebnis: Messbericht als Artefakt (`openspec/changes/s3-finetune-dataset-recipe/artifacts/messbericht.md`),
   der dem Folge-Lauf-Ticket als Vorbedingung dient.
   → GATE PASSED (Exit 0); Kernbefund: Hub-Template ohne `{% generation %}` → 100 %
   Zeilenverwurf; gepatchtes Template → 3/358 @3072, Lernsignal 0,4039 (s. Messbericht §6–§7).

## Task 3 — Finale Verifikation (STRUCT3)

1. BATS-Greenlauf des angereicherten Guards (alle fünf `@test`-Blöcke):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-training-env/factory-traces.bats
# expected: PASS
```

2. Mandatory Verify-Commands:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
