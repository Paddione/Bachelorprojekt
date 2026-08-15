---
title: repo-structure-reorg — Partial p2-mini-moves (design-system, art-library)
ticket_id: T006999
domains: [repo-structure]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# repo-structure-reorg — Implementation Plan (Partial p2-mini-moves)

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `openspec/changes/repo-structure-reorg/tasks.d/p2-mini-moves.md` (NEU, dieser Plan) | — | — |
| `tests/spec/repo-structure/packages-assets.bats` (NEU) | — | neues .bats: kein Limit — `tests/**/*.bats` steht in `s1.excludes` (gates.yaml) |
| `design-system/build.mjs` (move → `packages/design-system/`) | 85 | 715 (Limit `.mjs` 800, nicht baselined) |
| `design-system/NOTES.md` (move) | 19 | kein `.md`-Limit in gates.yaml → nicht beziffert |
| `design-system/_tokens.css` (move, generiert) | 216 | kein `.css`-Limit → nicht beziffert |
| `design-system/cards/*.html` (14 Dateien, move, generiert) | 3948 gesamt | kein `.html`-Limit → nicht beziffert |
| `.claude/skills/ui-ux-pro-max/scripts/design_system.py` | 1329 | −529 (Limit `.py` 800) — kein Split nötig: Edit ist zeilenneutral (reine Pfad-Substitution, keine Zeilenaddition) |
| `.claude/skills/ui-ux-pro-max/scripts/search.py` | 127 | 673 (Limit `.py` 800) |
| `tests/unit/test_art_library_manifest.bats` | 34 | kein `.bats`-Limit → nicht beziffert |
| `tests/unit/.coverage-allowlist` | 62 | kein Extension-Limit → nicht beziffert |
| `art-library/README.md` (move → `assets/art-library/`) | 21 | kein `.md`-Limit → nicht beziffert |
| `docs/code-quality/repo-index.json` (generiert) | — | Regenerierung via `task freshness:regenerate` (kein Hand-Edit, kein Budget) |

Budgetwerte stammen aus dem Linter selbst (`bash scripts/plan-lint.sh residual_budget <datei>`);
keine der Dateien ist in `docs/code-quality/baseline.json` gebaselined, wirksame Schwelle ist
also das statische Extension-Limit aus `docs/code-quality/gates.yaml` (`s1.limits`). Die
Zeilenzahlen sind `wc -l` vom Stand HEAD `7ae8d8279fd0f3286df257d9afe233d30edc5b94`.

## Kontext: Messung und Zuordnung (D1)

### Messung (T002717)

```bash
# Stand, gegen den gemessen wurde — Messung 2026-08-15, Fixed-String, ohne
# node_modules/.git/tmp/k3d/docs-content-built/openspec
PRE=7ae8d8279fd0f3286df257d9afe233d30edc5b94
git grep -F -l 'design-system/' "$PRE" -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec' | wc -l   # 25 Dateien
git grep -F -l 'art-library/' "$PRE" -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec' | wc -l    # 15 Dateien
git grep -F -o 'design-system/' "$PRE" -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec' | wc -l  # 180 Vorkommen
git grep -F -o 'art-library/' "$PRE" -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec' | wc -l    # 204 Vorkommen
```

### Dieses Partial bearbeitet nur (p2-exklusiv, Referenzen ausschließlich design-system/art-library)

