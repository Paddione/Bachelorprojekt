---
ticket_id: T002158
plan_ref: openspec/changes/repohealth-goals-trigger/tasks.md
status: active
date: 2026-07-25
---

# Design: repohealth-goals-trigger

_Ticket: T002158 · Brainstorming-Ergebnis (Root-Cause, Fix-Ansatz, Subsysteme, Edge-Cases)_

## Root-Cause

`/admin/repohealth` rendert `GoalsDashboard.svelte`, das `ACTIVE_GOALS` aus
`website/src/lib/goals-data.ts` bezieht. Dessen erste Zeile ist ein **statischer** ESM-Import:

```ts
import rawGoals from './goals-data.generated.json';   // website/src/lib/goals-data.ts:1
```

Damit ist der Datenstand **Build-Zeit-gebunden**. `repohealth.astro` setzt `prerender = false`
(SSR pro Request), was aber nur das *Rendering* dynamisch macht, nicht die *Daten* — der JSON
liegt im Bundle. Neue Werte ⇒ neues Image ⇒ Rollout.

Die Kette ist vollständig automatisiert **außer an den Triggern**:

| Stufe | Mechanismus | Status |
|---|---|---|
| `goals.md` → `goals-data.generated.json` | `scripts/gen-goals-data.mjs`, `task health:goals:emit` | ✅ automatisch (in `freshness:regenerate`, `Taskfile.yml:981`) |
| JSON committet halten | CI-Freshness-Gate `ci.yml:101` (fail-closed) + `freshness-regen.yml` | ✅ automatisch |
| JSON → Website-Image | `build-website.yml` `paths` | ❌ **Bruch A** |
| Bot-Regen → Website-Image | `[skip ci]` in `freshness-regen.yml:64` | ❌ **Bruch B** |

### Bruch A
`build-website.yml` triggert auf `website/**` + sich selbst. `.claude/lib/goals.md` — die
Datenquelle — fehlt. Eine goals-only-Änderung baut kein Image.

### Bruch B
Der Bot-Commit ist der einzige Ort, an dem `website/src/lib/goals-data.generated.json`
*außerhalb* eines PRs fortgeschrieben wird — also der einzige `website/**`-Pfad, der
`build-website.yml` auslösen *würde*. `[skip ci]` unterdrückt ihn unterschiedslos.

Aktuell **latent**: das Freshness-Gate erzwingt den JSON schon im PR, deshalb enthalten die
Bot-Commits der letzten Tage nur `docs/code-quality/repo-index.json` (geprüft: `332737ec4`,
`f17f913de`, `8e8d49bfd`). Sobald der Bot den Website-JSON wirklich anfasst — z. B. weil eine
Messung nach dem Merge driftet — bleibt der ausgelieferte Stand permanent stale.

### Warum es trotzdem manchmal stimmt
`build-website.yml:38` hat einen `Regenerate freshness artifacts before build`-Step. **Jeder**
`website/**`-Push zieht damit den aktuellen `goals.md`-Stand mit. Der letzte Goals-Commit
`d1cd912ce` war nur deshalb live, weil er nebenbei `website/src/data/openspec-status.json`
enthielt. Das Dashboard hängt am Zufall fremder PRs.

### Strukturelle Einordnung
Identisches Muster zu **T002157** (`render-fleet-artifact` triggerte nicht auf den Renderer
selbst): eine Komponente, die den Inhalt eines Artefakts bestimmt, steht nicht in den
Trigger-Pfaden, die das Artefakt neu bauen. Das Artefakt bleibt stale, bis zufällig ein
anderer Pfad angefasst wird.

## Fix-Ansatz

### A — `paths` ergänzen
```yaml
# .github/workflows/build-website.yml
paths:
  - 'website/**'
  - '.claude/lib/goals.md'          # ← neu: SSOT des Repohealth-Dashboards
  - '.github/workflows/build-website.yml'
```
Keine weitere Änderung nötig — der bestehende `Regenerate freshness artifacts before
build`-Step erzeugt den JSON aus dem frischen `goals.md`.

### B — `[skip ci]` bedingt
```yaml
# .github/workflows/freshness-regen.yml, Step "Commit and push if changed"
git add -A
if git diff --cached --name-only | grep -q '^website/'; then
  SKIP=""            # Website-Artefakt betroffen → Build MUSS laufen
else
  SKIP=" [skip ci]"  # z. B. nur docs/code-quality/repo-index.json → CI sparen
fi
git commit -m "chore: auto-regenerate freshness artifacts${SKIP}"
```

**Warum diese Variante** (statt `[skip ci]` ganz entfernen oder `gh workflow run`):
Die Trigger-Wahrheit bleibt an **einem** Ort — den `paths` der Zielworkflows. Ein imperativer
`gh workflow run`-Aufruf würde die Trigger-Logik auf zwei Orte verteilen und müsste bei jedem
neuen build-*-Workflow nachgezogen werden. Die bedingte Variante skaliert automatisch mit:
fasst der Bot je `k3d/**` an, greift `render-fleet-artifact.yml` über seine eigenen `paths`
ohne weitere Änderung.

## Subsysteme

