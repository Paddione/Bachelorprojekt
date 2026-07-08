---
ticket_id: T001578
plan_ref: openspec/changes/brain-site-dockerfile-template/tasks.md
status: active
date: 2026-07-03
---

# Design: brain site.Dockerfile Template baubar machen (T001578)

## Kontext

Sprint-1-Defekt aus PR #2554: `templates/brain/site.Dockerfile` ist unbaubar. `scripts/brain-bootstrap.sh` kopiert den Template-Baum 1:1 in jedes Seed-Ziel (lokal oder `Paddione/brain`-Remote), d. h. jedes künftige Bootstrap-Seed erbt die kaputte Datei. Im externen Repo `Paddione/brain` liegt bereits eine funktionierende, live verifizierte Version (Image `ghcr.io/paddione/brain-site:latest` gebaut + auf fleet deployt), die aber nie ins Template zurückgeflossen ist.

## Root-Cause

1. `npm ci --only=production` gegen `package*.json`, die im Template nicht existieren — das Template ist ein reines Content-Wiki ohne Node-Manifest.
2. `npx quartz build` ungepinnt gegen Quartz v5-main (`env -S`-Shebang-Bruch, `.quartz/plugins`-Layoutwechsel).
3. Runtime-Basis-Image `ghcr.io/paddione/workspace-static-server:latest` existiert nicht auf ghcr.

## Entscheidung (gewählter Ansatz)

Die bewährte Version aus `Paddione/brain` wird ins Template zurückgeführt:

1. **`templates/brain/site.Dockerfile` ersetzen** durch den Quartz-v4.5.2-Clone-Build:
   - Builder: `node:22-slim`, `git clone --depth 1 --branch v4.5.2 https://github.com/jackyzha0/quartz /q`, `npm ci` im Clone (dort existiert die package.json), `rm -rf /q/content`, `COPY content /q/content`, `npx quartz build`.
   - Runtime: `ghcr.io/static-web-server/static-web-server:2-alpine`, `COPY --from=builder /q/public /public`.
   - **Kein `EXPOSE`/`CMD`**: `k3d/brain.yaml` setzt `SERVER_PORT=8787` als Env-Variable; static-web-server liest diese, der Container-Port 8787 aus `tests/spec/brain-quartz-deploy.bats` bleibt erfüllt. (Verifiziert: `k3d/brain.yaml` Zeilen 43–48.)
2. **`templates/brain/.github/workflows/build-site.yml` neu aufnehmen** (Kopie des funktionierenden Workflows aus `Paddione/brain`): staged `index.md log.md SCHEMA.md wiki raw` nach `/tmp/build/content/`, baut mit `site.Dockerfile` und pusht `ghcr.io/paddione/brain-site:latest` (Trigger: push auf main + workflow_dispatch, `packages: write`).
3. **`scripts/brain-bootstrap.sh` bleibt unverändert** — die 1:1-Copy (`cp -R "$TEMPLATE_DIR/." "$dest/"`) seedet beide Dateien automatisch mit.

## Verworfene Alternativen

- **package.json ins Template vendoren** (Quartz als npm-Dependency): schwerer, laufende Drift gegen Quartz-Releases, kein Mehrwert gegenüber dem getaggten Clone.
- **Bootstrap zieht das Dockerfile zur Laufzeit aus `Paddione/brain`**: führt eine Netzabhängigkeit in den Local-Mode ein und bricht die in `tests/spec/brain-foundation.bats` verankerte Offline-Idempotenz.

## Failing Test (rot→grün, Fix-Pfad-Pflicht)

Neue `@test`-Fälle in `tests/spec/brain-foundation.bats` (Parent-SSOT `openspec/specs/brain-foundation.md`):

- `site.Dockerfile` pinnt Quartz v4.5.2 (`--branch v4.5.2`).
- `site.Dockerfile` nutzt `ghcr.io/static-web-server/static-web-server:2-alpine` als Runtime-Stage.
- `site.Dockerfile` enthält KEIN `COPY package*.json` / kein `npm ci --only=production` (Symptom des Bugs).
- `templates/brain/.github/workflows/build-site.yml` existiert und pusht Tag `ghcr.io/paddione/brain-site:latest`.
- Bootstrap-Seed (Local-Mode in Temp-Dir) enthält beide Dateien.

## Testing / Verifikation

- `./tests/runner.sh` bzw. `bats tests/spec/brain-foundation.bats` — neue Tests erst rot, nach Fix grün.
- `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task test:inventory` (Test-Inventar committen).
- Kein Manifest-Change → kein `workspace:validate`-Delta erwartet.

## Scope

Nur Template + Tests. Das externe Repo `Paddione/brain` ist bereits korrekt und wird nicht angefasst. Kein Deployment-Schritt (Image-Build läuft im externen Repo).
