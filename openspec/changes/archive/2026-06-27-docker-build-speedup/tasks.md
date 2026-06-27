---
title: "Docker-Build-Beschleunigung (Caching + Website slim/konsolidieren + arm64-Drop)"
ticket_id: T001229
domains: [infra, website]
status: completed
file_locks:
  - .github/workflows/build-website.yml
  - .github/workflows/build-website-korczewski.yml
  - .github/workflows/build-brett.yml
  - .github/workflows/build-videovault.yml
  - .github/workflows/build-mediaviewer-widget.yml
  - .github/workflows/build-mentolder-web.yml
  - .github/workflows/build-docs.yml
  - .github/workflows/build-transcriber.yml
  - .github/workflows/build-collabora.yml
  - website/Dockerfile
  - website/package.json
  - website/CLAUDE.md
  - brett/Dockerfile
  - VideoVault/Dockerfile
  - mediaviewer-widget/Dockerfile
  - mentolder-web/Dockerfile
  - k3d/talk-transcriber/Dockerfile
  - environments/mentolder.yaml
  - environments/korczewski.yaml
  - environments/fleet-mentolder.yaml
  - environments/fleet-korczewski.yaml
  - environments/staging.yaml
  - environments/dev.yaml
  - tests/spec/docker-build-speedup.bats
  - website/src/data/test-inventory.json
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: docker-build-speedup (T001229)

> Drei je-einzeln-mergebare Phasen. Reihenfolge: Phase 1 → Phase 2 → Phase 3.
> Jede Phase ist ein eigener PR. Phase 2 baut auf Phase 1 auf (Cache greift schon),
> Phase 3 ist unabhängig. Innerhalb einer Phase: Tasks der Reihe nach.

- [x] **P1-T0** (TDD rot) Failing-Test-Block `tests/spec/docker-build-speedup.bats` für den Phase-1-Endzustand schreiben + ausführen, Expected: FAIL (rot)
- [x] **P1-T1** BuildKit-Cache-Mounts + `# syntax`-Direktive in die 6 Dependency-Dockerfiles
- [x] **P1-T2** Die 7 „nackten `docker build`"-Workflows auf `build-push-action@v6` + `type=gha`-Cache umstellen (`--no-cache` raus), Interface-Kontrakt wahren
- [x] **P1-T3** `type=gha`-Cache in die 2 bereits-buildx-Workflows (transcriber/collabora) ergänzen
- [x] **P1-T4** `setup-node`-Cache-Audit: pro Workflow Runner-npm/pnpm-Nutzung prüfen, Befund festhalten, KEINE Cache-Keys entfernen
- [x] **P1-T5** Phase-1-Verifikation + Build-Zeit-Messprozedur dokumentieren
- [x] **P2-T0** (TDD rot) Phase-2-Assertions an `tests/spec/docker-build-speedup.bats` anhängen + ausführen, Expected: FAIL (rot)
- [x] **P2-T1** (2a) `npm prune --omit=dev` im Build-Stage von `website/Dockerfile`
- [x] **P2-T2** (2a-Guardrail HART) Runtime-Image lokal bauen, booten, Smoke HTTP 200 auf `/`; bei Boot-Fehler Paket `devDependencies`→`dependencies`
- [x] **P2-T3** (2b-Guardrail HART, ZUERST) `import.meta.env.*`-Grep — bestätigen, dass keine brand-differenzierende Build-Zeit-Konstante existiert; bei Fund 2b zurückstellen
- [x] **P2-T4** (2b) Geteiltes Image `ghcr.io/paddione/website`: `build-website.yml` = 1 Build + 2 Deploy-Steps; `build-website-korczewski.yml` löschen; `WEBSITE_IMAGE` in allen `environments/*.yaml` repointen
- [x] **P2-T5** Stale Aussage in `website/CLAUDE.md` korrigieren (`LEGAL_*` Build-Zeit → Runtime)
- [ ] **P2-T6** Rollout beider Brands verifizieren (post-merge)
- [x] **P3-T0** (TDD rot) Phase-3-Assertions an `tests/spec/docker-build-speedup.bats` anhängen + ausführen, Expected: FAIL (rot)
- [x] **P3-T1** (Pre-flight) `kubectl --context fleet get nodes -o wide` → amd64-only bestätigen
- [x] **P3-T2** `build-transcriber.yml` + `build-collabora.yml`: `platforms: linux/amd64` (arm64 + QEMU raus)
- [x] **P3-T3** Phase-3-Verifikation
- [x] **SPEC** Spec-Delta `specs/docker-build-speedup.md` füllen + `task test:openspec` grün
- [ ] **VERIFY** Finaler CI-Gate-Verifikations-Task (pro Phase-PR auszuführen)

---

# Docker-Build-Beschleunigung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI-Docker-Build-Zeiten drastisch senken (Cache-Hit ~4–8 min → ~1–2 min) und das Website-Image von ~1,2 GB auf ~600 MB schrumpfen, ohne Image-Namen/Tags/Deploy-Verhalten zu brechen.

**Architecture:** Drei orthogonale Hebel in je-mergebaren Phasen: (1) cross-cutting Layer-Caching (BuildKit-Cache-Mounts in den Dockerfiles + GHA-Layer-Cache in den Workflows), (2) Website abspecken (`npm prune --omit=dev`) und die zwei byte-identischen Brand-Builds zu einem geteilten Image konsolidieren, (3) den ungenutzten arm64/QEMU-Build aus transcriber + collabora entfernen. Der Interface-Kontrakt (Image-Name, Tags, Build-Args, `IMAGE`/`SHA_TAG`-Outputs, Deploy-Steps) bleibt in Phase 1 byte-gleich — nur der Build-Mechanismus wechselt.

**Tech Stack:** GitHub Actions, `docker/setup-buildx-action`, `docker/build-push-action@v6`, BuildKit (`# syntax=docker/dockerfile:1`, `--mount=type=cache`), `type=gha`-Cache, npm/pnpm/pip, Kustomize, `env-resolve.sh`/`environments/*.yaml`.

## Global Constraints

- **Interface-Kontrakt (Phase 1, unverhandelbar):** Image-Name, beide Tags (`:${SHA_TAG}`/`:sha-${SHA}` **und** `:latest`), alle `--build-arg`-Werte, die `GITHUB_ENV`-Outputs `IMAGE` + `SHA_TAG` sowie sämtliche Deploy-/Rollout-/Secret-Check-Steps bleiben **byte-gleich**. Es wechselt ausschließlich der Build-Mechanismus.
- **GHA-Cache-Budget = 10 GB/Repo.** `cache-to: type=gha,mode=max` **nur** für schwere Images (website, videovault, transcriber). Leichte (docs, collabora, brett, mediaviewer-widget, mentolder-web) → `mode=min`. Sonst Evictions → Cache wertlos.
- **`# syntax=docker/dockerfile:1` MUSS die allererste Zeile** jedes Dockerfiles mit Cache-Mount sein (vor jeglichem Kommentar), sonst ignoriert der Frontend-Parser die `--mount`-Syntax.
- **Keine Brand-Domain-Literale** (`*.mentolder.de` / `*.korczewski.de`) neu in `k3d/`, `prod*/`, `website/src/` einführen (S3). Workflow-YAML ist nicht S3-scoped — bestehende Domain-Literale in `--build-arg`s dort bleiben verbatim (Interface-Kontrakt).
- **Kein Runtime/Test-Split der Website** (YAGNI): Chromium, kubectl und `tests/` bleiben bewusst im einen Runtime-Image. Nur devDeps werden gepruned.
- **Image-Pins:** `:latest` ist für website/brett/docs/videovault/mediaviewer/mentolder-web bewusst (CLAUDE.md). `build-push-action` pusht weiterhin `:latest` **und** den SHA-Tag — kein neuer Pin-Verstoß.

## Quality-Gate-Vorabprüfung (pro berührter Nicht-YAML/Nicht-Dockerfile-Datei)

| Datei | ext | `wc -l` | Baseline (`S1:<pfad>.metric`) | wirksame Schwelle | S1-Budget |
|-------|-----|---------|-------------------------------|-------------------|-----------|
| `website/package.json` | `.json` | 84 | nicht-baselined | `.json` **nicht in `s1.limits`** → kein Zeilen-Gate | n/a (nur ±1 Zeile devDeps→deps) |
| `website/CLAUDE.md` | `.md` | 73 | nicht-baselined | `.md` **nicht in `s1.limits`** → kein Zeilen-Gate | n/a (1-Zeilen-Korrektur) |