- `tests/spec/repo-structure/packages-assets.bats` — NEU (Guard, T002416: Verzeichnis je SSOT-Spec-Slug `repo-structure`)
- `design-system/build.mjs`, `design-system/NOTES.md`, `design-system/_tokens.css`, `design-system/cards/*.html` (14) — ziehen mit dem Move um, interne `design-system/`-Selbstreferenzen werden aktualisiert
- `.claude/skills/ui-ux-pro-max/scripts/design_system.py` — 5 Stellen (675, 700, 718, 770, 1084), davon Zeile 718 Runtime-Pfadkonstruktion (`base_dir / "design-system" / project_slug`)
- `.claude/skills/ui-ux-pro-max/scripts/search.py` — 8 String-Stellen (19, 20, 74, 75, 103, 104, 107, 109)
- `tests/unit/test_art_library_manifest.bats` — 4 Pfadstellen (9, 15, 23, 31)
- `tests/unit/.coverage-allowlist` — Kommentarzeile 38
- `art-library/README.md` — Zeile 17 (Repo-Pfad); Zeilen 10–11 sind Runtime-Mount-Pfade (`/app/public/art-library/`, URL `/art-library/`) und bleiben unverändert
- `docs/code-quality/repo-index.json` — generiert; wird in Task 4 per `freshness:regenerate` neu erzeugt und committet (Regen-über-Regen ist konfliktfrei, p4 regeneriert am Ende erneut)

### Querschnitts-Dateien — NICHT in diesem Partial, p4-website übernimmt sie geschlossen (D1)

Diese Dateien referenzieren neben design-system/art-library auch andere Move-Ziele
(website/, brett/, mentolder-web/, videovault) und gehören daher zu p4:

- `Taskfile.yml` (Zeilen 661–664, `test:art-library`)
- `renovate.json5` (Zeile 30)
- `commitlint.config.cjs` (Zeile 32)
- `docs/code-quality/gates.yaml` (Zeile 10, `scan.code_roots`)
- `docs/code-quality/subsystems.yaml` (Zeilen 58–62)
- `docs/bereitstellungsdetails.md` (Zeile 279)
- `assets/Mentolder/INVENTORY.md` (Zeilen 13–222, referenziert auch `brett/`)
- `docs/superpowers/plans/2026-06-27-mentolder-brand-foundations-design-system.md`
- `docs/superpowers/specs/2026-06-27-mentolder-brand-foundations-design-system-design.md`
- `docs/superpowers/specs/2026-06-17-t000898-design.md`
- `docs/superpowers/specs/archive/2026-05-04-art-library-design.md`
- `docs/superpowers/specs/archive/2026-05-05-korczewski-kore-homepage-design.md`
- `docs/superpowers/specs/archive/2026-05-10-brett-art-library-whiteboard-design.md`
- `docs/superpowers/specs/archive/2026-05-13-brett-aufstellungstypen-elemente-kugelsteuerung-design.md`
- `design-system/config.json` (Zeile 6, `tokenSource` zeigt ausschließlich auf `website/public/...` — p4)

### Komponenten-eigenes Partial (nicht p2, nicht p4)

- `VideoVault/vite.config.ts` (Zeile 28) und `VideoVault/client/src/styles/cybervault-videovault.css` (Zeile 7):
  Der Alias `@design-system` zeigt auf `VideoVault/shared/design-system` (lokale Kopie, verifiziert) —
  vom Top-Level-Move unberührt; das VideoVault-Move-Partial (p3) übernimmt. Ebenso betrifft
  `VideoVault/vite.config.ts` Zeile 30 (`packages/videovault-player`) kein Move-Ziel.

### Keine Top-Level-Pfad-Referenzen (False Positives, kein Edit)

- `.claude/skills/website-specialist/SKILL.md:49` — `assets/design-overviews/kore-design-system/` (anderer Pfad)
- `docs/superpowers/specs/archive/2026-05-05-korczewski-kore-homepage-design.md:25` — `kore-design-system/project/...` (anderer Pfad)
- `docs/diagrams/architecture.md:2100`, `docs/generated/api-map.json:22`, `docs/generated/api-surface.md:9` — Runtime-URL `/api/admin/art-library` (kein Repo-Pfad; api-map/-surface sind generiert)
- `.gitignore:192` — Kommentar zum historischen mentolder-ds-Vendor (keine Pfad-Referenz)
- `.claude/skills/lavish/SKILL.md:28`, `brett/src/client/ui/hud.ts:117`, `assets/grilling-brett-admin-panel/.../_card.css:1` — Prosa ohne Pfadbezug
- `taskfiles/Taskfile.assets.yml` — Referenzierung geprüft: keine design-system/art-library-Vorkommen (sync läuft über root `assets/`, das art-library als Unterordner automatisch erfasst) → kein Edit

