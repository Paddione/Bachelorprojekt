---
ticket_id: T001608
plan_ref: openspec/changes/brain-quality-goals/tasks.md
status: active
date: 2026-07-03
---

# brain-quality-goals — G-BRAIN-Qualitätsziele + Nutzungs-Doku für das LLM-Wiki

**Branch:** `feature/brain-quality-goals`
**Datum:** 2026-07-03
**Baseline (live gemessen, 2026-07-03):** brain-Repo im reinen Seed-Zustand (2 wiki/-Seiten, 0 raw/-Dateien); 4 empirisch verifizierte Linter-Löcher + 2 Pipeline-Lücken; 0 Nutzungs-Doku-Seiten
**Target:** 11 Ziele (`G-BRAIN01`–`G-BRAIN11`) definiert und dokumentiert; die 6 Gate-Reparaturen im selben Change umgesetzt (alle Gates starten grün); 5 neue Wiki-Seiten + README + SCHEMA-Nachträge
**Parent-SSOT-Spec:** `openspec/specs/brain-foundation.md` (Delta nach T001304-Konvention)
**Präzedenz-Muster:** G-AGENTIC (T001398) — messbare Ziele mit Klasse Gate/Target, Baseline → Target, Verstöße im selben Change gefixt

## Intent (WARUM)

Das LLM-Wiki `Paddione/brain` (Karpathy-Pattern, Sprint 1 shipped) hat seit dem Seed zwar
Lint-Gates (Wikilink-, Frontmatter-Lint, gitleaks), aber (a) diese Gates haben **empirisch
verifizierte Löcher** — u. a. einen latenten CI-Breaker, der beim ersten echten Ingest
zuschlägt —, (b) es existiert **keinerlei Nutzungs-Doku** (kein How-to, kein Cheatsheet,
keine Troubleshooting-Hilfe, keine LLM-Workflow-Doku), und (c) es gibt **keine definierten
Qualitätsziele** für Struktur und Organisation des Wikis. Der Seed-Zustand (2 Seiten, leeres
raw/) ist der ideale Zeitpunkt: Ziele, die jetzt definiert werden, erzeugen nie einen
Altbestand an Verstößen.