Alle übrigen Targets sind `.yml`/`.yaml`/`Dockerfile`/`environments/*.yaml` — **keine** Extension aus `s1.limits` (`.ts .js .jsx .py .svelte .sh .mjs .mts .astro .tsx .java .php .bash .cjs`) → S1 wird nicht getriggert. **S2** (Import-Zyklen): nicht berührt (keine neuen `website/src`-Module; devDeps→deps ist kein Import). **S3**: oben abgedeckt. **S4** (Orphans): keine neuen `k3d/*.yaml`/`scripts/*.sh`; das Löschen von `build-website-korczewski.yml` ist ein Workflow (kein Manifest/Skript) und repointet keine Referenzen — die Overlays zeigen weiter auf `k3d/website.yaml` (templated). Kein Orphan.

Die neue Testdatei `tests/spec/docker-build-speedup.bats` ist `.bats` → **nicht** in `s1.limits` (kein S1-Gate). Sie ist konventionskonform (eine `.bats`-Datei pro OpenSpec-SSOT-Spec unter `tests/spec/`, Vorlage `tests/spec/software-factory.bats`). Jede Test-Änderung erzwingt `task test:inventory` + Mitcommit von `website/src/data/test-inventory.json` (siehe VERIFY-Task) — sonst failt der CI-Inventory-Check.

---

## File Structure

Alle vom Change berührten Pfade, gruppiert nach Aktion (1-Wort-Zweck je Pfad):

**Create:**
- `tests/spec/docker-build-speedup.bats` — TDD-Invarianten-Suite (3 Phasen-Blöcke)

**Delete:**
- `.github/workflows/build-website-korczewski.yml` — Workflow-Konsolidierung (Phase 2b)

**Modify — Workflows (.github/workflows/):**
- `build-website.yml` — buildx+gha-Cache (P1); 1-Build/2-Deploy + shared image (P2)
- `build-website-korczewski.yml` — buildx+gha-Cache (P1, vor Löschung in P2)
- `build-videovault.yml` — buildx+gha-Cache, `--no-cache` raus (P1)
- `build-brett.yml` — buildx+gha-Cache (P1)
- `build-mediaviewer-widget.yml` — buildx+gha-Cache (P1)
- `build-mentolder-web.yml` — buildx+gha-Cache (P1)
- `build-docs.yml` — buildx+gha-Cache (P1)
- `build-transcriber.yml` — gha-Cache (P1); arm64/QEMU raus (P3)
- `build-collabora.yml` — gha-Cache (P1); arm64/QEMU raus (P3)

**Modify — Dockerfiles:**
- `website/Dockerfile` — `# syntax`+npm-Cache-Mount (P1); `npm prune --omit=dev` (P2a)
- `brett/Dockerfile` — `# syntax`+npm-Cache-Mount (P1)
- `VideoVault/Dockerfile` — `# syntax`+npm-Cache-Mount (P1)
- `mediaviewer-widget/Dockerfile` — `# syntax`+npm-Cache-Mount (P1)
- `mentolder-web/Dockerfile` — `# syntax`+pnpm-Store-Cache-Mount (P1)
- `k3d/talk-transcriber/Dockerfile` — `# syntax`+pip-Cache-Mount, `--no-cache-dir` raus (P1)

**Modify — App/Config:**
- `website/package.json` — Paket-Umhängung devDeps→deps nur im Guardrail-Fehlerfall (P2a)
- `website/CLAUDE.md` — stale Build-Zeit-Aussage korrigieren (P2)
- `environments/mentolder.yaml` — `WEBSITE_IMAGE: website` (P2b)
- `environments/korczewski.yaml` — `WEBSITE_IMAGE: website` (P2b)
- `environments/fleet-mentolder.yaml` — `WEBSITE_IMAGE: website` (P2b)
- `environments/fleet-korczewski.yaml` — `WEBSITE_IMAGE: website` (P2b)
- `environments/staging.yaml` — `WEBSITE_IMAGE: website` (P2b)
- `environments/dev.yaml` — `WEBSITE_IMAGE: website` (P2b)

**Modify — Generierte Artefakte (mitcommitten):**
- `website/src/data/test-inventory.json` — Regen nach BATS-Add via `task test:inventory`

**Modify — OpenSpec (Plan-Repo):**
- `openspec/changes/docker-build-speedup/specs/docker-build-speedup.md` — Spec-Delta füllen (SPEC-Task)

**Verifikation-only (kein Edit):**
- `k3d/website.yaml`, `prod-fleet/website-mentolder/`, `prod-fleet/website-korczewski/`, `docker/collabora/Dockerfile`, `scripts/docs.Dockerfile` — bleiben unverändert; nur prüfen.

---

## PHASE 1 — Cross-cutting Layer-Caching (PR #1)

### Task P1-T0: Failing-Test-Block für den Phase-1-Endzustand (TDD rot → grün)

**Ziel:** Die Phase-1-Invarianten (BuildKit-`# syntax`, Cache-Mounts, kein `--no-cache`, `build-push-action` + `type=gha`-Cache) ZUERST als ausführbare BATS-Assertions festschreiben. Sie schlagen vor der Implementierung fehl (rot) und werden durch P1-T1…T5 grün. Jede Assertion prüft nur den **Phase-1-Endzustand** (damit der Phase-1-PR eigenständig grün mergt).

**Files:**
- Create: `tests/spec/docker-build-speedup.bats` (neue Datei; Vorlage `tests/spec/software-factory.bats`)

**Konkrete Schritte:**

- [x] **Step 1 — Test-Datei mit Phase-1-Block anlegen:** `tests/spec/docker-build-speedup.bats` mit Shebang/Header (Konvention: eine `.bats`-Datei pro SSOT-Spec) und diesen echten Assertions erstellen:
  ```bash
  #!/usr/bin/env bats
  # tests/spec/docker-build-speedup.bats
  # SSOT: openspec/changes/docker-build-speedup/specs/docker-build-speedup.md
  # Invarianten der Docker-Build-Beschleunigung (T001229), je Phase ein Block.

  # ── Phase 1: Layer-Caching ──────────────────────────────────────────────────
  @test "P1: website Dockerfile hat # syntax + npm-Cache-Mount" {
    head -1 website/Dockerfile | grep -q 'syntax=docker/dockerfile:1'
    grep -q 'mount=type=cache,target=/root/.npm npm ci' website/Dockerfile
  }

  @test "P1: kein --no-cache in den umgestellten Build-Workflows" {
    ! grep -rq -- '--no-cache' .github/workflows/build-website.yml
    ! grep -rq -- '--no-cache' .github/workflows/build-videovault.yml
  }

  @test "P1: website-Workflow nutzt build-push-action + gha-Cache (mode=max)" {
    grep -q 'docker/build-push-action' .github/workflows/build-website.yml
    grep -q 'cache-to: type=gha,mode=max' .github/workflows/build-website.yml
  }

  @test "P1: videovault-Workflow nutzt gha-Cache (mode=max)" {
    grep -q 'cache-to: type=gha,mode=max' .github/workflows/build-videovault.yml
  }

  @test "P1: transcriber pip-Layer hat Cache-Mount und kein --no-cache-dir" {
    grep -q 'mount=type=cache,target=/root/.cache/pip' k3d/talk-transcriber/Dockerfile
    ! grep -q 'no-cache-dir' k3d/talk-transcriber/Dockerfile
  }

  @test "P1: mentolder-web Dockerfile hat pnpm-Store-Cache-Mount" {
    grep -q 'mount=type=cache,target=/root/.local/share/pnpm/store' mentolder-web/Dockerfile
  }
  ```

