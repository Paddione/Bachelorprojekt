# Runbook: agent-bench (Agentenrollen reproduzierbar messen)

`scripts/llm/agent-bench/bench.mjs` misst, wie gut Modelle die Agentenrollen Planner,
Orchestrator, Code-Worker, Vision-Worker und Reviewer einzeln und in Kombination erfuellen
(T900561). Jede Rolle laeuft ueber den echten Ablauf (Plan-Runner-Format, `opencode run`
fuer Worker); jede Anfrage geht durch einen Trace-Recorder je Rolle. Bewertung als Vektor
(Outcome/Fehler/Umwege/Aufwand) mit versionierter Gewichtung (`scoring.json`), deterministisch:
gleicher Trace + gleiche Version = gleicher Score.

Module unter `scripts/llm/agent-bench/`: `bench.mjs` (CLI: run, resume, report, gate,
export-corpus), `lib/cases.mjs` (Fall-Laden/Validierung), `lib/scoring.mjs` (O/E/D/T),
`lib/recorder.mjs` (Trace-Proxy, Schwaerzung, Bild-Ablage), `lib/matrix.mjs` (Belegungen,
Stufen-Cache, Scheduler), `lib/loadouts.mjs` (GPU-Lock, Modell-Starts, Restore),
`lib/report.mjs` (Marginal/Kompatibilitaet/Entdeckungen, Gate), `lib/corpus.mjs`
(Korpus-Export), `lib/roles.mjs` + `lib/roles/` (Rollen-Adapter), `models.json`
(Modell-Pool), `scoring.json` (Gewichte), `vllm-kernel-check.py` (NVFP4-Kernel-Check).
Nur Node-Standardbibliothek (plus Python-Stdlib fuer den Kernel-Check).

## Voraussetzungen

- GPU-Host mit beiden Karten: RTX 5070 Ti (`:1919`, Orchestrator-Modell) und RTX 3060 Ti
  (`:8080`, Qwen3.5-4B-MTP-Worker-Pool, Windows-nativ). Produktion: `qwen38-gsq-iq3xxs.service`
  (WSL-Unit) + Windows-Autostart des :8080-Pools (`scripts/llm/register-qwen35-4b-autostart.ps1`,
  kein systemd).
- vLLM 0.30.0 unter `~/opt/vllm-nvfp4`, Modell `~/models/gemma-4-12b-it-NVFP4`
  (nur fuer `gemma4-12b-nvfp4`-Laeufe noetig).
- `opencode` im `PATH` mit den Primaer-Agenten `plan-worker-qwen35` und `plan-worker-self`.
- `scripts/llm/plan-runner.mjs` auf dem Arbeitsstand (Orchestrator-Rolle ruft ihn auf).
- Laufdaten liegen ausserhalb des Repos unter `$AGENT_BENCH_RUNS` (Default
  `~/agent-bench-runs`); nur Messberichte gehen nach `scripts/llm/measurements/`.

## Aufruf

```bash
node scripts/llm/agent-bench/bench.mjs run --profile quick|full --roles <csv> --models <csv> \
  [--cases <csv>] [--reps N] [--seed S] [--mode isolated|chained] [--split eval|train]
node scripts/llm/agent-bench/bench.mjs resume <run-id>
node scripts/llm/agent-bench/bench.mjs report <run-id> [--baseline <run-id>]
node scripts/llm/agent-bench/bench.mjs gate <run-id> --baseline <run-id>
node scripts/llm/agent-bench/bench.mjs export-corpus <run-id...> --out <dir>
```

- `--roles`: `planner,orchestrator,code-worker,vision-worker,reviewer` (Auswahl).
  Unbekannte Rolle → Exit 2, bevor irgendetwas geladen wird.
- `--models`: IDs aus `models.json` (Default: alle `enabled`). Explizit genannte Modelle
  duerfen `enabled: false` sein (so wird das Teacher-Modell aktiviert).
- `--cases`: Fall-IDs, optional mit `:variante` (z. B. `--cases f1-store-cleanup:v-clean`).
- `--reps`: Default quick 1, full 3. `--seed`: Default zufaellig (steht im Manifest).
- `--mode`: `isolated` (Referenz-Artefakte je Stufe) oder `chained` (echte Verkettung).
- `--split`: nur `eval`- oder nur `train`-Faelle laufen lassen.
- Env: `AGENT_BENCH_RUNS`, `AGENT_BENCH_CASES` (Default `scripts/llm/agent-bench/cases`),
  `AGENT_BENCH_MODELS` (Default `scripts/llm/agent-bench/models.json`),
  `AGENT_BENCH_MAX_JOBS` (Default 400, Stichproben-Deckel im full-Profil),
  `AGENT_BENCH_4B_SLOTS` (Default 1), `AGENT_BENCH_TEACHER_URL` (Pflicht bei
  Teacher-Laeufen), `AGENT_BENCH_WORKER_AGENT` (Default `plan-worker-qwen35`).

Exit-Codes: `0` ok; `1` Gate-Regression (nur `gate`); `2` Konfigurationsfehler
(unbekannte Rolle/Modell/Fall, Fall-Validierung, Scoring-Versions-Mismatch im Gate).
Die letzte stdout-Zeile von `run`/`resume` lautet
`AGENT-BENCH: run=<id> jobs=<n> done=<n> infra=<n>`.