Verifizierter Negativ-Befund (deckt sich mit design.md): `k3d/`, `prod*/`, `flux/`,
`environments/`, `scripts/` enthalten keinerlei `design-system`/`art-library`-Referenzen.

---

## Task 1 — Guard schreiben (RED, expected: FAIL)

Neue Datei `tests/spec/repo-structure/packages-assets.bats` anlegen (T002416: Verzeichnis
`tests/spec/<ssot-spec-slug>/<kurz-slug>.bats`; SSOT-Slug `repo-structure` aus
`openspec/changes/repo-structure-reorg/specs/repo-structure.md`). Positiv-Anker zuerst, dann
Negativ-Aussage — im selben Test (T002356-M1). Prüfmodus: Output-Verifikation (T002448-M4) —
die Assertions führen `test -d` aus und prüfen dessen Exit-Code (Dateisystem-Semantik,
keine Source-Greps); Semantik statt Darstellung (T002716).

```bash
#!/usr/bin/env bats
# tests/spec/repo-structure/packages-assets.bats — Drift-Guard fuer den Reorg-Change
# repo-structure-reorg (T006999, Partial p2-mini-moves):
#   design-system/  -> packages/design-system/
#   art-library/    -> assets/art-library/
#
# Pruefmodus: Output-Verifikation (T002448-M4) — fuehrt `test -d` aus und prueft den
# Exit-Code; keine Source-Greps. Semantik statt Darstellung (T002716).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "packages-assets: Zielpfade packages/design-system und assets/art-library existieren" {
  # Positiv-Anker (T002356-M1): fehlen die Moves, ist dieser Test rot.
  [ -d "${REPO_ROOT}/packages/design-system" ]
  [ -d "${REPO_ROOT}/assets/art-library" ]
}

@test "packages-assets: keine Top-Level-Ordner design-system/ und art-library/ (mit Positiv-Anker)" {
  # Positiv-Anker zuerst, dann die Negativ-Aussage — im selben Test (T002356-M1):
  # ohne Anker waere "Top-Level-Ordner fehlen" bei fehlender Implementierung trivial.
  [ -d "${REPO_ROOT}/packages/design-system" ]
  [ -d "${REPO_ROOT}/assets/art-library" ]
  [ ! -d "${REPO_ROOT}/design-system" ]
  [ ! -d "${REPO_ROOT}/art-library" ]
}
```

RED-Lauf — beide Tests müssen scheitern, weil die Zielpfade noch fehlen:

```bash
cd "$REPO_ROOT"
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/packages-assets.bats
```

expected: FAIL (2 Tests, 2 Fehlschläge — `packages/design-system` und `assets/art-library`
existieren noch nicht). Der Guard wird noch NICHT committet (Commit in Task 4, wenn er grün ist).

## Task 2 — Move 1: `design-system` → `packages/design-system` (atomarer Commit)

```bash
git mv design-system packages/design-system
```

Referenz-Edits (in dieser Reihenfolge):

1. Selbstreferenzen im verschobenen Ordner — alle `design-system/`-Vorkommen, die nach dem
   Move auf den alten Top-Level-Pfad zeigen, auf `packages/design-system/` umstellen
   (betrifft `NOTES.md` Zeilen 8–11, `_tokens.css` Zeile 1, 14× `cards/*.html` Zeile 5–7
   und den Header-Template-String in `build.mjs` Zeile 25):

   ```bash
   git grep -l -F 'design-system/' -- packages/design-system | xargs sed -i 's#design-system/#packages/design-system/#g'
   ```