- [x] **Step 2 — Test ausführen, Expected: FAIL (rot):** weil die Dockerfiles/Workflows noch unverändert sind, müssen die Assertions fehlschlagen.
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/docker-build-speedup.bats
  ```
  Expected: FAIL (rot) — mehrere `not ok` (z.B. „website Dockerfile hat # syntax …" schlägt fehl, weil die Direktive/der Cache-Mount noch fehlt).

**Acceptance-Kriterien:**
- `tests/spec/docker-build-speedup.bats` existiert mit dem Phase-1-`@test`-Block.
- Der Lauf ist **rot** (mindestens die P1-Assertions schlagen fehl) — der dokumentierte Ausgangspunkt für rot→grün.

---

### Task P1-T1: BuildKit-Cache-Mounts in die Dependency-Dockerfiles

**Ziel:** Auf jedem Dependency-Install-Layer einen BuildKit-Cache-Mount setzen, damit `npm`/`pnpm`/`pip`-Downloads zwischen Builds wiederverwendet werden; `# syntax`-Direktive aktiviert die Mount-Syntax.

**Files:**
- Modify: `website/Dockerfile` (Zeile 1 + Zeile 7)
- Modify: `brett/Dockerfile` (Zeile 1 + Zeilen 5 & 15)
- Modify: `VideoVault/Dockerfile` (Zeile 1 + Zeilen 25 & 50)
- Modify: `mediaviewer-widget/Dockerfile` (Zeile 1 + Zeile 8)
- Modify: `mentolder-web/Dockerfile` (Zeile 1 + Zeile 21 — **pnpm**, nicht npm)
- Modify: `k3d/talk-transcriber/Dockerfile` (Zeile 1 + Zeilen 10–15 — **pip**, `--no-cache-dir` raus)
- **Kein Edit:** `docker/collabora/Dockerfile` (nur `setcap`, kein Dependency-Layer → nichts zu cachen; Cache-Config lebt im Workflow), `scripts/docs.Dockerfile` (nur `COPY` von vorgebautem HTML; der Node-Build läuft am Runner).

**Konkrete Schritte:**

- [x] **Step 1 — `website/Dockerfile`:** Neue erste Zeile `# syntax=docker/dockerfile:1` einfügen. `RUN npm ci` (jetzt Zeile 7) ersetzen durch:
  ```dockerfile
  RUN --mount=type=cache,target=/root/.npm npm ci
  ```

- [x] **Step 2 — `brett/Dockerfile`:** Erste Zeile `# syntax=docker/dockerfile:1`. Build-Stage `RUN npm ci` →
  ```dockerfile
  RUN --mount=type=cache,target=/root/.npm npm ci
  ```
  Runtime-Stage `RUN npm ci --omit=dev` →
  ```dockerfile
  RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
  ```

- [x] **Step 3 — `VideoVault/Dockerfile`:** Erste Zeile `# syntax=docker/dockerfile:1`. Build-Stage `RUN npm install -g npm@11 && npm install --legacy-peer-deps` →
  ```dockerfile
  RUN --mount=type=cache,target=/root/.npm npm install -g npm@11 && npm install --legacy-peer-deps
  ```
  Runtime-Stage `RUN npm install -g npm@11 && npm install --legacy-peer-deps --omit=dev` →
  ```dockerfile
  RUN --mount=type=cache,target=/root/.npm npm install -g npm@11 && npm install --legacy-peer-deps --omit=dev
  ```

- [x] **Step 4 — `mediaviewer-widget/Dockerfile`:** Erste Zeile `# syntax=docker/dockerfile:1`. `RUN npm install --legacy-peer-deps` →
  ```dockerfile
  RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps
  ```

- [x] **Step 5 — `mentolder-web/Dockerfile` (pnpm-Sonderfall):** Erste Zeile `# syntax=docker/dockerfile:1`. Die kombinierte Zeile `RUN pnpm install --frozen-lockfile && pnpm run build` ersetzen durch:
  ```dockerfile
  RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile && pnpm run build
  ```
  > **Hinweis:** pnpm nutzt den content-addressable Store unter `$HOME/.local/share/pnpm/store` (Build läuft als root → `/root/...`). Der Mount cached nur die Install-Hälfte der Zeile — das genügt (der `pnpm run build`-Teil ist Source-abhängig).

- [x] **Step 6 — `k3d/talk-transcriber/Dockerfile` (pip):** Erste Zeile `# syntax=docker/dockerfile:1`. Den `pip install`-Block (Zeilen 10–15) so ändern, dass `--no-cache-dir` **entfällt** und ein pip-Cache-Mount greift:
  ```dockerfile
  RUN --mount=type=cache,target=/root/.cache/pip pip install \
          fastapi \
          "uvicorn[standard]" \
          httpx \
          playwright \
          psycopg2-binary
  ```
  > `playwright install firefox --with-deps` (Folge-Zeile) bleibt unverändert (Firefox-Download ist kein pip-Layer; Caching dafür ist out-of-scope dieses Plans).

**Acceptance-Kriterien:**
- Jedes der 6 Dockerfiles hat `# syntax=docker/dockerfile:1` als **physisch erste Zeile** (`head -1 <file>` == die Direktive).
- Jeder Dependency-Install-`RUN` trägt einen passenden `--mount=type=cache` (npm→`/root/.npm`, pnpm→`/root/.local/share/pnpm/store`, pip→`/root/.cache/pip`).
- `k3d/talk-transcriber/Dockerfile` enthält kein `--no-cache-dir` mehr (`grep -c no-cache-dir` == 0).
- `docker/collabora/Dockerfile` + `scripts/docs.Dockerfile` sind **unverändert**.
- Lokaler Sanity-Build mindestens eines leichten Images mit BuildKit baut grün: `DOCKER_BUILDKIT=1 docker build -f brett/Dockerfile brett -t brett:cachetest` (Exit 0).

---

### Task P1-T2: „Nackte `docker build`"-Workflows auf build-push-action + GHA-Cache umstellen

**Ziel:** Die 7 Workflows, die heute `docker build … && docker push` per Shell ausführen, auf `docker/setup-buildx-action` + `docker/build-push-action@v6` mit `cache-from/cache-to: type=gha` umstellen; `--no-cache` ersatzlos entfernen. Interface-Kontrakt strikt wahren.

**Files (alle Modify):**
- `.github/workflows/build-website.yml` (schwer → `mode=max`)
- `.github/workflows/build-website-korczewski.yml` (schwer → `mode=max`; wird in Phase 2 gelöscht, profitiert aber sofort)
- `.github/workflows/build-videovault.yml` (schwer → `mode=max`)
- `.github/workflows/build-brett.yml` (leicht → `mode=min`)
- `.github/workflows/build-mediaviewer-widget.yml` (leicht → `mode=min`)
- `.github/workflows/build-mentolder-web.yml` (leicht → `mode=min`)
- `.github/workflows/build-docs.yml` (leicht → `mode=min`)

**Interfaces (Consumes/Produces — unverändert lassen):**
- Deploy-Steps lesen weiter `${{ env.IMAGE }}` / `${{ env.SHA_TAG }}` (website, videovault) bzw. `${{ steps.version.outputs.sha }}` (brett, mediaviewer, mentolder-web, docs). Diese Outputs MÜSSEN nach der Umstellung identisch produziert werden.

**Umstell-Muster (für jeden Workflow gleich):**

1. Nach dem GHCR-Login einen Step `docker/setup-buildx-action` einfügen (gepinnter SHA wie in transcriber/collabora: `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f  # v3`).
2. Den Shell-`docker build … && docker push`-Step in **zwei** Steps splitten:
   - (a) Ein kleiner Shell-Step „Compute image + tags", der `IMAGE` und `SHA_TAG` exakt wie bisher berechnet und nach `$GITHUB_ENV` schreibt (für die website/videovault-Outputs) — bzw. bei brett/mediaviewer/mentolder-web/docs bleibt der bestehende `steps.version`-Step die SHA-Quelle.
   - (b) `docker/build-push-action@v6` (gepinnt `10e90e3645eae34f1e60eeb005ba3a3d33f178e8  # v6`) mit `context`, `file`, `push: true`, denselben `build-args`, beiden `tags` und `cache-from`/`cache-to`.
3. `--no-cache` entfällt vollständig.

**Konkrete Schritte:**

