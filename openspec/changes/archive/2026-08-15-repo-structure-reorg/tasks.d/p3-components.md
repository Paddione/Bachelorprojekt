---
title: "repo-structure-reorg — Implementation Plan (Partial p3-components)"
ticket_id: T006999
domains: [repo-structure]
status: active
---

# repo-structure-reorg — Implementation Plan (Partial p3-components)

Fünf gleichförmige Komponenten-Moves: `brett`, `studio-server`, `mentolder-web`,
`mediaviewer-widget`, `VideoVault` wandern per `git mv` nach `components/`. Jeder Move
ist atomar (git mv + alle Referenz-Edits in einem Commit, Design-Entscheidung 2).
`apps/` bleibt als App-Registry unberührt; `k3d/docs-content-built/*.html` sind
generierte Doku und werden nicht angefasst; `packages/videovault-player/**` bleibt
ebenfalls unberührt (kein Move-Kandidat).

**Messungs-Stand (T002717):** Alle Referenzlisten in diesem Plan wurden am 2026-08-15
gegen Worktree-HEAD `7ae8d8279fd0f3286df257d9afe233d30edc5b94` (Branch
`chore/repo-structure-reorg-T006999`) gemessen, Fixed-String ohne
`node_modules/.git/tmp/k3d/docs-content-built/openspec`.

**D1-Abgrenzung gegen p4-website:** Querschnitts-Dateien, die zusätzlich `website/`
referenzieren, gehören geschlossen zu p4-website (Kollisionsvermeidung bei
Factory-Parallelität). p3 bearbeitet ausschließlich Dateien, deren Referenzen nur die
fünf Komponenten betreffen — mit zwei dokumentierten Ausnahmen:

1. `docs/code-quality/gates.yaml`: ist eine **p4-website-Datei** (12 website-Treffer) —
   p3 fasst sie NICHT an (D1). Die GLTFLoader-Ignore-Zeile
   (`- "brett/public/lib/GLTFLoader.js"` → `- "components/brett/public/lib/GLTFLoader.js"`)
   stellt p4 zusammen mit seinen website-Zeilen um. Ohne diese Umstellung failt
   `task freshness:check` nach dem brett-Move: GLTFLoader.js ist 3629 Zeilen lang,
   das `.js`-Limit liegt bei 800, die Datei ist nur über diese Ignore-Zeile
   ausgenommen (verifiziert: kein `S1:`-Key in `docs/code-quality/baseline.json`).
   Zwischenrisiko (dokumentiert): `freshness:check` ist zwischen p3 und p4 rot —
   Branch-Zwischenzustand, PR-Endzustand zählt.
   p4 unangetastet. Sequenzielle Partials erzeugen keinen Merge-Konflikt; bei
   parallelen Branches rebased p4 auf main.