2. Tiefenkorrektur in `packages/design-system/build.mjs` Zeile 6 — der Ordner ist eine
   Ebene tiefer, UND das Zielsegment wird hier GLEICH auf den p4-Endzustand gesetzt
   (build.mjs ist eine p2-Datei, p4 fasst sie nicht mehr an — D1):

   ```bash
   # vorher:  const BRAND = join(HERE, '..', 'website', 'public', 'brand', 'mentolder');
   # nachher: const BRAND = join(HERE, '..', '..', 'components', 'website', 'public', 'brand', 'mentolder');
   ```

   Zwischenrisiko (dokumentiert): Zwischen p2 und p4 zeigt BRAND ins Leere, bis p4
   `website` → `components/website` verschiebt. `build.mjs` läuft in diesem Fenster
   nicht in CI; der `task assets`-Aufruf ist bis p4 rot (Branch-Zwischenzustand,
   PR-Endzustand zählt).

3. `.claude/skills/ui-ux-pro-max/scripts/design_system.py` — Runtime-Pfadkonstruktion
   Zeile 718 plus Docstrings/Outputs (Zeilen 675, 700, 770, 1084):

   ```bash
   # Zeile 718 (Runtime!):  base_dir / "design-system" / project_slug
   #                        → base_dir / "packages" / "design-system" / project_slug
   # Zeilen 675/700/770/1084: String-Literale `design-system/` → `packages/design-system/`
   ```

4. `.claude/skills/ui-ux-pro-max/scripts/search.py` — 8 String-Stellen
   (Zeilen 19, 20, 74, 75, 103, 104, 107, 109): `design-system/` → `packages/design-system/`.

Grep-Verifikation für Move 1 (muss nach dem Commit leer sein — außerhalb der neuen Pfade,
der p4-Liste und des VideoVault-Partials):

```bash
git grep -F -n 'design-system/' -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec' ':!packages/design-system' \
  ':!docs/superpowers' ':!VideoVault' ':!.claude/skills/website-specialist'
```

Erwartete verbleibende Treffer außerhalb der Ausschlüsse: keine. (Die in
`docs/superpowers/plans/2026-06-27-...md` und `docs/superpowers/specs/...` stehenden
Treffer sowie `VideoVault/...` sind die dokumentierten p4-/p3-Übergaben; `kore-design-system`-
Treffer sind False Positives.)

Commit (ein Move = ein atomarer Commit):

```bash
git add -A
git commit -m "chore(T006999): move design-system to packages/design-system"
```

## Task 3 — Move 2: `art-library` → `assets/art-library` (atomarer Commit)

```bash
git mv art-library assets/art-library
```

Referenz-Edits:

1. `assets/art-library/README.md` Zeile 17 — Repo-Pfad in der Anleitung:
   `node art-library/_tooling/validate-manifest.mjs` → `node assets/art-library/_tooling/validate-manifest.mjs`.
   (Zeilen 10–11 beschreiben den Runtime-Mount `/app/public/art-library/` — unverändert.)

2. `tests/unit/test_art_library_manifest.bats` — 4 Pfadstellen (Zeilen 9, 15, 23, 31):
   `${REPO}/art-library/` → `${REPO}/assets/art-library/`.

3. `tests/unit/.coverage-allowlist` Zeile 38 — Kommentar:
   `art-library/_tooling` → `assets/art-library/_tooling` (Eintragsname
   `test_art_library_manifest` bleibt unverändert).

Grep-Verifikation für Move 2 (muss nach dem Commit leer sein — außerhalb der neuen Pfade
und der p4-Liste):

```bash
git grep -F -n 'art-library/' -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec' ':!assets/art-library' \
  ':!Taskfile.yml' ':!renovate.json5' ':!commitlint.config.cjs' ':!docs/code-quality' ':!docs/bereitstellungsdetails.md' \
  ':!assets/Mentolder/INVENTORY.md' ':!docs/superpowers' ':!docs/diagrams' ':!docs/generated'
```

Erwartete verbleibende Treffer außerhalb der Ausschlüsse: keine.

Commit:

```bash
git add -A
git commit -m "chore(T006999): move art-library to assets/art-library"
```