- [x] **Step 1 — `build-website.yml`:** `setup-buildx` nach dem GHCR-Login einfügen. Den „Build & push Docker image"-Step so umbauen, dass ein vorgelagerter Shell-Step setzt:
  ```bash
  IMAGE="ghcr.io/paddione/mentolder-website"
  SHA_TAG="sha-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
  echo "IMAGE=${IMAGE}" >> "$GITHUB_ENV"
  echo "SHA_TAG=${SHA_TAG}" >> "$GITHUB_ENV"
  ```
  und ein `build-push-action`-Step folgt:
  ```yaml
  - name: Build & push Docker image
    uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8  # v6
    with:
      context: .
      file: website/Dockerfile
      push: true
      tags: |
        ${{ env.IMAGE }}:${{ env.SHA_TAG }}
        ${{ env.IMAGE }}:latest
      build-args: |
        PROD_DOMAIN=${{ env.PROD_DOMAIN }}
        BRAND_NAME=${{ env.BRAND_NAME }}
        CONTACT_EMAIL=${{ env.CONTACT_EMAIL }}
        CONTACT_PHONE=${{ env.CONTACT_PHONE }}
        CONTACT_CITY=${{ env.CONTACT_CITY }}
        CONTACT_NAME=${{ env.CONTACT_NAME }}
        LEGAL_STREET=${{ env.LEGAL_STREET }}
        LEGAL_ZIP=${{ env.LEGAL_ZIP }}
        LEGAL_JOBTITLE=${{ env.LEGAL_JOBTITLE }}
        LEGAL_UST_ID=${{ env.LEGAL_UST_ID }}
        LEGAL_WEBSITE=${{ env.LEGAL_WEBSITE }}
      cache-from: type=gha
      cache-to: type=gha,mode=max
  ```
  > Die `--build-arg`s bleiben **verbatim** erhalten (Interface-Kontrakt), obwohl der `website/Dockerfile` sie als No-Ops ignoriert — Phase 1 ändert keine Build-Semantik. (Phase 2b räumt sie auf.) Die `env:`-Werte des Steps unverändert lassen.

- [x] **Step 2 — `build-website-korczewski.yml`:** Identisches Muster wie Step 1; `IMAGE="ghcr.io/paddione/korczewski-website"`, korczewski-`build-args` verbatim, `cache-to: type=gha,mode=max`.

- [x] **Step 3 — `build-videovault.yml`:** `setup-buildx` nach Login. Build-Step → `build-push-action` mit `context: .`, `file: VideoVault/Dockerfile`, keine `build-args`, `tags` = `${IMAGE}:${SHA_TAG}` + `:latest`, `cache-to: type=gha,mode=max`. Vorgelagerter Shell-Step setzt `IMAGE`/`SHA_TAG` in `$GITHUB_ENV` exakt wie bisher (`IMAGE="ghcr.io/paddione/videovault"`). `--no-cache` raus.

- [x] **Step 4 — `build-brett.yml`:** `setup-buildx` nach Login. Build-Step → `build-push-action` mit `context: brett`, `file: brett/Dockerfile`, `tags` = `${IMAGE}:sha-${{ steps.version.outputs.sha }}` + `:latest` (`IMAGE="ghcr.io/paddione/workspace-brett"`), `cache-to: type=gha,mode=min`. `steps.version`-Step bleibt SHA-Quelle.

- [x] **Step 5 — `build-mediaviewer-widget.yml`:** `setup-buildx` nach Login. Build-Step → `build-push-action` mit `context: .`, `file: mediaviewer-widget/Dockerfile`, **`build-args` mit dem bestehenden `VITE_ALLOWED_PARENT_ORIGINS`-Wert verbatim übernehmen** (nicht im Plan reproduzieren — 1:1 aus dem aktuellen `--build-arg` kopieren), `tags` = `:sha-${{ steps.version.outputs.sha }}` + `:latest` (`IMAGE="ghcr.io/paddione/mediaviewer-widget"`), `cache-to: type=gha,mode=min`.

- [x] **Step 6 — `build-mentolder-web.yml`:** `setup-buildx` nach Login. Build-Step → `build-push-action` mit `context: .`, `file: mentolder-web/Dockerfile`, **`build-args` `VITE_FORMSPREE_ENDPOINT` + `VITE_WEBSITE_ORIGIN` verbatim** aus dem bestehenden Step übernehmen, `tags` = `:${{ steps.version.outputs.sha }}` + `:latest` (`IMAGE="ghcr.io/paddione/mentolder-web"`), `cache-to: type=gha,mode=min`. (pnpm-`setup`-Steps unverändert.)

- [x] **Step 7 — `build-docs.yml`:** `setup-buildx` nach Login. Build-Step → `build-push-action` mit `context: .`, `file: scripts/docs.Dockerfile`, keine `build-args`, `tags` = `:sha-${{ steps.version.outputs.sha }}` + `:latest` (`IMAGE="ghcr.io/paddione/workspace-docs"`), `cache-to: type=gha,mode=min`. Die vorgelagerten Runner-Steps (`npm install`, `task freshness:regenerate`, `node scripts/build-docs.mjs`) **unverändert** lassen — der vorgebaute Output ist Build-Input.

**Acceptance-Kriterien:**
- Kein Workflow enthält mehr `docker build` als Shell-Kommando (`grep -rl "docker build" .github/workflows/build-{website,website-korczewski,videovault,brett,mediaviewer-widget,mentolder-web,docs}.yml` == leer).
- Kein `--no-cache` mehr in den 7 Workflows.
- Jeder hat genau einen `docker/build-push-action@…  # v6`-Step mit `cache-from: type=gha` + `cache-to: type=gha,mode={max|min}` gemäß Gewichtstabelle.
- Image-Namen, beide Tags, alle `build-args`-Schlüssel und die Deploy-/Secret-Check-/Rollout-Steps sind unverändert (Diff zeigt nur Build-Mechanik).
- `IMAGE`/`SHA_TAG` werden weiter nach `$GITHUB_ENV` geschrieben (website, videovault); die Deploy-Steps referenzieren dieselben Variablen.
- Workflow-Syntax valide: `task test:all` (enthält Workflow-/Kustomize-Strukturprüfungen) bzw. lokal `yamllint` falls verfügbar.

---

### Task P1-T3: GHA-Cache in die bereits-buildx-Workflows ergänzen

**Ziel:** transcriber + collabora nutzen schon `setup-buildx` + `build-push-action`, aber ohne Cache-Konfig. `cache-from`/`cache-to: type=gha` ergänzen. (Plattform-/arm64-Drop ist Phase 3, hier NICHT anfassen.)

**Files (Modify):**
- `.github/workflows/build-transcriber.yml` (schwer → `mode=max`)
- `.github/workflows/build-collabora.yml` (leicht → `mode=min`)

**Konkrete Schritte:**

- [x] **Step 1 — `build-transcriber.yml`:** Im `docker/build-push-action@…`-Step ergänzen:
  ```yaml
      cache-from: type=gha
      cache-to: type=gha,mode=max
  ```
  `platforms: linux/amd64,linux/arm64` **unverändert** lassen (Phase 3).

- [x] **Step 2 — `build-collabora.yml`:** Im `build-push-action`-Step ergänzen:
  ```yaml
      cache-from: type=gha
      cache-to: type=gha,mode=min
  ```
  `platforms` unverändert (Phase 3).

**Acceptance-Kriterien:**
- Beide Workflows haben `cache-from: type=gha` + `cache-to: type=gha,mode={max|min}`.
- `platforms:`-Zeilen unverändert (Diff berührt nur die 2 Cache-Zeilen je Workflow).

---

### Task P1-T4: `setup-node`-Cache-Audit (verifizieren, NICHT blind löschen)

**Ziel:** Das Design vermutete totes `setup-node` `cache:'npm'`. Pro Workflow verifizieren, ob der Runner npm/pnpm tatsächlich nutzt — und nur dann entfernen, wenn nachweislich tot.

**Files:** keine Code-Änderung erwartet (Audit-Task; Befund im PR-Text festhalten).

**Befund aus der Plan-Recherche (bereits verifiziert — beim Ausführen gegenprüfen):**