## Fall-Layout

```
scripts/llm/agent-bench/cases/<fall-id>/
  case.json                 { split: eval|train, source_ref }
  source.md                 Begebenheit (Pflicht): Anfrage, richtige Entscheidung, Misslingen
  base/ | replay.json       Fixture-Basis ODER { parent_commit, change_path }
  variants/<vid>/
    brief.md                Auftrag
    variant.json            { perspective, roles, budget {tokens, turns}, budget_source, expected_decision }
    reference/              Plan im Plan-Runner-Format (tasks.md + Partials, ein Partial)
    checks/run.sh           Exit 0 = gruen, nur offline, cwd = Workdir
    checks/expected.json    Vision: { fields, forbidden }
    checks/diffs/           Reviewer: clean.diff ODER seeded-*.diff + seeded-*.json
    fault/                  faulty-worker: Injektor-Skript (erster Worker-Aufruf failt)
```

Perspektiven: `clean`, `ambiguous`, `faulty-worker`, `conflicting`, `detour-trap`, `vision`.
Konvention: Referenzplaene haben genau ein Partial, damit Worker-Laeufe die Checks
erreichen koennen. Rollen laufen nur auf Varianten, die sie in `roles` nennen.

## Scoring-Version erhoehen

`scoring.json` traegt `version`. Erhoehen, sobald sich Gewichte oder Ereignis-Arten
aendern (sonst vergleicht das Gate Ungleiches — es verweigert bei Mismatch mit Exit 2):

1. `version` + 1, Gewichte anpassen, Rollen-Adapter bei neuen Events nachziehen.
2. Baseline neu erzeugen (`run --profile full ...`, als Baseline ablegen).
3. `tests/spec/agent-bench/` anpassen, `task test:inventory` neu erzeugen.

## Profile und Laufzeit

- `quick` (≤ 1 h): Diagonale (jedes Modell allein) + Baseline
  (`qwen38-27b` plant/orchestriert/reviewt, `qwen35-4b` arbeitet), 1 Rep, erste
  Variante je Fall. Baseline nur, wenn beide Modelle gewaehlt sind.
- `full` (nachts): alle Varianten, 3 Reps, ganze Matrix; ueber `AGENT_BENCH_MAX_JOBS`
  hinaus Stichprobe mit Seed (`sampled: true` im Manifest und Report).
- Umladen kostet je Wechsel 0,5–3 min; der Scheduler gruppiert nach Loadout
  (Anzahl im Manifest unter `reloads`).

## Restore-Verhalten und manuelle Wiederherstellung

Vor GPU-Laeufen sperrt der Bench `scripts/gpu-lock.sh`, stoppt die Produktion und
prueft Kernel (NVFP4, kein Marlin-Fallback) und Spill-Grenze (~15,9 GB). Danach —
auch bei Abbruch und Fehler — stellt er die Produktion wieder her und gibt den Lock
frei (Trap via `installRestoreHooks`). Pruefen und notfalls von Hand:

```bash
systemctl --user is-active qwen38-gsq-iq3xxs
systemctl --user start qwen38-gsq-iq3xxs
curl -sf -m 5 http://127.0.0.1:8080/health   # 4B-Pool (Windows-nativ, kein systemd)
bash scripts/gpu-lock.sh release
```

## Neuen Fall anlegen

1. Verzeichnis nach Fall-Layout anlegen (Tabelle oben); `source.md` schildert die echte
   Begebenheit, `case.json` setzt `split` je Begebenheit (nie je Variante).
2. `reference/` im Plan-Runner-Format mit genau einem Partial; `checks/run.sh` offline.
3. Validieren und Rot/Gruen nachweisen:
```bash
node -e "import('./scripts/llm/agent-bench/lib/cases.mjs').then(m=>{const r=m.validateCases('scripts/llm/agent-bench/cases');console.log(JSON.stringify(r));process.exit(r.ok?0:1)})"
for c in scripts/llm/agent-bench/cases/*/variants/*/checks/run.sh; do bash -n "$c"; done
```
   Jede `run.sh` muss gegen die Referenzloesung gruen und gegen den unveraenderten
   Ausgangszustand rot sein (einmal manuell geprueft, in `source.md` vermerkt).
4. Neue Faelle brauchen keine Codeaenderung (Cases-as-Data); Tests pruefen das
   (`tests/py/spec/native_ported/spec/agent-bench/test_scoring.py`, "New case needs no code change").

## Kernel-Check

```bash
python3 scripts/llm/agent-bench/vllm-kernel-check.py <serverlog> [--expect-capability 12.0] [--skip-capability]
```

Exit `0` FP4-Kernel bestaetigt, `1` Marlin-Fallback/keine FP4-Zeile/falsche Capability,
`2` Aufruffehler. Der Bench ruft ihn je vLLM-Loadout auf und verwirft den Loadout als
Infra-Fehler, wenn er ablehnt. `--skip-capability` prueft nur das Log (ohne torch/CUDA).

## Tests

```bash
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/agent-bench/
task test:inventory   # nach neuen/faelligen Testdateien
```

Alle Tests laufen ohne GPU (Fake-Server, Fake-Binaries, Fake-Modellpool).
Mess-Konvention: Jeder Messbericht unter `scripts/llm/measurements/` nennt den
ausfuehrbaren `bench.mjs run …`-Befehl mit allen Flags.