## Task 4 — Guard grün + Gesamtverifikation (STRUCT3)

1. Guard-Lauf — muss jetzt grün sein:

   ```bash
   cd "$REPO_ROOT"
   tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/packages-assets.bats
   # beide @test grün (Positiv-Anker UND Negativ-Aussage)
   ```

   Zusätzlich die T002696-Form (Verzeichnis- und Sammeldatei-Form gemeinsam erfassen):

   ```bash
   tests/unit/lib/bats-core/bin/bats -r tests/spec/repo-structure*
   ```

2. Geänderte Tests direkt prüfen (der Taskfile-Wrapper `test:art-library` zeigt bis p4 noch
   auf den alten Pfad — Taskfile.yml ist p4-übernommen, D1; deshalb direkte Aufrufe):

   ```bash
   cd assets/art-library/_tooling && npm install --silent && cd "$REPO_ROOT"
   tests/unit/lib/bats-core/bin/bats tests/unit/test_art_library_manifest.bats
   ```

3. Guard committen (jetzt grün) samt Regenerierung der generierten Artefakte:

   ```bash
   git add tests/spec/repo-structure/packages-assets.bats
   task freshness:regenerate
   # docs/code-quality/repo-index.json (Pfadänderungen der Moves) committen:
   git add docs/code-quality/repo-index.json
   # website/src/data/test-inventory.json wird von freshness:regenerate mitgeschrieben,
   # wird aber BEWUSST NICHT committet (D1 → p4-website, die Datei liegt in website/src/).
   # Falls der Arbeitsbaum-Diff sie enthält, nicht stagen; ggf. git checkout -- <pfad> NICHT
   # ausführen — die Arbeitsbaum-Datei kann bleiben, nur nicht committen.
   git commit -m "chore(T006999): guard packages/assets Zielstruktur + Artefakt-Regenerierung"
   ```

4. Pflicht-Verify (STRUCT3) — letzter Task des Partials:

   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```

   Erwarteter Einzelbefund in `freshness:check`: Drift in
   `website/src/data/test-inventory.json` (der neue Guard wird erst in p4-website
   registriert — D1, Regenerierung mit allen Test-Änderungen dort). Alle übrigen
   Artefakte und Ratchets (S1–S4, Baseline) müssen grün sein. `git status` muss außer
   `website/src/data/test-inventory.json` keine uncommitteten Dateien zeigen.

## Risiken

| Risiko | Mitigation |
|---|---|
| CI-Inventory-Check schlägt für einen isolierten p2-Zwischenstand rot (neuer Guard, test-inventory.json bewusst nicht committet — D1) | Dokumentierte, gewollte Drift: p4-website regeneriert und committet die Datei zuletzt; bei Merge als gemeinsamer PR entfällt das Fenster |
| `task test:art-library` (Taskfile.yml) zeigt bis p4 auf den alten Pfad | Taskfile.yml ist p4-übernommen (D1); p2 verifiziert direkt per vendored bats + `node assets/art-library/_tooling/validate-manifest.mjs` |
| `design-system/build.mjs`-Regenerierung erzeugt Rauschen (Quell-CSS seit letztem Build geändert) | Bewusst KEINE Regenerierung in p2 — Header-Update per sed-Sweep (Task 2), minimale Diff-Fläche; `website/`-Referenzen bleiben bis p4 stehen |
| `packages/` als npm-Pakete-Ordner (videovault-player) — design-system hat kein package.json | Verifiziert: keine Root-Workspaces-/pnpm-workspace-Konfiguration vorhanden; reine Ordnerkonvention, kein npm-Effekt |
| Parallelität auf p4-Dateien | Partials disjunkt (D1): p2 fasst keine der p4-/p3-Dateien an; Übergabe-Listen oben explizit |
| `docs/code-quality/repo-index.json`-Regen in p2 und erneut in p4 | Regen-über-Regen ist konfliktfrei (sequenzielle Regenerierung, kein Hand-Edit) |