**Brainstorming-Entscheidungen (Lavish-Board, 2026-07-03):**
1. **Enforcement-Scope B:** Nur Reparatur *bestehender* Gates (G-BRAIN01–04) + zwei
   Pipeline-Korrekturen (G-BRAIN05/06). **Keine neuen blockierenden Struktur-Checks** —
   Orphans, MOC-Hops, log-Disziplin, Backlog-Alter, SSOT-Abdeckung werden nur als messbare
   Targets dokumentiert („erstmal nur Quality steigern"). Jedes Target ist später per
   Mini-Change zum Gate beförderbar.
2. **Verankerung A — self-contained:** Ziele leben als Wiki-Seite `quality-goals` im
   brain-Repo, Checks als Lint-Skripte in dessen CI (Design-Entscheidung D5). Keine
   Anbindung an Hauptrepo-`goals.md`/`health-goals-check.sh`.
3. **Doku-Set komplett:** `quality-goals`, `usage`, `cheatsheet`, `first-aid`,
   `llm-workflows`, `README.md`, SCHEMA-Nachträge (Sprach- + Slug-Konvention).
4. **Dual-Target:** Seed-Template (`templates/brain/`, dieser PR) **und** live-Repo
   `Paddione/brain` (separater PR nach Merge) — T001578-Präzedenz gegen Template↔live-Drift.
5. **LLM-Enrichment ausführlich:** `llm-workflows`-Seite mit kopierbaren Prompt-Vorlagen
   (Seite anlegen, Seite verdichten, MOC pflegen, raw→wiki-Destillat, OpenSpec-SSOT-Sync)
   + Agent-Konventionen (brain-ingest-Skill, source::-Pflicht).
6. **User-Annotation:** OpenSpec-SSOT-Tracking als eigenes Target (G-BRAIN11) — jede
   Hauptrepo-Spec unter `openspec/specs/` soll perspektivisch eine kompilierte Brain-Seite
   mit `source::`-Rückverweis haben (Ingest-Worklist-Gruppe `ssot-specs` existiert bereits).

## Die 11 Ziele

| ID | Ziel | Klasse | Baseline (2026-07-03) → Target | Fix in diesem Change? |
|---|---|---|---|---|
| G-BRAIN01 | Wikilink-Lint versteht `[[slug]]`, `[[slug\|Alias]]`, `[[slug#anker]]`; 0 tote Links | Gate | Alias/Anker ungeprüft (verifiziert: toter Alias-Link → exit 0) → alle 3 Syntaxen geprüft | **Ja** — `lint-wikilinks.sh` erweitern |
| G-BRAIN02 | `tags` nicht-leer für jede Frontmatter-pflichtige Seite | Gate | `tags: []` passiert Lint → wird abgewiesen | **Ja** — `lint-frontmatter.sh` |
| G-BRAIN03 | Frontmatter-Lint scoped auf `wiki/` + Hub-Seiten (`index.md`, `log.md`, `SCHEMA.md`); `raw/` und `README.md` exempt | Gate | Lint läuft über ALLE `*.md` inkl. `raw/` (latenter CI-Breaker) → gescoped | **Ja** — `lint-frontmatter.sh` |
| G-BRAIN04 | Beide Linter melden ALLE Verstöße mit Datei+Feld/Link und brechen nie stumm ab | Gate | `type: Note` → set-e-Crash ohne Diagnose (verifiziert) → vollständige Fehlerliste, definierter Exit ≠ 0 | **Ja** — beide Linter |
| G-BRAIN05 | Site-Build/Publikation nur nach grünem Lint | Gate | `build-site.yml` entkoppelt von `ci.yml` → Lint-Job als `needs`-Voraussetzung im Build-Workflow | **Ja** — `build-site.yml` |
| G-BRAIN06 | `raw/` erscheint nicht im publizierten Site-Content | Gate | `raw/` wird nach `brain.mentolder.de` mitpubliziert → aus Content-Staging entfernt | **Ja** — `build-site.yml` |
| G-BRAIN07 | 0 Orphan-Seiten (jede `wiki/`-Seite von ≥1 anderer Seite verlinkt) | Target | 0 (unbewacht) → 0, dokumentiert gemessen | Nein — Mess-Kommando auf `quality-goals` |
| G-BRAIN08 | Jede `wiki/`-Seite über ≤2 MOC-Hops von `index.md` erreichbar | Target | erfüllt (trivial bei 2 Seiten) → gemessen | Nein — Mess-Kommando auf `quality-goals` |
| G-BRAIN09 | 1 `log.md`-Eintrag pro inhaltlichem Commit auf main | Target | 1/2 Commits (50 %) → 100 % | Nein — aber dieser Change lebt es vor (eigene log-Einträge) |
| G-BRAIN10 | Keine `raw/`-Datei älter als 14 Tage (Backlog-Frische) | Target | raw/ leer → gemessen ab Erst-Ingest | Nein |
| G-BRAIN11 | OpenSpec-SSOT-Abdeckung: jede Hauptrepo-Spec (`openspec/specs/*.md`) hat eine Brain-Seite mit `source::`-Rückverweis | Target | 0/24 → 24/24 (via künftigen Ingest, Worklist-Gruppe `ssot-specs`) | Nein — Ingest ist Folge-Arbeit (T001567-Nachfolge) |

**Bilanz:** 6 Gates (alle in diesem Change repariert → starten grün), 5 Targets (dokumentiert
mit kopierbarem, offline lauffähigem Mess-Kommando + Baseline-Datum auf der
`quality-goals`-Seite; bewusst kein Enforcement).

## Architektur & Komponenten

Seed-SSOT ist `templates/brain/` (Bootstrap kopiert 1:1, `chmod +x scripts/*.sh` — neue
Dateien werden ohne Bootstrap-Änderung mitgeseedet). Das live brain-Repo ist nach D4 SSOT
für seinen Inhalt und erhält dieselben Änderungen als separaten Folge-PR.

### 1 · Linter-Reparaturen (`templates/brain/scripts/`)

**`lint-wikilinks.sh`** (G-BRAIN01, G-BRAIN04):
- Erkennt zusätzlich `[[slug|Alias]]` und `[[slug#anker]]` (Slug-Extraktion vor `|` bzw. `#`).
- Sammelt ALLE toten Links über alle Dateien und listet sie einzeln (`dead wikilink: [[x]] in <datei>`), Exit 1 am Ende statt Abbruch beim ersten Fund.

**`lint-frontmatter.sh`** (G-BRAIN02, G-BRAIN03, G-BRAIN04):
- Scope: `wiki/**/*.md` + `index.md` + `log.md` + `SCHEMA.md`; `raw/` und `README.md` explizit exempt.
- Neu: `tags` muss nicht-leere Liste sein (`tags: []`, bare `tags:` → Verstoß).
- Ungültige Enum-Werte (inkl. Case-Mismatch wie `type: Note`) erzeugen eine FAIL-Zeile mit Datei + Feld + Ist-Wert; das Skript prüft alle Dateien zu Ende (kein set-e-Kurzschluss) und exitet dann ≠ 0.

Beide Linter bleiben offline, POSIX-bash, gegen beliebiges Verzeichnis lauffähig (BATS-testbar in `mktemp -d`).

### 2 · Pipeline-Härtung (`templates/brain/.github/workflows/build-site.yml`)

- Neuer erster Job `lint` (führt beide Linter aus); Build-Job erhält `needs: lint` (G-BRAIN05). `ci.yml` bleibt unverändert als PR-/Push-Gate.
- Content-Staging kopiert `raw/` nicht mehr (G-BRAIN06); Staging-Liste = `index.md log.md SCHEMA.md wiki`.

### 3 · Neue Wiki-Seiten (`templates/brain/wiki/`, alle SCHEMA-konform, von `index.md` und `index-moc.md` verlinkt)

| Seite | type | Inhalt |
|---|---|---|
| `quality-goals.md` | decision | Die 11 G-BRAIN-Ziele: Tabelle mit Klasse, Baseline (2026-07-03), Target, je Target ein kopierbares Mess-Kommando (grep/awk-Einzeiler, offline); Beförderungs-Regel Target→Gate |
| `usage.md` | runbook | How-to: Seite anlegen (Slug wählen, Frontmatter, verlinken), raw→wiki-Workflow, wann note/moc/entity/decision/runbook, log.md-Pflege |
| `cheatsheet.md` | runbook | Kopierbare Frontmatter-Templates pro type, Wikilink-Syntax (3 Formen), `source::`-Beispiele, Sprach-/Slug-Konvention, Lint-Kommandos |
| `first-aid.md` | runbook | CI rot → Entscheidungsbaum (welcher Linter, typische Meldungen, Fix); Linter lokal ausführen; Quartz-Build lokal testen (`docker build -f site.Dockerfile`) |
| `llm-workflows.md` | runbook | Wie LLMs den Brain anreichern: Ingest-Weg (brain-ingest-Skill, Worklist, `ssot-specs`-Gruppe), kopierbare Prompt-Vorlagen (Seite anlegen, Seite verdichten, MOC pflegen, raw→wiki-Destillat, OpenSpec-SSOT-Sync), Agent-Konventionen (`source::`-Pflicht, SSOT-Regel „kompilieren, nicht verschieben", log-Eintrag) |

### 4 · Bestandsseiten & Meta

- `SCHEMA.md`: Nachträge Sprachkonvention (DE-Prosa, EN-Fachbegriffe — bisher nur gelebt, nicht definiert) und Slug-Konvention (kebab-case); Verweis auf `quality-goals` als Qualitäts-SSOT.
- `index.md` + `wiki/index-moc.md`: neue Seiten verlinken (lebt G-BRAIN07/08 vor).
- `log.md`: Journal-Eintrag für diesen Change (lebt G-BRAIN09 vor).
- `README.md` (NEU, Top-Level, ohne Frontmatter-Pflicht): GitHub-Landing — was ist der Brain, Links auf SCHEMA/usage/cheatsheet/Site.

### 5 · Tests (`tests/spec/brain-quality-goals.bats`, NEUE Datei)

Neue Datei statt Anhängen an `brain-foundation.bats` (T001578 hat dort zuletzt appended;
eigene Datei = null Merge-Konflikt-Risiko; Glob `tests/spec/*.bats` wird automatisch von
`test:factory` erfasst — deckt zugleich die Trigger-Lücke ab, dass reine
`templates/brain/**`-Änderungen `test:factory` nicht auslösen). RED→GREEN-Fixtures:

1. Toter Alias-Link `[[ghost|Text]]` → Lint exit ≠ 0, Meldung nennt den Link (G-BRAIN01).
2. Toter Anker-Link `[[ghost#a]]` → dito (G-BRAIN01).
3. `tags: []` → Frontmatter-Lint rot (G-BRAIN02).
4. `raw/x.md` ohne Frontmatter → Frontmatter-Lint grün (G-BRAIN03).
5. `type: Note` → FAIL-Meldung mit Datei+Feld, kein stummer Abbruch; weitere Verstöße in anderer Datei werden ebenfalls gemeldet (G-BRAIN04).
6. `build-site.yml`: Lint-Job vorhanden + Build-Job `needs` ihn (G-BRAIN05); Staging enthält kein `raw` (G-BRAIN06).
7. Alle geseedeten Seiten (inkl. der 5 neuen) bestehen beide Linter (Selbst-Konformität).
8. Die 5 neuen Wiki-Seiten + README existieren im Seed und werden von `index.md`/`index-moc.md` verlinkt.

Danach `task test:inventory` (Inventar committen) und Verify-Block `task test:changed` +
`task freshness:regenerate` + `task freshness:check`.

## Rollout

1. Dieser PR (Hauptrepo): Template + Tests + OpenSpec-Delta. Kein Manifest-/Deploy-Delta.
2. Nach Merge: separater PR ins live `Paddione/brain` mit denselben Linter-/Workflow-/Seiten-Änderungen (Dual-Target-Entscheidung); dessen Merge triggert `build-site.yml` → neue Site inkl. Doku-Seiten auf `brain.mentolder.de`.

## Non-Goals

- Kein Enforcement der Targets G-BRAIN07–11 (bewusst: „erstmal nur Quality steigern").
- Kein Ingest-Runner / keine Ingest-Ausführung (G-BRAIN11-Erfüllung ist Folge-Arbeit).
- Keine Anbindung an Hauptrepo-`goals.md`/`health-goals-check.sh` (Entscheidung Verankerung A).
- Keine Änderung an `scripts/brain-bootstrap.sh` (kopiert rekursiv — neue Dateien laufen mit).
- Keine Änderung an `ci.yml` des brain-Repos (bestehende Steps reichen; Reparatur passiert in den Skripten, die es aufruft).

## Edge Cases / Risks

- **Spec-Delta-Kollision T001578:** Der Change `brain-site-dockerfile-template` ist gemerged, aber noch nicht archiviert; beide Deltas zielen auf `openspec/specs/brain-foundation.md`. Mitigation: T001578 vor diesem Change archivieren oder Archive-Reihenfolge beachten.
- **README ohne Frontmatter:** Muss im Frontmatter-Lint-Scope explizit exempt sein (sonst bricht Gate G-BRAIN03-Scope die eigene Seite).
- **Alias-Regex-Präzision:** `[[slug|Alias]]`-Parsing darf Code-Fences nicht mitmatchen — Cheatsheet zeigt die Syntax in Fences; Linter-Verhalten gegenüber Fenced-Code-Beispielen wird im BATS-Fixture abgedeckt (Konvention: Beispiele im Cheatsheet nutzen escaped/zerlegte Syntax oder werden als bekannte Slugs aufgelöst).
- **Live-Sync-Fenster:** Bis zum Folge-PR driften Template und live brain-Repo kurz (bewusst akzeptiert).

## Acceptance Criteria

1. `wiki/quality-goals.md` (Seed) listet alle 11 G-BRAIN-Ziele mit Klasse, Baseline (2026-07-03), Target; jedes Target mit kopierbarem, offline lauffähigem Mess-Kommando.
2. Die 6 Gates G-BRAIN01–06 sind umgesetzt; alle 8 BATS-Fixture-Gruppen aus §5 grün.
3. Alle geseedeten Seiten bestehen die (reparierten) Linter — Selbst-Konformität.
4. `usage`, `cheatsheet`, `first-aid`, `llm-workflows` existieren, sind verlinkt (kein Orphan) und `llm-workflows` enthält ≥5 kopierbare Prompt-Vorlagen inkl. OpenSpec-SSOT-Sync.
5. `SCHEMA.md` definiert Sprach- und Slug-Konvention; `README.md` existiert.
6. `task test:changed` + `task freshness:regenerate` + `task freshness:check` + `task test:inventory` grün; `bash scripts/openspec.sh validate` grün.
7. PR-Titel: `feat(brain): quality goals, gate repairs + usage docs (G-BRAIN01-11) [T001608]`

## Anhang — Explorations-Rohdaten

Zwei parallele Explorer (2026-07-03): (1) Clone-Analyse `Paddione/brain` (Struktur-Inventar,
Frontmatter-Compliance 5/5, Verlinkungs-Qualität, verifizierte Linter-Löcher, 10
Quality-Gap-Kandidaten mit Ist-Werten), (2) Hauptrepo-Karte (Seed-SSOT `templates/brain/`,
Ingest-Pipeline-Stand, Deploy-Kette, Test-Landschaft, S1-Baseline: keine brain-Einträge,
.md/.bats/.yml gate-frei, .sh-Limit 500 mit >480 Headroom). Kuratiert im Lavish-Board
`.lavish/brain-quality-goals-brainstorm.html` (gitignored) mit dem User abgestimmt.