| Workflow | Runner-seitige npm/pnpm-Nutzung | Cache live? | Aktion |
|----------|----------------------------------|-------------|--------|
| `build-website.yml` | `task freshness:regenerate` → `[ -d node_modules ] || npm ci` (Taskfile.yml:896) → Root-`npm ci` läuft bei frischem Checkout | **ja** | **KEEP** `cache:'npm'` |
| `build-website-korczewski.yml` | dito | **ja** | **KEEP** |
| `build-brett.yml` | `npm ci --prefix brett` (Test-Gate) | **ja** | **KEEP** (`cache-dependency-path: brett/package-lock.json`) |
| `build-videovault.yml` | `npm install` (Test-Gate) | **ja** | **KEEP** |
| `build-mediaviewer-widget.yml` | `npm ci` (Test-Gate) | **ja** | **KEEP** |
| `build-mentolder-web.yml` | `pnpm install --frozen-lockfile` (Typecheck) | **ja** | **KEEP** (`cache:'pnpm'`) |
| `build-docs.yml` | `npm install` + freshness | npm genutzt, aber `setup-node` hat **kein** `cache:` | KEINE Änderung |

> **Schlussfolgerung:** In KEINEM Workflow ist der `setup-node`-Cache tot — jeder führt npm/pnpm am Runner aus (Test-Gate oder `freshness:regenerate`s bedingtes `npm ci`). Die Design-Annahme „toter Ballast" trifft nach Per-Workflow-Prüfung **nicht** zu (genau der vom Design verlangte „prüfen, nicht blind löschen"-Check). **Es wird kein Cache-Key entfernt.** Der GHA-BuildKit-Layer-Cache (`type=gha`, P1-T2/T3) und der Runner-npm-Download-Cache (`setup-node`) sind zwei unabhängige Caches und koexistieren.

**Konkrete Schritte:**

