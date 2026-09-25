# Runbook: Brain-Ingest (LLM-Wiki-Kompilierung)

Betreibt den vollautomatischen Brain-Ingest: transformiert Bachelorprojekt-Quellen
(SSOT-Specs, Runbooks, ADRs, Gotchas, Agent-Guide-Maps, Core-Doku, Health-Goals,
Diagramme) per lokalem LLM in Wiki-Seiten und liefert sie per PR an das externe
Repo `Paddione/brain`. Enthält **keine** Credentials.

Soll-Zustand im Repo:

- `scripts/brain-ingest.sh` — Pipeline (Chunking → LLM-Transform → MOC → Prune → Gates → Delivery)
- `scripts/brain/ingest-sources.yaml` — Manifest: Quellgruppen, Typ- und Tag-Mapping
- `scripts/brain-ingest-worklist.sh` — Worklist-Generator (TAB-separiert: Pfad, Slug, Gruppe)
- `scripts/brain-ingest-prune.sh` — Deletion-Sync (Default dry, `--prune` löscht scharf)
- `scripts/brain-chunk.sh` — abschnittsweiser Chunker (Zielgröße 8000 Zeichen)
- `taskfiles/Taskfile.brain.yaml` — Tasks `brain:ingest:dry|pilot|run`, `brain:eval`, `brain:lifecycle:audit`
- `.agents/skills/brain-ingest/SKILL.md` — Skill-Doku (Trockenlauf, Pilot, Vollauf, Prune)

3558, T014339 (llama.cpp-Port), T001963 (Prune), T002679 (Chunking/Retrieval).

## Vorbedingungen

1. Brain-Checkout vorhanden: `~/brain` zeigt auf `Paddione/brain`, Branch `main`
   ist aktuell (`git -C ~/brain pull --ff-only`).
2. Lokaler LLM-Endpunkt erreichbar: `http://127.0.0.1:1919` (llama.cpp,
   Modell `Muse-Glimmer-30B`). Prüfung:
   `curl -s http://127.0.0.1:1919/health` → `{"status":"ok"}`.
3. State-Datei vorhanden: `~/.brain-ingest-state.json` (Chunk-Hash → Seite;
   Idempotenz: unveränderte Chunks werden übersprungen, nur geänderte neu
   transformiert).
4. CLI-Verfügbarkeit: `gh` (PR-Erstellung), `jq`, `gitleaks` (Secret-Scan-Gate).

## Runbook-Betrieb: Brain-Ingest planen und auslösen

Standardreihenfolge für einen Produktionslauf:

1. Trockenlauf (schreibt Seiten lokal ins Brain-Repo, kein Commit/Push/PR):

   ```bash
   task brain:ingest:dry
   ```

2. Optional Pilot (erste 20 Quellen, mit Delivery):

   ```bash
   task brain:ingest:pilot
   ```

3. Vollauf mit scharfem Deletion-Sync:

   ```bash
   task brain:ingest:run -- --prune
   ```

Der Vollauf erzeugt den Delivery-Branch `feature/brain-initial-ingest` **frisch ab
`origin/main`**, transformiert geänderte Chunks (parallel, `MAX_PARALLEL=4`),
schreibt MOC-Seiten neu, prunt seiten ohne lebende Quelle, passiert die Gates
(Coverage ≥ 95 %, Frontmatter-Lint, Wikilink-Lint, Secret-Scan) und erstellt
automatisch einen PR gegen `Paddione/brain`. Das Zusammenführen des PRs ist
**manuell** (Squash-Merge, danach Remote-Branch löschen).

Einzelnes Thema nachladen (nur eine Manifest-Gruppe transformieren):

```bash
task brain:ingest:run -- --group runbooks
```

Gültige Gruppen stehen in `scripts/brain/ingest-sources.yaml` (`ssot-specs`,
`runbooks`, `adr`, `gotchas-footguns`, `agent-guide-maps`, `core-docs`,
`health-goals`, `diagrams`, `github-reviewed`); unbekannte Namen brechen den
Lauf fail-closed ab. MOC-Seiten und `index.md` werden dabei immer vollständig
neu geschrieben (Metadaten-Refresh, kein LLM), der Prune bleibt global.
`--group` ist nicht mit `--from-scratch` kombinierbar.

## Delivery abschließen: PR mergen und Branch pflegen

1. PR-Status prüfen (Checks müssen grün sein, sonst Fehlerursache im
   `brain-ci`-Workflow lesen):

   ```bash
   gh pr view <NR> --repo Paddione/brain --json state,mergeable,statusCheckRollup
   ```

2. Squash-Merge mit Branch-Löschung:

   ```bash
   gh pr merge <NR> --repo Paddione/brain --squash --delete-branch
   ```

3. Lokalen Brain-Checkout nachziehen:

   ```bash
   git -C ~/brain checkout -q main && git -C ~/brain pull -q --ff-only
   ```

Der gelöschte Remote-Branch ist kein Hygiene-Detail: Phase 4 verweigert den Push,
solange `origin/feature/brain-initial-ingest` nicht vom aktuellen `origin/main`
abstammt (T013914-Gate). Ein vergessener Branch blockiert den nächsten Lauf mit
`diverged from delivery base`.

## Merge-Hook und manueller Eingriff

Push-getriggerte Teilsyncs (`.github/workflows/brain-merge-hook.yml`) spiegeln
geänderte Bachelorprojekt-Dateien als Rohkopien nach `~/brain/raw/` (Commits
`chore: auto-ingest from Bachelorprojekt [skip ci]`). Sie berühren **nie**
LLM-Seiten unter `wiki/` — beide Mechanismen sind konfliktfrei. Läuft `main` im
Brain-Repo während eines Ingest-Laufs weiter, rebast Phase 4 den erzeugten Commit
automatisch auf das neue `main` (Staleness-Gate T013041).