2. `website/src/data/test-inventory.json`: Der neue Guard erzeugt zwangsläufig einen
   Inventory-Eintrag (siehe Task 1, Abschnitt „Inventory-Kopplung"). p3 regeneriert
   die Datei **lokal** für den eigenen Verify (der lokale CI-Inventory-Check ist
   fail-closed), **committet sie aber NICHT** — das finale Committen übernimmt
   p5-tests (D1-Ownership). Die Datei hat `merge=ours` (.gitattributes), Konflikte
   sind dadurch entschärft.
   sind damit ausgeschlossen; p4 regeneriert danach erneut (eigene Pflicht).

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `tests/spec/repo-structure/components-group.bats` | neu | — (kein S1-Limit-Key für .bats) |
| `.github/workflows/build-brett.yml` | 128 | — (kein S1-Limit-Key für .yml) |
| `.github/workflows/build-mentolder-web.yml` | 94 | — |
| `.github/workflows/build-mediaviewer-widget.yml` | 119 | — |
| `.github/workflows/build-videovault.yml` | 134 | — |
| `.claude/launch.json` | 16 | — (kein S1-Limit-Key für .json) |
| `docs/code-quality/gates.yaml` | 266 | — p4-Datei: p3 führt die GLTFLoader-Zeilen-Umstellung NICHT aus (D1, siehe Kopf) |
| `brett/dev-start.sh` | 104 | 696 (Limit .sh 800, nicht-baselined) |
| `brett/src/server/migrations/001_session_events.sql` | — | — |
| `brett/src/server/migrations/003_share_tokens.sql` | — | — |
| `mentolder-web/Dockerfile` | 30 | — (kein S1-Limit-Key für Dockerfile) |
| `mediaviewer-widget/Dockerfile` | 23 | — |
| `VideoVault/Dockerfile` | 66 | — |
| `VideoVault/Dockerfile.prod` | 60 | — |
| `VideoVault/docker-compose.yml` | 220 | — |
| `tests/e2e/brett-globals.d.ts` | 42 | 858 (Limit .ts 900, nicht-baselined) |
| `tests/e2e/specs/brett-hidden-figures.spec.ts` | 116 | 784 (Limit .ts 900, nicht-baselined) |
| `tests/factory-eval/fixtures/T001935/expected.json` | 17 | — |
| `tests/figure-pack-assets.test.sh` | 27 | 773 (Limit .sh 800, nicht-baselined) |
| `tests/integration/brett-templates.bats` | 26 | — |
| `tests/local/NFA-13.sh` | 37 | 763 (Limit .sh 800, nicht-baselined) |
| `tests/spec/react-homepage-blocks.bats` | 144 | — |
| `tests/spec/s1-violations.bats` | 19 | — |
| `website/src/data/test-inventory.json` | generiert | — (Regenerierung, D1-Ausnahme) |

Alle Budgets sind gegen die wirksame Schwelle gerechnet: keine der Dateien ist in
`docs/code-quality/baseline.json` baselined (`jq -r '."S1:<pfad>".metric'` liefert
„nicht-baselined"), die Edits sind reine In-Place-Pfad-Substitutionen ohne
Zeilen-Delta — kein Split/Shrink nötig.

<!-- vitest: kein neuer Test nötig, weil die einzige website/src-Berührung die
generierte website/src/data/test-inventory.json ist (kein Lib-/API-Code) -->

**Commit-Scopes:** Der Scopekatalog (`scripts/validate-commit-msg.sh scopes`) kennt
keinen repo-structure-Scope. Die Commit-Vorschläge unten verwenden `test(ci)` für den
Guard-Commit (BATS-Guard als CI-Schutz) und `chore(ci)` für die Move-Commits — der
kritische mechanische Teil jedes Moves sind die Build-Workflow-Pfade unter
`.github/workflows/`.

## Referenz-Kategorien (Messung 2026-08-15)

**A — p3-exklusiv (Referenzen betreffen nur die fünf Komponenten, werden in diesem
Partial editiert):**

| Komponente | Dateien |
|---|---|
| alle fünf | `tests/spec/repo-structure/components-group.bats` (neu, Guard) |
| brett | `.github/workflows/build-brett.yml`, `.claude/launch.json`, `brett/dev-start.sh`, `brett/src/server/migrations/001_session_events.sql`, `brett/src/server/migrations/003_share_tokens.sql`, `tests/e2e/brett-globals.d.ts`, `tests/e2e/specs/brett-hidden-figures.spec.ts`, `tests/factory-eval/fixtures/T001935/expected.json`, `tests/figure-pack-assets.test.sh`, `tests/integration/brett-templates.bats`, `tests/local/NFA-13.sh`, `tests/spec/s1-violations.bats` |
| studio-server | keine — einzige Referenzen sind `Taskfile.yml` (Z. 4527–4562, Docker-Build-Kontext `studio-server/`) und `scripts/health-goals-check.sh`, beide P4 (Kategorie B) |
| mentolder-web | `.github/workflows/build-mentolder-web.yml`, `mentolder-web/Dockerfile`, `tests/spec/react-homepage-blocks.bats` |
| mediaviewer-widget | `.github/workflows/build-mediaviewer-widget.yml`, `mediaviewer-widget/Dockerfile` |
| VideoVault | `.github/workflows/build-videovault.yml`, `VideoVault/Dockerfile`, `VideoVault/Dockerfile.prod`, `VideoVault/docker-compose.yml` |

**B — p4-website-Übergabe (referenzieren AUCH `website/`, werden von p4 geschlossen
übernommen — hier nicht anfassen):**

- `Taskfile.yml` (alle fünf + website), `taskfiles/Taskfile.dev-stack.yml`
- `.github/workflows/ci.yml`
- `.claude/lib/goals.md`, `.claude/skills/dev-flow-e2e/SKILL.md`,
  `.claude/skills/references/ci-fix-loop.md`,
  `.claude/skills/references/deploy-routing.md`,
  `.claude/skills/references/plan-quality-gates.md`,
  `.claude/skills/references/verification-block.md`
- `.dockerignore` (Z. 2–7 website, Z. 3 mentolder-web, Z. 20 brett),
  `.gitattributes` (Z. 2–9 brett, Z. 41–48 website-generierte Artefakte),
  `docs/code-quality/subsystems.yaml` (brett-Block Z. 45–49 + website-Globs)
- `scripts/add-whiteboard-library.py`, `scripts/assets-sync.sh`,
  `scripts/code-quality/group-violations.test.mjs`, `scripts/devflow-post-merge-deploy.sh`,
  `scripts/factory/auto-close-merged.sh`, `scripts/factory/review-pattern-enforcer.prompt.md`,
  `scripts/find-changed-e2e-tests.sh`, `scripts/health-goals-check.sh`,
  `scripts/lib/promote-phases.sh`, `scripts/lib/route-manifest.test.mjs`,
  `scripts/systembrett-generate.mjs`, `scripts/systembrett-setup.sh`,
  `scripts/tests/systembrett-template.test.sh`, `scripts/worktree-create.sh`
- `tests/spec/docker-build-speedup.bats`, `tests/spec/pocket-id-migration.bats`,
  `tests/spec/react-login-edit-homepage.bats`, `tests/spec/t002204-mishap-bundle.bats`
- `website/**` mit Komponenten-Referenzen (z. B. `website/src/lib/homepage-blocks-schema.ts`,
  `website/src/middleware/redirect-map.ts`, `website/src/pages/admin/brett/[...path].astro`,
  `website/src/data/route-manifest.json` — bewegt p4 mit dem website-Move)

**C — bewusst nicht angefasst (keine mechanische Repo-Pfad-Referenz; Doku, URLs,
Kommentare oder Selbst-Identifikations-Header):**

- `scripts/brett-bot-setup.sh` (Z. 20/22 `api/brett/bot` sind HTTP-Routen, keine Pfade),
  `scripts/feature-promote.sh` (Kommentar „brett/docs share one image"),
  `tests/e2e/lib/nav-graph.ts` (Kommentar „Systembrett/Brett")
- `k3d/mediaviewer-widget.yaml` (Kommentar „Built from mediaviewer-widget/Dockerfile"),
  `k3d/website.yaml` (Kommentar `/api/admin/brett/broadcast`), `prod/patch-brett.yaml`
  (Kommentar), `environments/dev.yaml`, `environments/schema.yaml` (Beschreibungen)
- `AGENTS.md`, `CLAUDE.md`, `QWEN.md`, `README.md`, `.design-sync/NOTES.md`,
  `.gitignore` (Kommentar Z. 176), `docs/**` (historische Specs/Pläne, generierte
  `repo-index.json`, `health-goals-history.md`, `legacy-html/*`)
- Selbst-Identifikations-Header in den Bäumen selbst (`// brett/test/…`, `// brett/src/…`,
  SQL-Header, `[brett/…]`-Log-Präfixe) — kennzeichnen die Datei selbst, kein externer
  Pfad; bleiben unverändert
- `.github/workflows/e2e.yml`, `.github/workflows/e2e-pr.yml`, `.opencode/**` —
  Negativ-Befund: keine Treffer auf die fünf Komponenten
- k8s-Deployment-Namen in Workflow-Deploy-Schritten (`deployment/brett`,
  `deployment/mentolder-web`, `deployment/mediaviewer-widget`, `deployment/videovault`)
  und Image-Namen (`ghcr.io/paddione/videovault`) sind keine Repo-Pfade — bleiben

## Tasks

### Task 1 — Guard anlegen (RED) + Inventory-Regenerierung

Neue Datei `tests/spec/repo-structure/components-group.bats` anlegen
(T002416-Verzeichniskonvention: ein Ordner pro Spec-Slug, eine Datei pro Vorgang).
Guard-Design: Positiv-Anker zuerst (T002356-M1), dann die Negativ-Aussage — beide
Aussagen im selben `@test`-Block, damit der Negativ-Test ohne Implementierung nicht
vakuos grün wird. Prüfmodus: Dateisystem-Output-Verifikation (`test -d` auf den
realen Arbeitsbaum), kein Source-Grep (T002448-M4); der Header-Kommentar dokumentiert
den Prüfmodus.

```bash
#!/usr/bin/env bats
# SSOT: openspec/changes/repo-structure-reorg (T006999, Partial p3-components)
# Prüfmodus: Dateisystem-Output-Verifikation über test -d auf den Arbeitsbaum
# (T002448-M4) — das Ergebnis des Moves ist das Dateisystem, kein Source-Grep.
# Positiv-Anker zuerst (T002356-M1): der gültige Fall (components/) muss durchlaufen,
# bevor die Negativ-Aussage (keine Top-Level-Ordner) zählt.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "repo-structure: fünf Komponenten unter components/, keine Top-Level-Ordner" {
  # Positiv-Anker: der gültige Fall
  [[ -d "$REPO_ROOT/components" ]]
  for c in brett studio-server mentolder-web mediaviewer-widget VideoVault; do
    [[ -d "$REPO_ROOT/components/$c" ]]
  done
  # Negativ-Aussage: kein Top-Level-Verzeichnis mehr
  for c in brett studio-server mentolder-web mediaviewer-widget VideoVault; do
    [[ ! -d "$REPO_ROOT/$c" ]]
  done
}
```

RED-Lauf — der Guard muss auf dem unveränderten Branch fehlschlagen (weder
`components/brett` existiert noch ist das Top-Level-Verzeichnis weg):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/components-group.bats
# expected: FAIL (rot — components/ existiert noch nicht, Top-Level-Ordner existieren noch)
```

**Inventory-Kopplung (siehe Kopf):** `scripts/build-test-inventory.sh`
erfasst jede `.bats`-Datei in `tests/spec/` über den Pfad-Fallback (T002445) — der
neue Guard erzeugt damit zwingend einen neuen Eintrag
(`{id: "repo-structure/components-group", …}`) in `website/src/data/test-inventory.json`.
Der CI-Inventory-Check ist fail-closed, deshalb regeneriert p3 die Datei **lokal**
für den Verify — committet wird sie erst von p5-tests (D1-Ownership):

```bash
task test:inventory   # lokal regenerieren — NICHT committen (p5-tests)
git add tests/spec/repo-structure/components-group.bats   # nur der Guard in diesen Commit
```

Commit-Nachricht: `test(ci): components/-Guard anlegen (RED) [T006999]`

### Task 2 — brett-Move

```bash
git mv brett components/brett
```

Referenz-Edits (nur mechanische Pfad-Referenzen; Log-Präfixe `[brett/…]` und
Selbst-Header bleiben, Kategorie C):

- `.github/workflows/build-brett.yml`: Z. 6 `paths: ['brett/**', …]` → `'components/brett/**'`;
  Z. 30 `cache-dependency-path: brett/package-lock.json` → `components/brett/…`;
  Z. 34–36 `npm --prefix brett …` → `npm --prefix components/brett …`; Z. 58–59
  `context: brett`, `file: brett/Dockerfile` → `context: components/brett`,
  `file: components/brett/Dockerfile`. Die Deploy-Schritte (Z. 100–101, 127–128,
  `deployment/brett`) sind k8s-Ressourcennamen — NICHT ändern.
- `.claude/launch.json`: Z. 7 `"runtimeArgs": ["brett/server.js"]` →
  `["components/brett/server.js"]`.
- `components/brett/dev-start.sh`: Z. 2, 5, 11 (Kommentare) und Z. 26–27 (Pfad-Checks)
  `brett/…` → `components/brett/…`.
- `components/brett/src/server/migrations/001_session_events.sql` und
  `003_share_tokens.sql`: Header-Kommentar `-- brett/src/server/migrations/…` →
  `-- components/brett/src/server/migrations/…` (Selbst-Identifikation der
  gewanderten Datei, genau diese zwei SQL-Header — die `brett/test/*.ts`-Header
  bleiben bewusst, Kategorie C).
- `tests/e2e/brett-globals.d.ts`: Z. 1 `brett/public/index.html` →
  `components/brett/public/index.html`.
- `tests/e2e/specs/brett-hidden-figures.spec.ts`: Z. 5 `brett/src/server/hidden-filter.ts`
  → `components/brett/…`.
- `tests/factory-eval/fixtures/T001935/expected.json`: Z. 3 und Z. 13
  `brett/src/client/ws-client.ts` → `components/brett/…` (Fixture wird von
  `scripts/factory/eval.mjs` geladen).
- `tests/figure-pack-assets.test.sh`: Z. 4–5 `SPEC`/`ROOT` → `components/brett/…`.
- `tests/integration/brett-templates.bats`: Z. 7, 12, 17 `brett/src/…` →
  `components/brett/src/…`.
- `tests/local/NFA-13.sh`: Z. 13 `BRETT_JS="${REPO_ROOT}/brett/public/assets"` →
  `components/brett/…`.
- `tests/spec/s1-violations.bats`: Z. 18 Key-String
  `S1:brett/public/lib/GLTFLoader.js` → `S1:components/brett/public/lib/GLTFLoader.js`
  (der Key matcht nie — baseline.json hat keine S1-Keys; die Umstellung hält die
  Semantik zum neuen Dateipfad konsistent).
- `docs/code-quality/gates.yaml`: Z. 96 `- "brett/public/lib/GLTFLoader.js"` →
  `- "components/brett/public/lib/GLTFLoader.js"` — **übernimmt p4-website** (gates.yaml
  ist eine p4-Datei, D1). p3 führt diese Umstellung NICHT aus; bis p4 ist
  `freshness:check` als Zwischenzustand rot (im Kopf dokumentiert).

Grep-Verifikation — in den p3-Dateien muss der alte Pfad leer sein:

```bash
git grep -n -F 'brett/' -- .github/workflows/build-brett.yml .claude/launch.json \
  tests/e2e/brett-globals.d.ts tests/e2e/specs/brett-hidden-figures.spec.ts \
  tests/factory-eval/fixtures/T001935/expected.json tests/figure-pack-assets.test.sh \
  tests/integration/brett-templates.bats tests/local/NFA-13.sh tests/spec/s1-violations.bats \
  docs/code-quality/gates.yaml components/brett/dev-start.sh
# expected: keine Treffer
```

Rest-Treffer repo-weit sind nur noch Kategorie B (P4-Übergabe) und Kategorie C
(URLs/Kommentare/Header) — Abgleich gegen die Listen im Kopf.

Commit-Nachricht: `chore(ci): brett → components/brett + Referenzen [T006999]`

### Task 3 — studio-server-Move

```bash
git mv studio-server components/studio-server
```

Keine Referenz-Edits in p3: Die einzigen mechanischen Referenzen liegen in
`Taskfile.yml` (Z. 4527–4562, Docker-Build-Kontext `studio-server/`) und
`scripts/health-goals-check.sh` — beide Kategorie B (p4-website). Es existiert kein
Build-Workflow und keine weiteren Skript-/Test-Referenzen (Messung 2026-08-15).

Grep-Verifikation:

```bash
git grep -n -F 'studio-server/' -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec' ':!docs/generated' ':!docs/diagrams'
# expected: nur noch Taskfile.yml und scripts/health-goals-check.sh (Kategorie B)
```

Commit-Nachricht: `chore(ci): studio-server → components/studio-server [T006999]`

### Task 4 — mentolder-web-Move

```bash
git mv mentolder-web components/mentolder-web
```

Referenz-Edits:

- `.github/workflows/build-mentolder-web.yml`: Z. 7–8 `paths: ['mentolder-web/**', …]`
  → `'components/mentolder-web/**'`; Z. 36
  `cache-dependency-path: mentolder-web/pnpm-lock.yaml` → `components/…`; Z. 40
  `cd mentolder-web` → `cd components/mentolder-web`; Z. 66
  `file: mentolder-web/Dockerfile` → `components/mentolder-web/Dockerfile`. Die
  Deploy-Schritte (Z. 91–94, `deployment/mentolder-web`) sind k8s-Namen — NICHT
  ändern.
- `components/mentolder-web/Dockerfile`: Z. 8 `COPY mentolder-web/ .` und Z. 27
  `COPY mentolder-web/nginx.conf …` → `components/mentolder-web/…` (Build-Kontext
  ist die Repo-Root, `context: .` im Workflow).
- `tests/spec/react-homepage-blocks.bats`: alle 26 Vorkommen von
  `"$REPO/mentolder-web/src/…"` → `"$REPO/components/mentolder-web/src/…"`.

Grep-Verifikation:

```bash
git grep -n -F 'mentolder-web/' -- .github/workflows/build-mentolder-web.yml \
  tests/spec/react-homepage-blocks.bats components/mentolder-web/Dockerfile
# expected: keine Treffer
```

Rest-Treffer: Kategorie B (`Taskfile.yml`, `scripts/health-goals-check.sh`,
`.dockerignore`, `.design-sync/NOTES.md`, `scripts/worktree-create.sh`,
`docs/superpowers/plans/*`, `website/**`) und C (Doku/Kommentare).

Commit-Nachricht: `chore(ci): mentolder-web → components/mentolder-web + Referenzen [T006999]`

### Task 5 — mediaviewer-widget-Move

```bash
git mv mediaviewer-widget components/mediaviewer-widget
```

Referenz-Edits:

- `.github/workflows/build-mediaviewer-widget.yml`: Z. 7 `paths: ['mediaviewer-widget/**', …]`
  → `'components/mediaviewer-widget/**'` (Z. 8 `packages/videovault-player/**`
  unverändert lassen — packages/ bleibt); Z. 34
  `cache-dependency-path: mediaviewer-widget/package-lock.json` →
  `components/…`; Z. 39 `cd ../../mediaviewer-widget` →
  `cd ../../components/mediaviewer-widget` (Navigationskontext ist
  `packages/videovault-player`); Z. 59 `file: mediaviewer-widget/Dockerfile` →
  `components/mediaviewer-widget/Dockerfile`. Deploy-Schritte (Z. 92–93, 118–119,
  `deployment/mediaviewer-widget`) — NICHT ändern.
- `components/mediaviewer-widget/Dockerfile`: Z. 7 und Z. 10 `COPY mediaviewer-widget/…`
  → `COPY components/mediaviewer-widget/…` (Build-Kontext ist die Repo-Root).

Grep-Verifikation:

```bash
git grep -n -F 'mediaviewer-widget/' -- .github/workflows/build-mediaviewer-widget.yml \
  components/mediaviewer-widget/Dockerfile
# expected: keine Treffer
```

Rest-Treffer: Kategorie B (`Taskfile.yml`, `scripts/health-goals-check.sh`,
`k3d/mediaviewer-widget.yaml`-Kommentar ist C) und C.

Commit-Nachricht: `chore(ci): mediaviewer-widget → components/mediaviewer-widget + Referenzen [T006999]`

### Task 6 — VideoVault-Move

```bash
git mv VideoVault components/VideoVault
```

Referenz-Edits (Build-Kontext ist jeweils die Repo-Root, `context: .`):

- `.github/workflows/build-videovault.yml`: Z. 7 `paths: ['VideoVault/**', …]` →
  `'components/VideoVault/**'` (Z. 8 `packages/videovault-player/**` unverändert);
  Z. 36 `VideoVault/package-lock.json` → `components/VideoVault/…`; Z. 44
  `working-directory: VideoVault` → `components/VideoVault`; Z. 72
  `file: VideoVault/Dockerfile` → `components/VideoVault/Dockerfile`. Deploy-Schritte
  (Z. 105–106, `deployment/videovault`) und `IMAGE="ghcr.io/paddione/videovault"`
  (Z. 63) — NICHT ändern.
- `components/VideoVault/Dockerfile`: alle 12 `COPY VideoVault/…`-Zeilen (Z. 20–24,
  29–33, 50, 54–56) → `COPY components/VideoVault/…`.
- `components/VideoVault/Dockerfile.prod`: alle 12 `COPY VideoVault/…`-Zeilen
  (Z. 16, 18–22, 26–29, 48, 52–53) → `COPY components/VideoVault/…`.
- `components/VideoVault/docker-compose.yml`: Z. 5 `dockerfile: VideoVault/Dockerfile.prod`
  → `components/VideoVault/Dockerfile.prod`.

Grep-Verifikation:

```bash
git grep -n -F 'VideoVault/' -- .github/workflows/build-videovault.yml \
  components/VideoVault/Dockerfile components/VideoVault/Dockerfile.prod \
  components/VideoVault/docker-compose.yml
# expected: keine Treffer
```

Rest-Treffer: Kategorie B (`Taskfile.yml`, `scripts/health-goals-check.sh`,
`scripts/find-changed-e2e-tests.sh`) und C (historische Design-Docs).

Commit-Nachricht: `chore(ci): VideoVault → components/VideoVault + Referenzen [T006999]`

### Task 7 — Guard grün + Gesamt-Verifikation

Guard-Lauf — muss jetzt grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/components-group.bats
# expected: 1 Test, 0 Fehler (components/* existiert, keine Top-Level-Ordner mehr)
```

Grep-Verifikation gesamt — die p3-Fläche muss frei von alten Pfaden sein; verbleibende
Treffer dürfen nur in Kategorie B oder C liegen (Listen im Kopf abgleichen):

```bash
git grep -l -F -e 'brett/' -e 'studio-server/' -e 'mentolder-web/' \
  -e 'mediaviewer-widget/' -e 'VideoVault/' -- . ':!node_modules' ':!tmp' \
  ':!k3d/docs-content-built' ':!openspec' ':!docs' ':!website' ':!components' \
  ':!.git' | sort > /tmp/reorg-rest.txt
# Abgleich: jede Zeile muss in Kategorie B oder C stehen (manuell gegen die Listen)
```

Zusätzlich prüfen, dass keine der p3-Dateien einen alten Pfad mehr enthält
(Kommandos aus den Move-Tasks 2–6).

Finale Verify-Commands (CI-Gates, STRUCT3):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Hinweise: `freshness:regenerate` aktualisiert die generierten Artefakte
(`repo-index.json`, `test-inventory.json` — die Regenerierung nach den Moves ist
Pflicht, weil der S1-Scanner `docs/code-quality/gates.yaml`-code_roots und
`repo-index.json` auf die neuen Pfade umstellt); `freshness:check` validiert die
S1-Ratchet inklusive der umgestellten GLTFLoader-Ignore-Zeile. `task test:changed`
deckt die geänderten BATS-Specs ab (`tests/spec/react-homepage-blocks.bats`,
`tests/spec/s1-violations.bats`, `tests/integration/brett-templates.bats`) und die
Playwright-Specs (`tests/e2e/specs/brett-hidden-figures.spec.ts`).
