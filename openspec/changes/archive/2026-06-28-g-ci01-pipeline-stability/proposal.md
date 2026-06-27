## Why

Die CI-Pipeline scheitert nach jedem main-Push an zwei konkret identifizierten Regressionen: (1) die GPG-Action in `freshness-regen.yml` referenziert eine nicht mehr auflösbare Commit-SHA, sodass Freshness-Artefakte nie auto-regeneriert werden; (2) `website/Dockerfile` referenziert `package-lock.json`, das in T001224 (S5 Lockfile-Gate) gelöscht wurde — der Docker-Build schlägt bei jedem website-Push fehl.

## What Changes

- `.github/workflows/freshness-regen.yml`: GPG-Import-Step (`crazy-max/ghaction-import-gpg`) entfernen — Bot-Commits laufen ohne GPG-Signing (via GH_PAT bereits authentifiziert)
- `website/Dockerfile`: Build-Stage von `npm ci`/`npm run build`/`npm prune` auf `pnpm@10 install --frozen-lockfile`/`pnpm build`/`pnpm prune --prod` migrieren; COPY-Zeile auf `pnpm-lock.yaml` umstellen
- `tests/spec/ci-cd.bats`: 4 neue G-CI01 BATS-Tests hinzufügen (Regression Guards für beide Fixes)
- `openspec/specs/ci-cd.md`: Requirements für pnpm-Dockerfile und GPG-freie Bot-Commits ergänzen

## Capabilities

### New Capabilities

<!-- keine neuen Capabilities — reine Regression-Fixes -->

### Modified Capabilities

- `ci-cd`: Requirements für post-merge Freshness-Regenerierung (GPG-freie Bot-Commits) und Website-Dockerfile-Build (pnpm-Konformität) aktualisieren

## Impact

- `.github/workflows/freshness-regen.yml` — GPG-Step entfernt; Workflow läuft danach bei jedem main-Push durch
- `website/Dockerfile` — Build-Stage nutzt pnpm@10; Docker-Build für Website-Image funktioniert wieder
- `tests/spec/ci-cd.bats` — 4 neue Regression-Guard-Tests (G-CI01-A bis G-CI01-D)
- `openspec/specs/ci-cd.md` — Requirements-Delta für ci-cd-Komponente
- Keine API-Änderungen, keine Datenbank-Änderungen, keine Secret-Änderungen
- T001276 (g-cd01-korczewski-ci-parity) berührt andere Dateien — kein Merge-Konflikt erwartet