| Datei | Änderung | Risiko |
|---|---|---|
| `.github/workflows/build-website.yml` | +1 `paths`-Eintrag | keins — rein additiv |
| `.github/workflows/freshness-regen.yml` | Commit-Step: bedingtes Suffix | Blast-Radius s. u. |
| `tests/spec/ci-cd.bats` | +2 `@test` | keins |
| `.claude/lib/goals.md` | Root-Cause-Notiz G-E2E (Freitext, Prio-A-Sektion) | keins — kein Parser-relevantes Feld |
| `k3d/monitoring/health-goals-cronjob.yaml` | Image-Pin + Digest | keins — CronJob ist ein `echo`-Stub |

## Edge-Cases

### E1 — CI-Endlosschleife? Nein, selbstterminierend.
Der Bot pusht mit `GH_PAT`, PAT-Pushes triggern Workflows (anders als `GITHUB_TOKEN`). Ein
Commit ohne `[skip ci]` startet also `freshness-regen.yml` erneut. Lauf 2 ruft
`task freshness:regenerate` (idempotent) → `git diff --quiet` ist wahr → `changed=false` →
**kein** Commit → Kette endet. Maximal **ein** zusätzlicher Lauf. Zusätzlich dämpft
`concurrency: cancel-in-progress: true` (`freshness-regen.yml:7-9`).

### E2 — Blast-Radius auf `main` (geprüft, unkritisch)
Fünf Workflows triggern auf `push: branches: [main]`. Bei einem Bot-Commit **ohne**
`[skip ci]`:

| Workflow | Verhalten | Bewertung |
|---|---|---|
| `build-website.yml` | läuft (JSON ist `website/**`) | ✅ Ziel des Fixes |
| `ci.yml` | läuft (`paths-ignore` deckt nur `docs/**`, `*.md`, `**/CLAUDE.md`) | ✅ validiert das regenerierte Artefakt |
| `freshness-regen.yml` | läuft, regeneriert nichts, committet nicht | ✅ s. E1 |
| `post-merge.yml` | startet, aber `TICKET_ID="$(git log -1 … grep -oE 'T[0-9]{6}')"` ist leer → `exit 0`; scout-drift überspringt nicht-feature/fix-Titel | ✅ self-skip |
| `factory-post-merge-e2e.yml` | startet, `is_factory=false` weil kein `T######` im Titel → kein E2E-Dispatch | ✅ self-skip, **keine** Prod-E2E |

Ergebnis: `[skip ci]` war für `post-merge` und `factory-post-merge-e2e` **redundant** — beide
gaten intern auf `T######`, das der Bot-Commit-Titel `chore: auto-regenerate freshness
artifacts` nicht enthält. Es braucht also **keine** zusätzlichen `if:`-Guards.

### E3 — Bestehender Test `G-CI01-E` bleibt grün
`tests/spec/ci-cd.bats:183` prüft `grep -c "\[skip ci\]"` ≥ 1 in `freshness-regen.yml`. Die
bedingte Variante enthält das Literal weiterhin (im `else`-Zweig) → Test bleibt grün, keine
Spec-Regression. Das ist ein weiterer Grund gegen „`[skip ci]` ganz entfernen": das hätte
G-CI01-E gebrochen und einen Spec-Delta auf eine fremde Requirement erzwungen.

### E4 — `grep`-Anker
`grep -q '^website/'` ist am Zeilenanfang verankert. `git diff --cached --name-only` liefert
repo-relative Pfade, also matcht `docs/website-notes.md` **nicht**. Wichtig: der Check muss
**zwischen** `git add -A` und `git commit` stehen (`--cached` liest den Index).

### E5 — Warum nicht `paths-ignore` statt `paths` bei A?
`build-website.yml` nutzt eine Allowlist. Ein zweiter Mechanismus (Denylist) würde die
Semantik mischen; ein `paths`-Eintrag ist die minimale, konsistente Änderung.

## Verworfene Alternativen

| Alternative | Warum verworfen |
|---|---|
| `[skip ci]` komplett entfernen | Volle CI-Runde bei **jedem** Regen-Commit — `docs/code-quality/repo-index.json` ändert sich fast täglich. Bricht zusätzlich `G-CI01-E`. |
| `[skip ci]` behalten + `gh workflow run build-website.yml` | Trigger-Logik an zwei Orten; muss bei jedem neuen build-*-Workflow nachgezogen werden. |
| Dashboard-Daten zur Laufzeit lesen (`fs.readFile` im SSR) | Datei liegt im Image → löst nichts. Echte Lösung wäre Postgres als Quelle (Follow-up D). |
| `goals.md` nach `website/` verschieben | `goals.md` ist SSOT für Agenten (`.claude/lib/`), nicht Website-Content. Falsche Ebene. |

## Verifikation

```bash
bash tests/vendor/bats/bin/bats tests/spec/ci-cd.bats -f "T002158"   # RED → GREEN
task test:changed
task freshness:regenerate && task freshness:check
```

Nach dem Merge: `gh run list --workflow build-website.yml --limit 3` muss einen Run auf dem
Merge-Commit zeigen (der PR fasst `.claude/lib/goals.md` an ⇒ Bruch A ist damit live belegt).
