---
ticket_id: T001279
plan_ref: openspec/changes/g-ci01-pipeline-stability/tasks.md
spec_ref: docs/superpowers/specs/2026-06-28-g-ci01-pipeline-stability-design.md
date: 2026-06-28
slug: g-ci01-pipeline-stability
status: draft
---

# G-CI01 — CI Pipeline Stability: Design Spec

_Ticket: T001279_

## Context & Problem Statement

Seit dem 27.06.2026 scheitern zwei post-merge CI-Workflows auf jedem main-Push durchgehend:

### Regression 1: freshness-regen.yml — Kaputte GPG-Action SHA

**Fehler:** `Unable to resolve action crazy-max/ghaction-import-gpg@d46b8ef5e6e7b4d1a8ef73f09f7a7d5e26fccc07`

- Die Action-Referenz in `freshness-regen.yml` zeigt auf einen Commit-SHA, der nicht mehr im
  upstream-Repo auflösbar ist.
- Der Fehler tritt beim "Prepare all required actions"-Setup-Schritt auf — **bevor** irgendein Job-Step
  läuft. Der gesamte Workflow-Run schlägt daher fail.
- **Konsequenz:** Nach jedem main-Push werden Freshness-Artefakte (`docs/generated/`, `docs/code-quality/`)
  nie auto-regeneriert. Folge-PRs, die dieselben Artefakte berühren, akkumulieren Staleness-Schulden.

### Regression 2: build-website.yml → website/Dockerfile — pnpm/npm-Mismatch

**Fehler:** `ERROR: failed to solve: failed to compute cache key: "/website/package-lock.json": not found`

- `website/Dockerfile` referenziert `website/package-lock.json` in der COPY-Zeile.
- Die Datei wurde in T001224 (S5 Lockfile-Gate, 27.06.2026) gelöscht — die Website ist vollständig
  auf pnpm migriert (`pnpm-lock.yaml`, pnpm@10).
- Das Dockerfile wurde **nicht** mitmigriert: es nutzt noch `npm ci` + `npm run build` + `npm prune`.
- **Konsequenz:** Jeder push auf `main` mit `website/**`-Änderungen schlägt beim Docker-Build fehl.
  Kein neues Website-Image wird gebaut, kein Auto-Deploy findet statt.

### Parallel-Ticket T001276

T001276 (g-cd01-korczewski-ci-parity) splittet `build-website.yml` strukturell in 3 unabhängige Jobs.
Die dort geplanten Änderungen berühren **nicht** `website/Dockerfile` und **nicht** `freshness-regen.yml`.
Unsere Fixes sind daher konfliktfrei.

---

## Lösung

### Fix A: freshness-regen.yml — GPG-Action entfernen

**Entscheidung:** GPG-Signing für Bot-Commits vollständig entfernen (keine externe Action-Dependency mehr).

**Begründung:**
- Bot-Commits (`chore: auto-regenerate freshness artifacts`) via GH_PAT-Push sind bereits via GitHub-Token
  authentifiziert — sie brauchen kein GPG-"Verified"-Badge.
- Die Signing-Eigenschaft war de facto seit dem Action-Breakage bereits weg (Workflow scheiterte vor jedem Commit).
- Eliminiert eine Klasse von Pinning-Fragilitäten: keine externe Action = kein SHA-Drift-Risiko.

**Konkrete Änderung in `freshness-regen.yml`:**
- Schritt "Import GPG key for commit signing" (Step mit `crazy-max/ghaction-import-gpg`) → **löschen**
- Der bestehende "Commit and push if changed" Step bleibt unverändert (er setzt keine gpgsign-Config).
- Das `secrets.GPG_PRIVATE_KEY` Secret kann nach diesem Fix aus dem Workflow entfernt werden (kein Verweis mehr).

### Fix B: website/Dockerfile — Migration von npm zu pnpm

**Entscheidung:** corepack/npm→pnpm via explizitem `npm install -g pnpm@10` im Build-Stage.

**Begründung:**
- pnpm@10 ist identisch mit dem in der CI verwendeten `pnpm/action-setup@v4.1.0` mit `version: 10`.
- `npm install -g pnpm@10` ist explizit und deterministisch — kein corepack-Bootstrapping nötig.
- Der Docker-Layer-Cache für pnpm nutzt `/root/.local/share/pnpm/store` (mount-Pfad im RUN-Schritt).

**Konkrete Änderungen in `website/Dockerfile` (Build-Stage):**

```
# vorher:
COPY website/package.json website/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# nachher:
RUN npm install -g pnpm@10
COPY website/package.json website/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# vorher:
RUN npm run build
RUN npm prune --omit=dev

# nachher:
RUN pnpm build
RUN pnpm prune --prod
```

**Runtime-Stage:** Keine Änderungen (kopiert nur `node_modules/` und `dist/`, nicht Package-Manager-spezifisch).

---

## BATS-Absicherung

Neue Tests in `tests/spec/ci-cd.bats` (G-CI01 Gruppe):

1. **G-CI01-A**: `freshness-regen.yml` enthält keinen Verweis auf `crazy-max/ghaction-import-gpg`
   (erwartet: FAIL vor Fix → PASS nach Fix)

2. **G-CI01-B**: `website/Dockerfile` COPY-Zeile referenziert `pnpm-lock.yaml`, nicht `package-lock.json`
   (erwartet: FAIL vor Fix → PASS nach Fix)

3. **G-CI01-C**: `website/Dockerfile` Build-Stage nutzt `pnpm install`, nicht `npm ci`
   (erwartet: FAIL vor Fix → PASS nach Fix)

4. **G-CI01-D**: `website/pnpm-lock.yaml` existiert und `website/package-lock.json` existiert nicht
   (Regression Guard gegen erneute Verwechslung)

---

## Scope & Abgrenzung

**In Scope (dieser Fix):**
- `freshness-regen.yml` — GPG-Step entfernen
- `website/Dockerfile` — npm→pnpm migrieren
- `tests/spec/ci-cd.bats` — G-CI01 BATS-Tests hinzufügen
- `openspec/specs/ci-cd.md` — Requirement für pnpm-Dockerfile + GPG-freie Bot-Commits ergänzen

**Out of Scope (T001276):**
- Strukturelle Aufspaltung von `build-website.yml` in 3 Jobs
- Brand-Parity-Deploy-Logik

**Out of Scope (künftige Tickets):**
- Systematisches Action-SHA-Pinning-Monitoring
- Nightly-Check für Action-SHA-Auflösbarkeit

---

## Success Criteria

1. Alle Runs von `freshness-regen.yml` nach einem main-Push schlagen nicht mehr beim Setup-Schritt fehl
2. `build-website.yml` baut erfolgreich ein Docker-Image wenn `website/**` geändert wurde
3. Alle 4 neuen G-CI01 BATS-Tests sind grün
4. `task test:all` bleibt grün
5. `task freshness:check` bleibt grün

---

## Files Changed

| Datei | Änderungstyp |
|-------|-------------|
| `.github/workflows/freshness-regen.yml` | Modify — GPG-Step entfernen |
| `website/Dockerfile` | Modify — npm→pnpm migration |
| `tests/spec/ci-cd.bats` | Modify — G-CI01 BATS hinzufügen |
| `openspec/specs/ci-cd.md` | Modify — Requirements ergänzen |
| `openspec/changes/g-ci01-pipeline-stability/proposal.md` | New |
| `openspec/changes/g-ci01-pipeline-stability/tasks.md` | New |