- [x] **Step 1:** Gegenprüfen: `grep -n "freshness:regenerate:" -A8 Taskfile.yml` zeigt `[ -d node_modules ] || npm ci`. Für jeden Workflow den Runner-npm/pnpm-Aufruf bestätigen (Tabelle oben).
- [x] **Step 2:** Befund in die PR-Beschreibung übernehmen („setup-node-Cache überall live → keine Entfernung").

**Acceptance-Kriterien:**
- Kein `cache:`-Key wurde aus einem `setup-node`/`setup-pnpm`-Step entfernt.
- Der Audit-Befund ist im PR dokumentiert.

---

### Task P1-T5: Phase-1-Verifikation + Build-Zeit-Messprozedur

**Ziel:** Phase-1-PR grün bekommen und die Mess-Methodik für die Ziel-Metrik (Build-Zeit vorher/nachher) festschreiben.

**Files:** keine.

**Konkrete Schritte:**

- [x] **Step 1:** Lokaler BuildKit-Build je geänderter Dockerfile-Familie als Smoke (Exit 0), z.B.:
  ```bash
  DOCKER_BUILDKIT=1 docker build -f website/Dockerfile . -t website:p1
  DOCKER_BUILDKIT=1 docker build -f brett/Dockerfile brett -t brett:p1
  ```
- [x] **Step 2 — P1-BATS grün:** der in P1-T0 rote Block ist nach P1-T1…T4 grün:
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/docker-build-speedup.bats
  ```
  Erwartung: alle P1-`@test` `ok`.
- [x] **Step 3:** CI-Gates (siehe finaler VERIFY-Task) ausführen: `task test:changed`, `task freshness:regenerate`, `task freshness:check` — alle Exit 0.
- [x] **Step 4:** **Vorher-Werte** der GHA-Run-Durations der betroffenen Workflows aus den letzten `main`-Runs notieren (Tabelle aus der Spec als Baseline: transcriber ~8 min, videovault ~4–6 min, website ~3–5 min ×2).
- [ ] **Step 5:** Nach Merge (erster `main`-Push, der die jeweiligen `paths` triggert): die neuen Run-Durations notieren. Der **zweite** Cache-Hit-Run (nur Source-Änderung) ist der aussagekräftige Wert (erster Run nach Merge baut den Cache erst auf). Vorher/Nachher in den PR-/Ticket-Kommentar schreiben.

**Acceptance-Kriterien:**
- `task test:changed` + `task freshness:check` Exit 0.
- Vorher/Nachher-Build-Zeiten dokumentiert (Beleg der Ziel-Metrik; kein neuer CI-Gate).

---

## PHASE 2 — Website abspecken + 2→1 konsolidieren (PR #2)

### Task P2-T0: Failing-Test-Block für den Phase-2-Endzustand (TDD rot → grün)

**Ziel:** Die Phase-2-Invarianten (devDeps-Prune, geteiltes Image, gelöschter korczewski-Workflow, repointete `environments`) als BATS-Assertions an die in Phase 1 angelegte Datei anhängen. Sie sind vor der Phase-2-Implementierung rot und werden durch P2-T1…T5 grün. Nur Phase-2-Endzustand prüfen (Phase-1-Assertions sind bereits auf `main` grün).

**Files:**
- Modify: `tests/spec/docker-build-speedup.bats` (Phase-2-Block anhängen)

**Konkrete Schritte:**

- [x] **Step 1 — Phase-2-Block anhängen:** Folgende echte Assertions ans Dateiende ergänzen:
  ```bash
  # ── Phase 2: Website slim + Konsolidierung ─────────────────────────────────
  @test "P2: website Dockerfile pruned devDependencies" {
    grep -q 'npm prune --omit=dev' website/Dockerfile
  }

  @test "P2: website-Build-Workflow pusht das geteilte Image" {
    grep -q 'ghcr.io/paddione/website' .github/workflows/build-website.yml
  }

  @test "P2: korczewski-Website-Workflow ist entfernt" {
    [ ! -f .github/workflows/build-website-korczewski.yml ]
  }

  @test "P2: alle prod/dev env-Dateien zeigen WEBSITE_IMAGE auf den geteilten Namen" {
    for f in mentolder korczewski fleet-mentolder fleet-korczewski staging dev; do
      grep -qE '^\s*WEBSITE_IMAGE:\s*website\s*$' "environments/$f.yaml"
    done
  }

  @test "P2: kein per-Brand-Website-Image-Name mehr in Workflows/Manifesten" {
    ! grep -rqE 'paddione/(mentolder|korczewski)-website' \
        .github/workflows environments
  }
  ```

- [x] **Step 2 — Test ausführen, Expected: FAIL (rot):** die neuen P2-Assertions schlagen fehl (Prune fehlt, Image noch `mentolder-website`, korczewski-Workflow existiert noch).
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/docker-build-speedup.bats --filter 'P2:'
  ```
  Expected: FAIL (rot) — die `P2:`-`@test` sind `not ok`.

**Acceptance-Kriterien:**
- Der Phase-2-`@test`-Block ist angehängt.
- Lauf gefiltert auf `P2:` ist **rot** — Ausgangspunkt für rot→grün.

---

### Task P2-T1: (2a) `npm prune --omit=dev` im Build-Stage

**Ziel:** Das Runtime-Image schrumpfen, indem nach `npm run build` die devDependencies aus `node_modules` entfernt werden; das geprunte Verzeichnis wird unverändert in den Runtime-Stage kopiert.

**Files:**
- Modify: `website/Dockerfile` (Build-Stage, nach Zeile 15 `RUN npm run build`)

**Konkrete Schritte:**

- [x] **Step 1:** Direkt nach `RUN npm run build` (Build-Stage) einfügen:
  ```dockerfile
  # Prune devDependencies so the runtime stage copies only prod node_modules
  # (~1.2 GB → ~600 MB). Chromium/kubectl/tests/ bleiben bewusst im Runtime-Image.
  RUN npm prune --omit=dev
  ```
- [x] **Step 2:** Bestätigen, dass `COPY --from=build /app/node_modules ./node_modules` (Runtime-Stage, jetzt verschoben um 1 Zeile) **unverändert** bleibt — es kopiert jetzt das geprunte Verzeichnis.

**Acceptance-Kriterien:**
- `website/Dockerfile` enthält `RUN npm prune --omit=dev` zwischen `npm run build` und dem Runtime-Stage.
- Der `COPY --from=build /app/node_modules`-Befehl ist unverändert.
- (Bildgröße wird in P2-T2 belegt.)

---

### Task P2-T2: (2a-Guardrail, HART) Boot + Smoke-Test des Runtime-Images

**Ziel:** Sicherstellen, dass `--omit=dev` kein runtime-nötiges Paket entfernt hat. Schlägt der Boot fehl, wird das fehlende Paket nach `dependencies` gezogen — der Prune wird **nicht** zurückgenommen.

**Files:**
- Modify (nur im Fehlerfall): `website/package.json` (Paket `devDependencies` → `dependencies`)

**Konkrete Schritte:**

- [x] **Step 1 — Image lokal bauen:**
  ```bash
  DOCKER_BUILDKIT=1 docker build -f website/Dockerfile . -t website:slim
  ```
- [x] **Step 2 — Größe prüfen (Beleg der Ziel-Metrik ~600 MB):**
  ```bash
  docker image inspect website:slim --format '{{.Size}}' | awk '{printf "%.0f MB\n",$1/1024/1024}'
  ```
- [x] **Step 3 — Booten + Smoke HTTP 200 auf `/`:**
  ```bash
  docker run -d --name website-smoke -p 4321:4321 website:slim
  sleep 5
  curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:4321/   # erwartet: 200
  docker logs website-smoke | tail -30
  docker rm -f website-smoke
  ```
- [x] **Step 4 — Fehlerbehandlung (nur falls Boot/Smoke fehlschlägt):** Aus `docker logs` das fehlende Modul ablesen (z.B. `Cannot find module 'X'`). Das zugehörige Paket in `website/package.json` von `devDependencies` nach `dependencies` verschieben (genau diese eine Zeile umhängen, netto zeilenneutral). `package-lock.json` ggf. via `npm install --package-lock-only` im `website/`-Verzeichnis aktualisieren. Dann ab Step 1 wiederholen. **Den Prune NICHT entfernen.**

**Acceptance-Kriterien:**
- `website:slim` bootet und liefert HTTP 200 auf `/`.
- `docker image inspect`-Größe deutlich unter dem Alt-Wert (Ziel ~600 MB; mind. <800 MB).
- Falls Pakete umgehängt wurden: in `package.json` korrekt unter `dependencies`, `package-lock.json` konsistent, Re-Build grün.

---

### Task P2-T3: (2b-Guardrail, HART, ZUERST) `import.meta.env`-Brand-Read-Grep

**Ziel:** Vor jeder Konsolidierung beweisen, dass die zwei Brand-Images byte-identisch sind, weil keine brand-differenzierende Konstante zur **Build-Zeit** in das Bundle gebacken wird. Findet der Grep eine solche Konstante, wird 2b zurückgestellt (2a + Phase 1 bleiben wirksam).

**Files:** keine Code-Änderung (reiner Beweis-Task).

**Befund aus der Plan-Recherche (beim Ausführen reproduzieren):**
- `grep -rnE "import\.meta\.env\.(PROD_DOMAIN|BRAND_NAME|BRAND_ID|CONTACT_|LEGAL_)" website/src` → **0 Treffer**.
- Die einzigen `import.meta.env.BRAND`-Reads (9 Dateien) haben **immer** die Form `import.meta.env.BRAND || process.env.BRAND || 'mentolder'`.
- **Kein** Build-Step (`build-website.yml` / `build-website-korczewski.yml`, „Build & push"-`env:`-Block) setzt `BRAND`/`BRAND_ID` als Build-Env. → `import.meta.env.BRAND` wird zur Build-Zeit zu `undefined` ersetzt → fällt zur Runtime auf `process.env.BRAND` (ConfigMap im Deploy-Step) zurück → **beide Images byte-identisch** → Konsolidierung sicher.
- Die im Build-Step gesetzten `PROD_DOMAIN/BRAND_NAME/LEGAL_*`-Werte werden **nirgends** via `import.meta.env` konsumiert (No-Ops) → keine Build-Zeit-Differenz.

**Konkrete Schritte:**

- [x] **Step 1:** Ausführen:
  ```bash
  grep -rnE "import\.meta\.env\.(PROD_DOMAIN|BRAND_NAME|BRAND_ID|CONTACT_|LEGAL_)" website/src || echo "OK: keine Build-Zeit-Brand-Konstante"
  grep -rnE "import\.meta\.env\.BRAND\b" website/src
  ```
- [x] **Step 2:** Bestätigen, dass weder `build-website.yml` noch `build-website-korczewski.yml` `BRAND`/`BRAND_ID` im **Build**-Step-`env:` setzen:
  ```bash
  awk '/Build & push Docker image/,/run:/' .github/workflows/build-website*.yml | grep -nE "BRAND_ID:|BRAND:" || echo "OK: kein Brand-Build-Env"
  ```
- [x] **Step 3 — Entscheidungs-Gate:** Liefert Step 1 Treffer einer **build-time-gesetzten** brand-differenzierenden Konstante → **STOP 2b** (P2-T4 überspringen, 2a + Phase 1 bleiben). Sonst → P2-T4 fortsetzen.

**Acceptance-Kriterien:**
- Beweis dokumentiert (Grep-Output im PR), dass keine brand-differenzierende Build-Zeit-Konstante existiert.
- Explizites Go/No-Go für P2-T4.

---

### Task P2-T4: (2b) Geteiltes Image + Konsolidierung 2→1

**Ziel:** Beide Brands ziehen EIN geteiltes Image. Ein Build → ein Push → zwei Deploy-Steps. Der zweite, byte-identische Build entfällt (Build-Last halbiert).

**Entscheidung & Begründung (im Plan festgelegt):**
- **Geteilter Image-Name: `ghcr.io/paddione/website` (`WEBSITE_IMAGE=website`).** Begründung: Das Image ist nachweislich brand-neutral (P2-T3); ein neutraler Name vermeidet die semantische Schieflage „korczewski zieht ein `mentolder-website`-Image". Erstpush erzeugt das GHCR-Package automatisch (`packages: write` ist gesetzt). Die alten Packages `mentolder-website`/`korczewski-website` veralten harmlos (Aufräumen ist out-of-scope).
- **Konsolidierungs-Form: EIN Workflow baut, zwei Deploy-Steps deployen** (statt „korczewski deploy-only"). Begründung: Beide Workflows leiten `SHA_TAG` aus `date +…` + `git rev-parse` ab — ein separater korczewski-Workflow könnte denselben Tag nicht deterministisch rekonstruieren (Timestamp-Drift), und Cross-Workflow-SHA-Handoff via Artefakt wäre fragiler als ein Workflow mit zwei Deploy-Steps. `build-website-korczewski.yml` wird **gelöscht** (sonst baut es auf demselben `website/**`-Trigger erneut → Zweck verfehlt).

**Files:**
- Modify: `.github/workflows/build-website.yml` (Build-Step Image-Name; korczewski-Deploy-Step + Secret-Check + Rollout anfügen)
- Delete: `.github/workflows/build-website-korczewski.yml`
- Modify: `environments/mentolder.yaml`, `environments/korczewski.yaml`, `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`, `environments/staging.yaml`, `environments/dev.yaml` (`WEBSITE_IMAGE: … → website`)
- **Kein Edit (nur Verifikation):** `k3d/website.yaml` (nutzt bereits `image: ghcr.io/paddione/${WEBSITE_IMAGE}:latest` — templated, kein hartkodierter Name), `prod-fleet/website-mentolder/`, `prod-fleet/website-korczewski/` (referenzieren `k3d/website.yaml`, kein hartkodiertes Image), `Taskfile.yml:website:build` (nutzt `ghcr.io/paddione/${WEBSITE_IMAGE:-…}` → folgt automatisch).

**Konkrete Schritte:**

- [x] **Step 1 — Build-Step in `build-website.yml` repointen:** Im „Compute image + tags"-Shell-Step `IMAGE="ghcr.io/paddione/mentolder-website"` → `IMAGE="ghcr.io/paddione/website"`. Die jetzt obsoleten `LEGAL_*`/`CONTACT_*`/`BRAND_NAME`/`PROD_DOMAIN`-`--build-arg`s **dürfen** entfernt werden (sie sind No-Ops; Entfernung ist Teil von 2b/Cleanup) — alternativ verbatim belassen. Empfehlung: entfernen, da der `website/Dockerfile` keine `ARG`-Zeile hat (kein Funktionsverlust). Den `env:`-Block des Build-Steps entsprechend ausdünnen (nur noch das, was der Build wirklich liest — faktisch nichts Brand-spezifisches).
- [x] **Step 2 — korczewski-Deploy in `build-website.yml` anfügen:** Den kompletten „Deploy to korczewski"-Step (env-Block inkl. `BRAND_ID: korczewski`, korczewski-Secrets `KORCZEWSKI_*`, `WEBSITE_IMAGE: website`, `WEBSITE_NAMESPACE: website-korczewski`, `WORKSPACE_NAMESPACE: workspace-korczewski`, korczewski-LLM-URLs, Overlay `prod-fleet/website-korczewski`, `kubectl set image … -n website-korczewski`), den „Pre-Rollout Secret-Check" (`NAMESPACE: website-korczewski`) und „Wait for rollout" (`NAMESPACE: website-korczewski`) **1:1 aus `build-website-korczewski.yml` übernehmen** und hinter die mentolder-Deploy-/Check-/Rollout-Steps in `build-website.yml` einhängen. In beiden Deploy-Steps `WEBSITE_IMAGE` auf `website` setzen.
- [x] **Step 3 — `WEBSITE_IMAGE` im mentolder-Deploy-Step** von `mentolder-website` → `website`.
- [x] **Step 4 — `build-website-korczewski.yml` löschen:** `git rm .github/workflows/build-website-korczewski.yml`.
- [x] **Step 5 — `environments/*.yaml` repointen:** In allen 6 Dateien `WEBSITE_IMAGE: {mentolder,korczewski}-website` → `WEBSITE_IMAGE: website`.
  ```bash
  grep -rln "WEBSITE_IMAGE:" environments/   # mentolder, korczewski, fleet-*, staging, dev
  ```
- [x] **Step 6 — Verifikation kein Restvorkommen** (außer historischem Kommentar `k3s/korczewski-website-prod.yaml` + Design-Doc):
  ```bash
  grep -rnE "paddione/(mentolder|korczewski)-website|WEBSITE_IMAGE:\s*(mentolder|korczewski)-website" \
    --include="*.yml" --include="*.yaml" . | grep -v node_modules
  ```
  Erwartung: leer (bzw. nur der Kommentar in `k3s/korczewski-website-prod.yaml`).
- [x] **Step 7 — Kustomize-Validierung:** `task workspace:validate` und ein Render-Smoke beider Overlays:
  ```bash
  WEBSITE_IMAGE=website kustomize build prod-fleet/website-mentolder --load-restrictor=LoadRestrictionsNone >/dev/null
  WEBSITE_IMAGE=website kustomize build prod-fleet/website-korczewski --load-restrictor=LoadRestrictionsNone >/dev/null
  ```

**Acceptance-Kriterien:**
- `build-website.yml` hat **genau einen** Build-Step (Image `ghcr.io/paddione/website`) und **zwei** Deploy-/Secret-Check-/Rollout-Blöcke (mentolder + korczewski).
- `build-website-korczewski.yml` existiert nicht mehr.
- Alle `environments/*.yaml` setzen `WEBSITE_IMAGE: website`; Step-6-Grep ist leer (außer Kommentar).
- `k3d/website.yaml` + beide Overlays unverändert; Kustomize-Render grün.
- `task workspace:validate` Exit 0.

---

### Task P2-T5: Stale `website/CLAUDE.md` korrigieren

**Ziel:** Die Doku-Aussage „`LEGAL_*` werden zur Build-Zeit gebacken" ist falsch (Werte werden zur Runtime via `process.env` gelesen). Korrigieren.

**Files:**
- Modify: `website/CLAUDE.md:64`

**Konkrete Schritte:**

- [x] **Step 1:** Zeile 64 (`- **Build-time vs runtime values**: \`CONTACT_EMAIL\`, \`LEGAL_*\` etc. are baked at image build time; …`) so umformulieren, dass klargestellt ist: `CONTACT_*`/`LEGAL_*` werden zur **Runtime** über `process.env` (ConfigMap, envsubst im Deploy-Step) gelesen — der `website/Dockerfile` hat keine `ARG`-Zeile, die `--build-arg`-Aufrufe sind No-Ops. `footerCity`, Tagline, Copyright sind weiterhin per Admin zur Runtime überschreibbar. Netto zeilenneutral. **Keine** Brand-Domain-Literale einfügen.

**Acceptance-Kriterien:**
- `website/CLAUDE.md` enthält keine „baked at build time"-Aussage über `LEGAL_*`/`CONTACT_*` mehr.
- `.md` ist nicht S1-gated; Änderung ~1 Zeile.

---

### Task P2-T6: Rollout-Verifikation beider Brands (post-merge)

**Ziel:** Nach Merge belegen, dass beide Brands aus dem geteilten Image laufen.

**Files:** keine.

**Konkrete Schritte:**

- [x] **Step 0 — P2-BATS grün (vor Merge):** der in P2-T0 rote Block ist nach P2-T1…T5 grün:
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/docker-build-speedup.bats
  ```
  Erwartung: alle P1- + P2-`@test` `ok`.
- [ ] **Step 1:** Nach dem `main`-Run von `build-website.yml`: beide Rollouts grün (`Wait for rollout` für `website` ns + `website-korczewski` ns Exit 0 im Workflow-Log).
- [ ] **Step 2:** Bestätigen, dass beide Deployments auf `ghcr.io/paddione/website:<sha>` zeigen:
  ```bash
  kubectl --context fleet get deploy website -n website -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
  kubectl --context fleet get deploy website -n website-korczewski -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
  ```
- [ ] **Step 3:** HTTP-200-Smoke beider Brand-Homepages (über die jeweils per `PROD_DOMAIN` aufgelöste `web.`-Host-URL — keine Domain-Literale im Plan; aus `environments/*.yaml` ableiten).

**Acceptance-Kriterien:**
- Beide Deployments laufen auf demselben `:<sha>`-Tag des geteilten Images.
- Beide Homepages liefern HTTP 200.

---

## PHASE 3 — arm64 droppen (PR #3)

### Task P3-T0: Failing-Test-Block für den Phase-3-Endzustand (TDD rot → grün)

**Ziel:** Die Phase-3-Invariante (transcriber + collabora bauen `linux/amd64`-only, kein `setup-qemu-action`) als BATS-Assertions anhängen. Vor P3-T2 rot, danach grün. Nur Phase-3-Endzustand prüfen.

**Files:**
- Modify: `tests/spec/docker-build-speedup.bats` (Phase-3-Block anhängen)

**Konkrete Schritte:**

- [x] **Step 1 — Phase-3-Block anhängen:**
  ```bash
  # ── Phase 3: amd64-only ────────────────────────────────────────────────────
  @test "P3: transcriber baut amd64-only ohne QEMU" {
    grep -qE '^\s*platforms:\s*linux/amd64\s*$' .github/workflows/build-transcriber.yml
    ! grep -q 'linux/arm64' .github/workflows/build-transcriber.yml
    ! grep -q 'setup-qemu-action' .github/workflows/build-transcriber.yml
  }

  @test "P3: collabora baut amd64-only ohne QEMU" {
    grep -qE '^\s*platforms:\s*linux/amd64\s*$' .github/workflows/build-collabora.yml
    ! grep -q 'linux/arm64' .github/workflows/build-collabora.yml
    ! grep -q 'setup-qemu-action' .github/workflows/build-collabora.yml
  }
  ```

- [x] **Step 2 — Test ausführen, Expected: FAIL (rot):** die `P3:`-Assertions schlagen fehl, weil beide Workflows noch `linux/amd64,linux/arm64` + QEMU enthalten.
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/docker-build-speedup.bats --filter 'P3:'
  ```
  Expected: FAIL (rot) — die `P3:`-`@test` sind `not ok`.

**Acceptance-Kriterien:**
- Der Phase-3-`@test`-Block ist angehängt.
- Lauf gefiltert auf `P3:` ist **rot**.

---

### Task P3-T1: Pre-flight — Cluster ist amd64-only

**Ziel:** Vor dem Entfernen von arm64 beweisen, dass kein arm64-Node existiert.

**Files:** keine.

**Konkrete Schritte:**

- [x] **Step 1:**
  ```bash
  kubectl --context fleet get nodes -o wide
  kubectl --context fleet get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"="}{.status.nodeInfo.architecture}{"\n"}{end}'
  ```
  Erwartung: alle Nodes `amd64`.
- [x] **Step 2 — Gate:** Taucht ein `arm64`-Node auf → **STOP Phase 3** (arm64 wird gebraucht). Sonst fortsetzen.

**Acceptance-Kriterien:**
- Nachweis (Output) im PR, dass alle fleet-Nodes amd64 sind.

---

### Task P3-T2: arm64 + QEMU aus transcriber/collabora entfernen

**Ziel:** `platforms` auf `linux/amd64` reduzieren; den nun überflüssigen `setup-qemu-action`-Step entfernen (halbiert grob den transcriber-Build).

**Files (Modify):**
- `.github/workflows/build-transcriber.yml`
- `.github/workflows/build-collabora.yml`

**Konkrete Schritte:**

- [x] **Step 1 — `build-transcriber.yml`:** `platforms: linux/amd64,linux/arm64` → `platforms: linux/amd64`. Den Step „Set up QEMU" (`docker/setup-qemu-action`, mit `platforms: linux/arm64`) entfernen (nur noch amd64 = nativ, kein QEMU nötig). `setup-buildx` bleibt. Cache-Konfig aus P1-T3 bleibt.
- [x] **Step 2 — `build-collabora.yml`:** `platforms: linux/amd64,linux/arm64` → `platforms: linux/amd64`. „Set up QEMU"-Step entfernen. Kommentar „Needed so amd64 runners can build the arm64 variant too." mit-entfernen/anpassen.

**Acceptance-Kriterien:**
- Beide Workflows: `platforms: linux/amd64` (kein `arm64` mehr).
- Kein `setup-qemu-action`-Step mehr in beiden Workflows.
- `setup-buildx` + `cache-from/to` (aus P1-T3) bleiben erhalten.

---

### Task P3-T3: Phase-3-Verifikation

**Files:** keine.

**Konkrete Schritte:**

- [x] **Step 0 — P3-BATS grün:** der in P3-T0 rote Block ist nach P3-T2 grün:
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/docker-build-speedup.bats
  ```
  Erwartung: alle `@test` (P1+P2+P3) `ok`.
- [x] **Step 1:** Workflow-Syntax/Struktur grün (`task test:all` bzw. `yamllint` lokal).
- [ ] **Step 2:** Post-merge: transcriber-Run-Duration vorher (~8 min) / nachher dokumentieren (Beleg der Halbierung durch QEMU-Wegfall).
- [ ] **Step 3:** Bestätigen, dass die single-arch Images im Cluster ziehen (transcriber- + collabora-Pods `Running`).

**Acceptance-Kriterien:**
- Build-Zeit transcriber vorher/nachher dokumentiert.
- transcriber-/collabora-Pods laufen mit single-arch Image.

---

## SPEC: Spec-Delta füllen + OpenSpec validieren

### Task SPEC: `specs/docker-build-speedup.md` ausformulieren

**Ziel:** Das Spec-Delta mit den `## ADDED Requirements` (SHALL + GIVEN/WHEN/THEN-Szenarien) für Build-Pipeline-Effizienz füllen, damit `task test:openspec` grün ist.

**Files:**
- Modify: `openspec/changes/docker-build-speedup/specs/docker-build-speedup.md`

**Konkrete Schritte:**

- [x] **Step 1:** Die Platzhalter-Einträge durch die Requirements ersetzen (Layer-Caching vorhanden, kein `--no-cache`, schlankes Website-Image, ein geteiltes Website-Image, amd64-only Builds) — siehe die parallel committete `specs/docker-build-speedup.md`. Format: `## ADDED Requirements` → `### Requirement: …` (H3, SHALL) → `#### Scenario: …` (H4, GIVEN/WHEN/THEN).
- [x] **Step 2 — Validieren:**
  ```bash
  task test:openspec    # bzw. bash scripts/openspec.sh validate
  ```
  Erwartung: `openspec validate: OK`.

**Acceptance-Kriterien:**
- `specs/docker-build-speedup.md` enthält `## ADDED Requirements` + ≥1 `### Requirement:` (H3) + GIVEN/WHEN/THEN-Szenarien; keine `## Requirement:`-H2.
- `task test:openspec` Exit 0.

---

## VERIFY: Finaler CI-Gate-Verifikations-Task (pro Phase-PR)

### Task VERIFY: Quality-Gates + Evidenz

**Ziel:** Die Pflicht-CI-Äquivalente lokal grün fahren und die Ziel-Metrik belegen, bevor der jeweilige Phasen-PR auf Auto-Merge geht.

**Files:** keine (Verifikation).

**Konkrete Schritte:**

- [ ] **Step 1 — Gezielte Tests:**
  ```bash
  task test:changed
  ```
  Erwartung: Exit 0.
- [ ] **Step 2 — Freshness regenerieren + prüfen (S1–S4-Ratchet + Baseline-Assertion):**
  ```bash
  task freshness:regenerate
  task freshness:check
  ```
  Erwartung: Exit 0; `docs/code-quality/baseline.json`-Key-Anzahl unverändert (kein neuer Baseline-Eintrag).
- [ ] **Step 3 — OpenSpec-Gate:**
  ```bash
  task test:openspec
  ```
  Erwartung: Exit 0.
- [ ] **Step 4 — Manifest-Validierung (nur Phase 2/3, wo Workflows/Overlays/Envs berührt sind):**
  ```bash
  task workspace:validate
  ```
- [ ] **Step 5 — Website-Image Boot+Smoke (Phase 2):** P2-T2 erneut als Endbeleg (`docker run … && curl 200`).
- [ ] **Step 6 — Test-Inventar (PFLICHT):** Dieser Change legt die neue BATS-Datei `tests/spec/docker-build-speedup.bats` an (und erweitert sie pro Phase) → der CI-Inventory-Check vergleicht `website/src/data/test-inventory.json` gegen die committete Version. Daher in **jedem** Phasen-PR, der die `.bats` berührt:
  ```bash
  task test:inventory
  git add website/src/data/test-inventory.json
  ```
  und das aktualisierte Inventar mitcommitten (sonst failt CI).
- [ ] **Step 7 — Build-Zeit-Evidenz:** Vorher/Nachher-GHA-Run-Durations je betroffenem Image (aus den `main`-Runs) in PR/Ticket dokumentieren (Ziel: website/videovault/transcriber ~4–8 min → ~1–2 min bei Cache-Hit; Website-Image ~1,2 GB → ~600 MB; Website-Builds 2→1).
- [ ] **Step 8 — CI grün** auf dem PR; dann `gh pr merge <n> --squash --auto`.

**Acceptance-Kriterien:**
- `task test:changed`, `task freshness:check`, `task test:openspec` (und `task workspace:validate` für Phase 2/3) Exit 0.
- Baseline-Key-Anzahl unverändert.
- Build-Zeit-/Image-Größen-Evidenz dokumentiert.
- CI grün.

---

## Self-Review (Plan-Abdeckung gegen Spec)

- **Phase 1 (Caching):** P1-T1 (Dockerfile-Cache-Mounts inkl. pnpm/pip-Sonderfälle), P1-T2 (7 Workflows → build-push-action, `--no-cache` raus, Interface-Kontrakt), P1-T3 (transcriber/collabora Cache), P1-T4 (setup-node-Audit — Befund: nichts tot), P1-T5 (Verifikation + Messprozedur). ✓ mode=max nur schwere Images.
- **Phase 2a (Slim):** P2-T1 (`npm prune --omit=dev`), P2-T2 (Boot+Smoke-Guardrail, devDeps→deps). ✓ Chromium/kubectl/tests bleiben.
- **Phase 2b (Konsolidieren):** P2-T3 (Grep-Guardrail ZUERST), P2-T4 (geteiltes Image `ghcr.io/paddione/website`, 1 Build/2 Deploys, korczewski-Workflow gelöscht, `environments/*.yaml` repointed, Overlays/`website.yaml` als templated verifiziert), P2-T5 (CLAUDE.md-Korrektur), P2-T6 (Rollout-Verifikation). ✓
- **Phase 3 (arm64):** P3-T1 (Pre-flight `get nodes`), P3-T2 (platforms amd64 + QEMU raus), P3-T3 (Verifikation). ✓
- **Quality-Gates:** Vorab-Tabelle (S1 n/a für YAML/Dockerfile/JSON/MD), S2/S3/S4 abgedeckt; VERIFY-Task mit `test:changed`/`freshness:regenerate`/`freshness:check`/`test:openspec`. ✓
- **OpenSpec:** SPEC-Task füllt das Delta + `task test:openspec`. ✓
