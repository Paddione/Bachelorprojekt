---
title: "repo-structure-reorg — Implementation Plan (Partial p4-website)"
ticket_id: T006999
domains: [repo-structure, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# repo-structure-reorg — Implementation Plan (Partial p4-website)

_Ticket: T006999_

Partial-Plan für den Move `website/` → `components/website/` (Delta-Spec
`openspec/changes/repo-structure-reorg/specs/repo-structure.md`, Requirement
„Build components live under components/", „Moves are atomic with reference
updates", „No stale references to the old component paths").

**D1-Regel (Partial-Disjunktion):** Dieses Partial übernimmt ALLE
Querschnitts-Dateien geschlossen und bringt sie in einem Zug auf den
Endzustand aller acht Komponenten-Pfade des Changes:

| Alter Pfad | Endzustand |
|---|---|
| `website/` | `components/website/` |
| `brett/`, `studio-server/`, `mentolder-web/`, `mediaviewer-widget/`, `VideoVault/` | `components/<name>/` |
| `design-system/` | `packages/design-system/` |
| `art-library/` | `assets/art-library/` |

Komponenten-eigene Dateien der anderen sieben Komponenten (z. B.
`design-system/build.mjs`, `brett/**` intern) liegen in p2 (Mini-Moves) bzw.
p3 (Komponenten-Moves) und werden hier NICHT angefasst. Wenn p2/p3 vor der
Ausführung gemergt haben, vor Beginn `git fetch origin && git merge origin/main`
ausführen und die Trefferzahlen gegen den frischen Stand prüfen —
Querschnitts-Dateien gehören per D1 diesem Partial, abweichende Fremd-Commits
werden beim Rebase übernommen.

**Verboten:** `k3d/docs-content-built/*.html` (generiert, wird von
`docs:deploy` neu gerendert), `website/CHANGELOG.md` (historisch, von
`worktree-clean-check.sh` ausgeschlossen), `pnpm install` (T002239-M3 — der
node_modules-Symlink bleibt funktional, siehe T2).

## File Structure

```
NEU  tests/spec/repo-structure/website-moved.bats          ← Drift-Guard (T1, RED→GREEN)
MV   website/ → components/website/                        ← git mv (T2) inkl. 14 Symlink-Tiefenfix + node_modules-Handling
ED   .github/workflows/build-website.yml                   ← T3, 8 Treffer (paths-Filter, file:, Kommentare)
ED   .github/workflows/ci.yml                              ← T3, 7 Treffer (pnpm cache/install, inventory-grep, junit.xml, dist) + D1: brett (2)
ED   .github/workflows/build-sdlc-console.yml              ← T3, 9 Treffer (paths-Filter website/src/**/sdlc/**)
ED   .github/workflows/e2e-pr.yml                          ← T3, 2 Treffer (Kommentar, grep -qE-Filter)
ED   .github/workflows/health-goals.yml                    ← T3, 3 Treffer (goals-data.generated.json, Kommentar)
ED   .github/workflows/post-merge.yml                      ← T3, 2 Treffer (cache-dependency-path)
ED   Taskfile.yml                                          ← T4, 40 Treffer + D1 (brett 6, studio-server 1, mentolder-web 1, VideoVault 1, art-library 2)
ED   taskfiles/Taskfile.dev-stack.yml                      ← T4, 2 Treffer + D1 (brett 1)
ED   taskfiles/Taskfile.staging.yml                        ← T4, 2 Treffer
ED   .gitattributes  .gitignore  .dockerignore  compose.dev.yaml  ← T4, 26 Treffer
ED   docs/code-quality/gates.yaml                          ← T4, 12 Treffer (S1-ignore/S2/S3 auf components/website umstellen)
ED   CLAUDE.md  AGENTS.md  CONTRIBUTING.md  README.md      ← T4, 11 Treffer (GEMINI.md: 0 — kein Edit)
ED   scripts/ (101 Dateien)                                ← T5, 246 Treffer — Querschnitts-Skripte auf D1-Endzustand
ED   tests/ (133 Dateien)                                  ← T6, 624 Treffer — Querschnitts-/Website-Tests (Ausnahme: factory-eval-fixtures)
ED   .claude/ (20 Dateien)  .opencode/skills/opencode-flow-execute/SKILL.md  ← T7, 89 + 2 Treffer
ED   components/website/ (195 Dateien)                     ← T8, 315 Treffer ohne CHANGELOG (Dockerfile, CLAUDE.md, docs, scripts)
ED   components/website/src/data/test-inventory.json       ← T9, lokal regeneriert — Commit in p5-tests (D1)
```

## Budget (B1a)

Stand 2026-08-15 (MESSUNG: Fixed-String `website/`, ohne
node_modules/.git/tmp/k3d/docs-content-built/openspec). Alle Edits sind reine
Pfad-Ersetzungen → **zeilenneutral** (keine Zeile wird hinzugefügt oder
entfernt, Ausnahme: neuer Guard). S1-Ratchet läuft gegen
`docs/code-quality/baseline.json` (enthält 0 `website/`-Keys → kein Update
nötig); `docs/code-quality/gates.yaml` hat Limits nur für .astro/.ts/.svelte/.sh.

| Pfad | Ist (Zeilen) | S1-Schwelle | Budget | Anmerkung |
|---|---|---|---|---|
| `scripts/health-goals-check.sh` | 772 | .sh-Limit 800 | 28 | zeilenneutral geplant (D1: 6 package.json-Pfade) |
| `scripts/worktree-create.sh` | 593 | .sh-Limit 800 | 207 | nur Kommentare (490–495) |
| `scripts/plan-lint.sh` | 661 | .sh-Limit 800 | 139 | W1-Regex (Zeile 526) + Kommentare (535, 572) |
| `scripts/admin-menu-gate.sh` | 229 | .sh-Limit 800 | 571 | zeilenneutral |
| `scripts/factory/auto-close-merged.sh` | 221 | .sh-Limit 800 | 579 | zeilenneutral (85–90) |
| `Taskfile.yml` | 5346 | keine (kein .yml-Limit, nicht baselined) | — | 40 Treffer + D1 |
| `tests/spec/repo-structure/website-moved.bats` | neu (~45) | keine (kein .bats-Limit, nicht baselined) | — | neuer Guard |
| übrige Edits (workflows, taskfiles, Configs, MDs, .claude, tests, website-intern) | — | keine wirksame Schwelle | — | zeilenneutral |

## Ausnahmen (bewusst NICHT angefasst)

| Datei(en) | Treffer | Begründung |
|---|---|---|
| `k3d/` (website.yaml:434, website-schema.yaml:703+1535, website-content-token-secret.yaml:3, pocket-id-client-seed.yaml:358) | 5 | reine Kommentarzeilen; design.md-Negativbefund: „k3d enthält keine echten Repo-Pfad-Referenzen". Infra bleibt unberührt (Entscheidung 4). |
| `k3d/docs-content-built/*.html` | generiert | Doku-Build-Artefakt; `docs:deploy` rendert nach Abschluss neu (design.md-Risiko-Tabelle) |
| `website/CHANGELOG.md` | historisch | Verlauf bleibt unangetastet; worktree-clean-check.sh schließt die Datei explizit aus — die Exclusion wandert in T5 mit (`website/CHANGELOG.md` → `components/website/CHANGELOG.md`) |
| `scripts/vda/frontmatter.sh` (55, 80) | 2 | Substring-Match `website/` bzw. Alternations-Match `(^|/)website/src/` matcht auch `components/website/…` → bleibt funktional, Regex-Änderung unnötig |
| `scripts/code-quality/fixtures/**` + `*.test.mjs` | n/a | synthetische Testdaten (Fixture-Semantik belegt: scripts/factory/eval.mjs:58, scripts/factory/README.md:141–182) |
| `tests/factory-eval/fixtures/*/expected.json` | n/a | historische PR-Diff-Snapshots; eval.mjs führt die test-Kommandos NICHT aus → keine Pfad-Semantik |
| `.claude/workflows/agentic-trends-radar.js:23` | 1 | Domänen-Enumeration `website/ops/infra/test/db/security` — Rollenname, kein Pfad |
| `environments/mentolder/README.md` (24–29, 70), `environments/schema.yaml` (975–984) | 10 | außerhalb der Auftrags-Konsumentenliste; dokumentarische Referenzen (Pfadliste, Kommentare). schema.yaml:360 referenziert den K8s-Namespace `website` (k3d bleibt unberührt), kein Repo-Pfad. Bewusste Resttreffer, kein Guard. |
| `assets/Mentolder/INVENTORY.md:43`, `environments/korczewski/uploads/Kore Design System (4)/**` (18, 27) | 3 | `ui_kits/website/` ist Benennungs-Schema der design-system-UI-Kits (Produktname „website"), keine Repo-Pfad-Referenz → gehört zu p2 |
| `art-library/` (5), `design-system/` (17) | 22 | komponenten-eigene Dateien → p2 (siehe Koordination) |
| `brett/`, `studio-server/`, `mentolder-web/`, `mediaviewer-widget/`, `VideoVault/` | je wenige | komponenten-eigene Dateien → p3; nur die Querschnitts-Vorkommen in Taskfile.yml/ci.yml werden hier (T3/T4) auf Endzustand gebracht |
| `website/node_modules`, `website/.env` (falls vorhanden) | untracked | git mv bewegt nur getrackte Dateien → Handling in T2 |

## Koordination mit p2/p3

- `design-system/build.mjs:8` liest funktional `BRAND = join(HERE, '..', 'website', 'public', 'brand', …)` (Ausgabeziel). Der Endzustand nach beiden Moves ist `join(HERE, '..', '..', 'components', 'website', 'public', 'brand', …)`. **Hinweis an den Orchestrator:** build.mjs ist p2-Zuständigkeit; p2 muss die Zeile direkt auf den p4-Endzustand setzen (nicht auf `../website/…`), sonst zeigt das Ziel nach dem website-Move ins Leere.
- `environments/korczewski/uploads/Kore Design System (4)/**` und `assets/Mentolder/INVENTORY.md` referenzieren `ui_kits/website/` — Benennung innerhalb des design-system-Moves (p2), hier nicht anfassen.

## Tasks

### T1: Drift-Guard `tests/spec/repo-structure/website-moved.bats` schreiben + RED-Lauf

Neue Datei unter `tests/spec/repo-structure/` (T002416: eigener Ordner pro
SSOT-Spec `repo-structure`, eigene Datei pro Vorgang; Ordner existiert noch
nicht). Prüfmodus-Kommentar im Header dokumentiert die T002448-M4-Ausnahme:
Querschnitts-Struktur-Guard — das Ergebnis manifestiert sich ausschließlich im
Quelltext (Taskfiles/Workflows), es gibt kein Laufzeit-Verhalten, das gemessen
werden könnte; deshalb git-grep. Reihenfolge T002356-M1: erst Positiv-Anker,
dann Negativ-Aussagen.

```bash
#!/usr/bin/env bats
# tests/spec/repo-structure/website-moved.bats
# SSOT: openspec/specs/repo-structure.md
#
# Drift-Guard fuer den Move website/ -> components/website/ (T006999, Partial p4).
# Pruefmodus (T002448-M4-Ausnahme, dokumentiert): Querschnitts-Struktur-Guard —
# das Ergebnis manifestiert sich ausschliesslich im Quelltext (Taskfiles,
# Workflows), es gibt kein Laufzeit-Verhalten. Deshalb git-grep.
#
# Reihenfolge T002356-M1: erst der Positiv-Anker (components/website/package.json
# muss existieren — ohne den Move schlaegt er fehl), dann die Negativ-Aussagen.
# Ohne den Anker bestuenden die Negativ-Pruefungen ueber leere Listen vakuos.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "T006999: components/website existiert (Positiv-Anker)" {
  [ -f "$REPO_ROOT/components/website/package.json" ] \
    || { echo "FEHLT: components/website/package.json — Move nicht ausgefuehrt"; return 1; }
}

@test "T006999: kein Top-Level-Verzeichnis website/ mehr" {
  [ ! -d "$REPO_ROOT/website" ] \
    || { echo "FEHLT: Top-Level-Ordner website/ existiert noch"; return 1; }
}

@test "T006999: keine stale website/-Referenzen in Querschnitts-Dateien" {
  # 'website/' ist Substring von 'components/website/' — Zeilen mit dem neuen
  # Praefix sind erlaubt und werden gefiltert.
  local stale=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      *components/website/*) continue ;;
    esac
    echo "STALE: $line" >&2
    stale=1
  done < <(git -C "$REPO_ROOT" grep -F -n 'website/' -- \
    Taskfile.yml taskfiles .github/workflows || true)

  [ "$stale" -eq 0 ] || return 1
}
```

Danach den RED-Lauf dokumentieren und committen (nur die Guard-Datei):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/website-moved.bats
# expected: FAIL (rot — components/website/package.json existiert noch nicht,
# Positiv-Anker schlaegt fehl; die beiden Negativ-Bloecke sind durch den Anker
# abgesichert und fallen erst nach dem Move in ihre Pruef-Rolle)
```

### T2: `git mv website components/website` + Symlink-/Untracked-Handling

```bash
git mv website components/website
```

Danach drei Nacharbeiten (Befund 2026-08-15):

1. **Untracked-Symlink `website/node_modules`** (gitignored, `git ls-files: 0`,
   im Worktree ein absoluter Symlink auf den Hauptcheckout) bleibt nach dem Move
   unter `website/` zurück — `git mv` bewegt nur getrackte Dateien. Neu
   verlinken (T002239-M3: kein pnpm install nötig — der Hauptcheckout behält
   sein `website/` bis zum Merge, sein node_modules bleibt die Quelle):

   ```bash
   if [ -L website/node_modules ]; then
     ln -s "$(dirname "$(git rev-parse --git-common-dir)")/website/node_modules" components/website/node_modules
     rm website/node_modules
   elif [ -d website/node_modules ]; then
     mv website/node_modules components/website/node_modules
   fi
   ```

2. **Untracked `website/.env`** (falls vorhanden): `mv website/.env components/website/.env`
   — compose.dev.yaml mountet den Pfad, T4 passt den Mount an.

3. **14 getrackte relative Symlinks unter `website/public/cockpit/`** → Ziel
   `.lavish/…` im Repo-Root. `git mv` verschiebt Symlinks unverändert; durch die
   zusätzliche `components/`-Ebene zeigt jedes Ziel eine Ebene zu flach.
   Korrektur: jedem Ziel genau ein `../`-Segment voranstellen:

   ```bash
   find components/website/public/cockpit -type l | while read -r l; do
     t="$(readlink "$l")"
     case "$t" in
       ../*) ln -sfn "../$t" "$l" ;;
     esac
   done
   git add -A components/website/public/cockpit
   ```

   Kontrolle: `git ls-files -s components/website/ | awk '$1=="120000"'` muss
   genau 14 Einträge liefern, deren Zielblobs um ein `../` länger sind. Es gibt
   keine getrackten Symlinks außerhalb von website/, die nach website/ zeigen
   (verifiziert) — nur die 14 internen.

4. Abschließend `rmdir website 2>/dev/null || true` — danach darf `website/`
   nicht mehr existieren (Negativ-Block 2 des Guards prüft genau das).

### T3: GitHub Workflows (6 Dateien, 31 Treffer)

Pro Datei alle `website/`-Vorkommen auf `components/website/` setzen; danach
`git grep -F -n 'website/' -- .github/workflows | grep -v 'components/website/'`
muss leer sein.

| Datei | Funktional relevante Stellen |
|---|---|
| `.github/workflows/build-website.yml` (8) | `paths: 'website/**'` + 3 Negationen, `file: website/Dockerfile` (Build-Kontext bleibt `.`) |
| `.github/workflows/ci.yml` (7) | `cache-dependency-path: website/pnpm-lock.yaml`, `cd website && pnpm install --frozen-lockfile`, `grep -q "^website/src/lib/"` (freshness-Kontrolle), `path: website/test-results/junit.xml`, `path: website/dist`; **D1:** Zeilen 553/554 `cache-dependency-path: brett/package-lock.json` + `npm ci --prefix brett` → `components/brett/…` |
| `.github/workflows/build-sdlc-console.yml` (9) | paths-Filter `website/src/**/sdlc/**` u. a. |
| `.github/workflows/e2e-pr.yml` (2) | Kommentar (Zeile 4), `grep -qE '^(website/|tests/e2e/|…)'` (Zeile 71) — Pfad-Präfix im Changed-Files-Filter |
| `.github/workflows/health-goals.yml` (3) | `website/src/lib/sdlc/goals-data.generated.json` (2×), Kommentar `website/**` |
| `.github/workflows/post-merge.yml` (2) | `cache-dependency-path: website/pnpm-lock.yaml` (2×) |

### T4: Taskfiles + Root-Configs + Root-MDs (D1-Endzustand aller 8 Pfade)

- **`Taskfile.yml` (40):** generierte JSON-Ziele (Zeilen 724–1415),
  `website/node_modules/.bin/tsx` (2759), `-f website/Dockerfile` (3946),
  `kubectl cp`-Pfade (3990–3993), `include`-Import (5193). **D1:** die
  verbliebenen brett/ (6), studio-server/ (1), mentolder-web/ (1),
  VideoVault/ (1), art-library/ (2) Vorkommen in derselben Datei mit auf den
  Endzustand bringen (`components/<name>/`, `assets/art-library/`).
- **`taskfiles/Taskfile.dev-stack.yml` (2 + D1 brett 1):** `-f website/Dockerfile`,
  `pkill -f "docker.*website/Dockerfile"`, brett-Stelle.
- **`taskfiles/Taskfile.staging.yml` (2):** `${WORKTREE_PATH}/website/…`.
- **`.gitattributes` (8):** merge=ours-Einträge für generierte JSONs
  (Zeilen 41–48) → `components/website/src/…`.
- **`.gitignore` (5):** `website/dist/`, `website/.astro/`,
  `website/.superpowers/`, `!website/src/data/`, Kommentar Zeile 147
  („node_modules is symlinked to website/node_modules"). **`website-dist/`
  (Zeile 10) NICHT anfassen** — andere Artefakt-Konvention.
- **`.dockerignore` (5):** `website/node_modules`, `dist`, `.env`,
  `!website/.env.example` u. a. → `components/website/…`.
- **`compose.dev.yaml` (8):** `dockerfile: website/Dockerfile.dev` (Zeile 20),
  `- website/.env` (Zeile 27), Kommentare.
- **`docs/code-quality/gates.yaml` (12):** S1-ignore-Pfade (u. a.
  system-test-seed-data.ts, helpContent.ts, billing-db.ts, tickets-schema.ts),
  S2 `tsconfig: website/tsconfig.json`, S3-Präfix `- website/src/` samt
  allowlist-Einträgen (sitemap.xml.ts, agent-guide.generated.json,
  platform-descriptions.generated.json, goals-data.generated.json) →
  `components/website/…`. Zeilenneutral.
- **Root-MDs (11):** CLAUDE.md (5: Zeilen 13, 75, 161, 177, 196 — u. a.
  Projektübersicht „**`website/`** — Astro + Svelte", Agent-Routing-Tabelle),
  AGENTS.md (4: Zeilen 71, 114, 172, 180), CONTRIBUTING.md (1: 82),
  README.md (1: 92). `GEMINI.md`: 0 Treffer (verifiziert) — kein Edit nötig.

### T5: scripts/ (246 Treffer, 101 Dateien) — D1-Endzustand für Querschnitts-Skripte

Vorgehen: `git grep -F -l 'website/' -- scripts ':!scripts/code-quality/fixtures'`
liefert die Dateiliste; jede Datei öffnen und Repo-Pfad-Referenzen
`website/…` → `components/website/…` ersetzen. Querschnitts-Skripte
(referenzieren mehrere Komponenten) zusätzlich auf den D1-Endzustand der
übrigen Pfade bringen. Funktional-kritische Stellen:

| Datei | Stelle(n) | Bedeutung |
|---|---|---|
| `scripts/build-test-inventory.sh` | 6 | `OUT="${TEST_INVENTORY_OUT:-${REPO_ROOT}/website/src/data/test-inventory.json}"` — T9 hängt daran |
| `scripts/find-changed-e2e-tests.sh` | 14, 43 | INVENTORY-Pfad + Domän-Mapping |
| `scripts/find-changed-tests.sh` | 179–182 | Kommentare |
| `scripts/factory/auto-close-merged.sh` | 85–90 | 6 generated-file-Exclusionen → D1-Endzustand aller 6 Komponenten |
| `scripts/health-goals-check.sh` | G-DEP04 | alle 6 `package.json`-Pfade (inkl. brett/studio-server/mentolder-web/mediaviewer-widget/VideoVault) → D1; Budget 28 |
| `scripts/plan-lint.sh` | 526 (W1) | Backtick-anchored Regex `` `website/src/(lib|pages/api)/… `` matcht `components/website/…` NICHT → auf beide Formen erweitern, z. B. `` `(website|components/website)/src/(lib|pages/api)/ ``; 535/572 Kommentare |
| `scripts/worktree-create.sh` | 490–495 | Kommentare (Symlink-Logik generisch) |
| `scripts/worktree-clean-check.sh` | 45 | Exclusion-Liste `website/CHANGELOG.md|website/package.json` → `components/website/…` |
| `scripts/guard-pnpm-install.sh` | 37 | Kommentar |
| `scripts/admin-menu-gate.sh` | 14–15, 105–112 | Pfad-Prüfung + Meldungstexte |
| `scripts/assets-sync.sh`, `scripts/build-portrait-derivatives.sh`, `scripts/branch-reaper.sh` | 15–17, 17–18, 56–59 | Zielpfade |
| `scripts/build-route-manifest.mjs`, `scripts/build-api-map.mjs` | OUT_PATHS | generierte JSON-Ziele → `components/website/src/lib/…` |
| `scripts/agent-guide/emit-webapp.mjs` | 184 | `OUT_FILE = resolve(REPO_ROOT, 'website/src/lib/agent-guide.generated.json')` |
| `scripts/gen-goals-data.mjs`, `scripts/openspec-status-map.sh` | Ausgabeziele | goals-data.generated.json, openspec-status.json |
| `scripts/bge-mcp/server.mjs`, `scripts/check-commit-vs-diff.sh`, `scripts/factory/scout.sh` u. v. m. | div. | Rest per Dateiliste |

Ausnahmen in diesem Ordner: `scripts/vda/frontmatter.sh` (bleibt funktional,
siehe Ausnahmen-Tabelle), `scripts/code-quality/fixtures/**`.

### T6: tests/ (624 Treffer, 133 Dateien)

Vorgehen wie T5, Dateiliste via `git grep -F -l 'website/' -- tests
':!tests/factory-eval/fixtures'`. Relative Repo-Root-Auflösungen
(`$BATS_TEST_DIRNAME/../../website/src/…`) bleiben in der Tiefe unverändert —
nur das Literal wechselt zu `../../components/website/src/…` (tests/ bleibt
Top-Level). Funktional-kritische Stellen:

| Datei | Besonderheit |
|---|---|
| `tests/unit/website-dev-container.bats` (13) | Dockerfile.dev, docker-entrypoint, compose.dev.yaml `website/.env` — funktional |
| `tests/local/FA-30.bats`, `tests/local/FA-20.sh:32` | base64-Kodierung bzw. `grep -r …/website/src` |
| `tests/scripts/admin-menu-gate.bats` | legt website/src-Baum in Fixture an → Fixture-Pfade mitziehen |
| `tests/spec/admin-cockpit.bats` (3), `tests/spec/website-core.bats` (29), `tests/spec/website-interfaces.bats` (6) | Sammeldateien → alle Vorkommen ersetzen |
| Querschnitts-Tests (mehrere Komponenten referenzierend) | D1-Endzustand aller 8 Pfade |

Ausnahme: `tests/factory-eval/fixtures/*/expected.json` (historische
PR-Diff-Snapshots, eval.mjs:58 führt die test-Kommandos nicht aus).

### T7: Agent-Konfigurationen (.claude/ 89 Treffer in 20 Dateien, .opencode/ 2)

- **`.claude/lib/goals.md` (16):** hand-editieren auf `components/website/…`,
  danach `task health:goals:emit` ausführen — regeneriert
  `goals-data.generated.json` über das in T5 angepasste
  `scripts/gen-goals-data.mjs` (offline-sicher, reines Parsing). Das
  regenerierte Artefakt mit committen.
- **`.claude/agents/bachelorprojekt-website.md` (4), `.claude/skills/**`
  (dev-flow-chore, dev-flow-e2e, dev-flow-plan, website-specialist,
  references/ci-fix-loop, deploy-routing, dev-flow-gotchas,
  dev-flow-plan-phases, grilling-to-ticket, mcp-tool-guide, plan-archive-steps,
  plan-intel-bundle, plan-quality-gates, repo-hygiene-ops, ticket-ops-procedures,
  verification-block, ticket-ops):** Vorkommen ersetzen (dokumentarisch,
  plan-quality-gates.md mit 10 Treffern ist der größte).
- **`.opencode/skills/opencode-flow-execute/SKILL.md` (2):**
  `website/src/data/openspec-status.json` → `components/website/…` (die Datei
  selbst wird in T12 via freshness:regenerate neu erzeugt).
- Ausnahme: `.claude/workflows/agentic-trends-radar.js:23` (Domänen-Enumeration).

### T8: website-intern (315 Treffer in 195 Dateien, ohne CHANGELOG)

Jede Datei unter `components/website/`, die das Literal `website/` enthält,
prüfen: Vorkommen, die den Repo-Root-Pfad referenzieren, auf
`components/website/` setzen; rein interne relative Importe bleiben unverändert.
Wichtige Stellen:

- **`components/website/Dockerfile` (19/22 COPY-Kommandos + Kommentare) und
  `Dockerfile.dev` (49/62):** Build-Kontext ist der Repo-Root (workflows/
  compose.dev.yaml setzen `context: .` bzw. `dockerfile:`) — COPY-Ziele werden
  zu `components/website/…`.
- **`components/website/CLAUDE.md` (9), `WEBSITE-STANDARDS.md` (~20),
  `README.md`, `docs/**`:** dokumentarische Pfadverweise.
- **`api-public-allowlist.json`, `scripts/**`:** funktionale/konfigurative
  Pfade.
- **Generierte Artefakte** (`src/lib/*.generated.json`,
  `src/data/test-inventory.json`, `src/data/openspec-status.json`): NICHT von
  Hand editieren — sie entstehen in T9/T12 über die in T5 angepassten
  Generatoren; die Regenerierung mit committen.
- **`components/website/CHANGELOG.md`: NICHT anfassen** (Ausnahmen-Tabelle).
- **`pnpm-workspace.yaml`, `package.json`:** keine Pfad-Referenzen (verifiziert)
  → kein Edit.

### T9: test:inventory lokal regenerieren (Commit übernimmt p5-tests)

Voraussetzung: T5 (build-test-inventory.sh kennt den neuen OUT-Pfad) und T1
(Guard-Datei existiert, wird ins Inventar aufgenommen).

```bash
task test:inventory   # lokal regenerieren für den p4-Verify — NICHT committen
```

Das finale Committen von `components/website/src/data/test-inventory.json` (mit allen
vier Guards aus p1–p4 registriert) übernimmt p5-tests (D1-Ownership).

### T10: Guard grün

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/website-moved.bats
# erwartet: grün — Positiv-Anker existiert, beide Negativ-Bloecke bestehen
# (kein Top-Level website/, keine stale Querschnitts-Referenzen)
```

Falls noch rot: Ursache ist eine übersehene `website/`-Referenz — T11
eingrenzen, dann T3–T8 fortsetzen.

### T11: Grep-Verifikation über alle Konsumenten

```bash
git grep -F -n 'website/' -- .github/workflows Taskfile.yml taskfiles scripts tests \
  .claude .opencode CLAUDE.md AGENTS.md GEMINI.md CONTRIBUTING.md README.md \
  .gitattributes .gitignore .dockerignore compose.dev.yaml docs/code-quality/gates.yaml \
  | grep -v 'components/website/' | grep -v 'tests/factory-eval/fixtures' \
  | grep -v 'scripts/code-quality/fixtures' | grep -v 'scripts/vda/frontmatter.sh' \
  | grep -v 'agentic-trends-radar'
```

Ergebnis muss leer sein (Ausnahme-Pfade oben sind die deklarierten Ausnahmen
mit Begründung aus der Ausnahmen-Tabelle). Bekannte bewusste Resttreffer
AUSSERHALB der Konsumenten-Liste: `k3d/`-Kommentare (5), `environments/`
(10, dokumentarisch bzw. Namespace-Referenz), `assets/Mentolder/INVENTORY.md`
(1, `ui_kits/website/`), `components/website/CHANGELOG.md`.

### T12: Finaler Verify (STRUCT3)

```bash
task test:changed
task freshness:regenerate
git add -A && git commit -m "chore(website): freshness-Artefakte nach website-Move regeneriert"
task freshness:check
task workspace:validate
```

Reihenfolge beachten: die Regenerierung (T12) erzeugt die in T8 genannten
Artefakte mit den neuen Generator-Pfaden — committen, BEVOR `freshness:check`
läuft (der Check vergleicht gegen den committeten Stand). `health:goals:emit`
ist bereits in T7 gelaufen (separater Generator, nicht Teil von
freshness:regenerate). `docs:deploy`/brain-ingest laufen nach Abschluss des
Gesamt-Changes (design.md-Risiko-Tabelle) — nicht Teil dieses Partials.

## Verify (RED → GREEN)

- [ ] **RED (T1):** `tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/website-moved.bats` — `expected: FAIL` (Positiv-Anker fehlt).
- [ ] **GREEN (T10):** derselbe Lauf grün nach T2–T9.
- [ ] **Final (T12):** `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task workspace:validate`.