## Verifikation: Audit und Retrieval-Eval

Nach jedem Lauf den Bestand prüfen (beide Befehle sind deterministisch und
ändern nichts):

```bash
python3 scripts/brain-lifecycle-audit.py --brain-repo ~/brain --source-root .
python3 scripts/brain-retrieval-eval.py --wiki-dir ~/brain/wiki \
  --eval-set tests/fixtures/brain/retrieval-eval.jsonl
```

Das Audit meldet `stale_source` (Quelle neuer als Seite → Nachlauf nötig),
`source_unavailable` (Quelle gelöscht → Prune nötig) und `metadata_unknown`
(Seite ohne Provenienz-Frontmatter). Exit-Code 1 bedeutet Findings, nicht
Absturz. Die Eval misst Recall@k/MRR über `tests/fixtures/brain/retrieval-eval.jsonl`.

## Prune-Verhalten und Meta-Seiten

Der Prune läuft in **jedem** Ingest-Durchgang mit (Default dry). Nur `--prune`
löscht scharf. Niemals gelöscht werden Meta-Seiten (`source::` mit Wert `self`,
`test` oder `<Thema> (self)`, z. B. `wiki/index.md`, `wiki/index-moc.md`,
`wiki/example-note.md`) sowie Seiten ohne Bachelorprojekt-Quelle und ohne
State-Eintrag. Legitim geprunte Seiten (archivierte Proposals, gelöschte Specs)
dürfen nicht wiederhergestellt werden, um tote Links zu reparieren — stattdessen
die verweisende Seite pflegen.

## Fehlerbilder und Behebung

| Symptom | Ursache | Behebung |
|---|---|---|
| `diverged from delivery base` in Phase 4 | Stale Remote-Branch eines älteren Laufs | `git push origin --delete feature/brain-initial-ingest`, Lauf wiederholen |
| CI-`lint` rot mit `dead wikilink` in `SCHEMA.md`/`log.md` | Wikilink-Autofix schreibt Root-Dateien, committet aber nur `wiki/` + `index.md` | Root-Dateien von Hand korrigieren, auf den PR-Branch committen, pushen |
| Viele `LLM failed`, Lauf bricht mit Fehlerschwelle ab | Endpunkt tot oder überlastet | `:1919/health` prüfen; Stellschrauben `INGEST_MAX_FAIL_ABS/_PCT/_MIN_SAMPLE`; Nachlauf holt Fehlendes idempotent nach |
| `FAIL: Coverage gate` | Zu viele Chunks unter der Abdeckung | Log auf `FAILED`-Chunks prüfen, Ursache (meist LLM-Fehler) beheben, Lauf wiederholen |
| Audit meldet `stale_source` direkt nach grünem Lauf | Commits landeten nach Laufstart (Merge-Hook läuft weiter) | Normaler Drift — Nachlauf einplanen, kein Fehler |
| `--from-scratch` angefragt | Vollständiger Neuaufbau (State-Reset + alle Chunks neu) | Nur nach Freigabe: GPU-Lauf über den Gesamtbestand (Stunden), nicht mit `--pilot` kombinierbar |

## From-Scratch-Neuaufbau und Schema-Migration

Der Normalbetrieb ist idempotent: unveränderte Chunks werden übersprungen, ihre
Seiten behalten Inhalt **und** Frontmatter-Schema des ursprünglichen Laufs. Zwei
Fälle verlangen trotzdem einen vollständigen Neuaufbau:

1. Altschema-Seiten: Wiki-Seiten aus früheren Pipeline-Generationen (ohne
   `source_kind`/`source_revision`/`observed_at`/`valid_from`) werden vom
   Lifecycle-Audit als `metadata_unknown` gemeldet, obwohl ihr Inhalt aktuell
   ist. Nur eine Neu-Transformation stempelt das aktuelle Schema.
2. State-Drift: Die State-Datei behauptet fälschlich, ein Chunk sei
   transformiert (z. B. nach Delivery-Abbruch ohne Merge) — der Neuaufbau
   setzt den State auf `{}` zurück und transformiert alles neu.

Befehl (bewusst **ohne** `--pilot` kombinierbar — sonst würde das Wiki
vollständig gelöscht, aber nur ein Ausschnitt neu aufgebaut):

```bash
bash scripts/brain-ingest.sh --brain-repo ~/brain --from-scratch
```

Mit `--dry-run` werden Reset und Löschungen nur gemeldet (komplett
schreibfreie Vorschau). Der scharfe Lauf löscht zuerst alle aus
Bachelorprojekt erzeugten Wiki-Seiten, transformiert den Gesamtbestand neu
(GPU-Lauf über alle Chunks, Größenordnung Stunden) und liefert per PR.
Meta-Seiten (`(self)`-Quellen) bleiben immer erhalten. Wegen der Kosten nur
nach Freigabe laufen lassen und danach Audit + Eval zur Abnahme ausführen.

## Eskalation

- LLM-Endpunkt dauerhaft unerreichbar: `incident-response`-Skill (k3s/Host-Diagnose
  für den Inferenz-Dienst), danach Ingest nachholen.
- Brain-Repo nicht pushbar (Rechte/Netz): Delivery-Commit liegt lokal auf dem
  Delivery-Branch — nichts geht verloren; Push/PR manuell nachholen.
- Wiederkehrende CI-Lint-Fehler nach Prune: verweisende Meta-Seiten im Brain-Repo
  pflegen (siehe oben), kein Revert des Prune.
