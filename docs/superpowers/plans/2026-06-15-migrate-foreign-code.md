---
ticket_id: T000840
plan_ref: null
status: active
date: 2026-06-15
domains: [website, infra, db, ops, test, security]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# `migrate-foreign-code` Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein wiederverwendbares Bachelorprojekt-Skill `migrate-foreign-code` schreiben, das die SP1+SP2-VideoVault-Migrationserfahrung als 6-Phasen-Runbook (`SKILL.md`) + Pattern-Katalog (`references/`) kodifiziert.

**Architecture:** Reine Dokumentation — ein `SKILL.md` (generische Phasen + Decision-Gates, verlinkt die Patterns) und sechs `references/pattern-*.md` (je generisches Muster + VideoVault-Instanz + Stolpersteine). Pattern-Dateien zuerst (unabhängig), `SKILL.md` danach (verlinkt sie), dann `OVERVIEW.md`-Eintrag, dann Freshness-Verifikation. Quelle: SP1/SP2-Artefakte in `~/projects/docs/superpowers/`.

**Tech Stack:** Markdown, YAML-Frontmatter, `task freshness:*` / `scripts/build-docs.mjs` (Skill-Discovery).

**Quell-Material** (read-only, in `~/projects/`):
- `docs/superpowers/specs/2026-06-15-videovault-migration-learnings.md` (L)
- `docs/superpowers/plans/2026-06-15-videovault-split.md` (SP1)
- `docs/superpowers/plans/2026-06-15-videovault-migration-2b-service-deploy.md` (2b)
- `docs/superpowers/plans/2026-06-15-videovault-migration-2c-server-split.md` (2c)
- `docs/superpowers/plans/2026-06-15-videovault-migration-2d-embed.md` (2d)

**Gate-Hinweise (aus `plan-quality-gates.md` geprüft):** S1-Zeilenlimits gelten **nicht** für `.md`. S3 (Domain-Literale) und S4 (Orphans) scopen `k3d/`/`prod*/`/`website/src/`/`scripts/` — `.claude/skills/` ist außerhalb; trotzdem domänen-literalfrei schreiben (Verweis auf `configmap-domains`) und Skill in `OVERVIEW.md` referenzieren. Finaler Task führt `task test:changed` + `task freshness:regenerate` + `task freshness:check`.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `.claude/skills/migrate-foreign-code/SKILL.md` | Entry: Wann greift der Skill, die 6 Phasen, Decision-Gates, Verweise auf Patterns + bestehende Skills |
| `.claude/skills/migrate-foreign-code/references/pattern-vendoring.md` | In-Repo-Vendoring-Idiom |
| `.claude/skills/migrate-foreign-code/references/pattern-multistage-build.md` | Multi-Stage-Build Client+Server |
| `.claude/skills/migrate-foreign-code/references/pattern-source-only-package.md` | Source-only-Package via Alias |
| `.claude/skills/migrate-foreign-code/references/pattern-hybrid-backend.md` | Backend-Tausch hinter Interface |
| `.claude/skills/migrate-foreign-code/references/pattern-embed-bridge.md` | postMessage-Embed-Bridge |
| `.claude/skills/migrate-foreign-code/references/pattern-data-and-auth.md` | DB/PVC + host-owned Auth, beide Brands |
| `.claude/skills/OVERVIEW.md` | Modify: neuer Skill-Eintrag |

Konvention pro Pattern-Datei: `# Titel` → `## Muster (generisch)` → `## VideoVault-Beispiel` → `## Stolpersteine`.

---

### Task 1: `pattern-vendoring.md`

**Files:**
- Create: `.claude/skills/migrate-foreign-code/references/pattern-vendoring.md`

- [ ] **Step 1: Verzeichnis + Datei anlegen, Inhalt schreiben**

Inhalt (Quelle: 2b „vendored wie website/brett", L §„git add -f", §„node_modules committed"):
- **Muster:** Fremdcode in-repo holen statt als externe Dependency; in-repo `Dockerfile` + CI-Workflow nach dem etablierten `website/`/`brett/`-Idiom; vendored Quelle wird per Build neu gebaut.
- **VideoVault-Beispiel:** `packages/videovault-player` + VideoVault-Service als in-repo Quelle; CI baut dasselbe Image neu.
- **Stolpersteine:** `git add -f` für Dateien in `.gitignore`-geschützten Verzeichnissen; **niemals** `node_modules` committen (zweimal passiert → `git rm -r --cached` + `git commit --amend`); `npm install` Peer-Dep-Konflikt → `--legacy-peer-deps`.

- [ ] **Step 2: Struktur-Check**

Run: `grep -c '^## ' .claude/skills/migrate-foreign-code/references/pattern-vendoring.md`
Expected: `3` (die drei Pflicht-Abschnitte)

- [ ] **Step 3: Keine Domain-Literale**

Run: `grep -nE '(mentolder|korczewski)\.de' .claude/skills/migrate-foreign-code/references/pattern-vendoring.md || echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/migrate-foreign-code/references/pattern-vendoring.md
git commit -m "docs(skill): add migrate-foreign-code pattern-vendoring"
```

---

### Task 2: `pattern-multistage-build.md`

**Files:**
- Create: `.claude/skills/migrate-foreign-code/references/pattern-multistage-build.md`

- [ ] **Step 1: Inhalt schreiben**

Inhalt (Quelle: 2b Architecture):
- **Muster:** Multi-Stage-Build — Client (`vite build` → `dist/public`) + Server (`esbuild` → `dist/index.js`); Runtime startet einen Express-Server, der SPA **und** `/api` auf **einem** Port serviert. Base-Image `node:bookworm-slim`; native/System-Deps via APT.
- **VideoVault-Beispiel:** `ffmpeg`/`ffprobe` via APT im Runtime-Image; Client-first bleibt (FSAA, WASM), server-ffmpeg ist separat (siehe `pattern-hybrid-backend`).
- **Stolpersteine:** native Deps müssen im Slim-Image nachinstalliert werden; ein Port für SPA+API vermeidet Ingress-Sonderfälle.

- [ ] **Step 2: Struktur-Check** — `grep -c '^## ' …pattern-multistage-build.md` → Expected `3`
- [ ] **Step 3: Keine Domain-Literale** — `grep -nE '(mentolder|korczewski)\.de' …pattern-multistage-build.md || echo OK` → Expected `OK`
- [ ] **Step 4: Commit**

```bash
git add .claude/skills/migrate-foreign-code/references/pattern-multistage-build.md
git commit -m "docs(skill): add migrate-foreign-code pattern-multistage-build"
```

---

### Task 3: `pattern-source-only-package.md`

**Files:**
- Create: `.claude/skills/migrate-foreign-code/references/pattern-source-only-package.md`

- [ ] **Step 1: Inhalt schreiben**

Inhalt (Quelle: L §„Source-only Package", §„Dual-Build-Pattern", §„FFmpeg: toBlobURL", §„Duplicate React"):
- **Muster:** Geteilter Code als source-only Package — kein Build-Schritt, reiner Alias-Mechanismus. `package.json`: `main`/`types` = `src/index.ts`; Einbindung via `resolve.alias` (vite/vitest) + `paths` (tsconfig); Tests laufen direkt im Package.
- **VideoVault-Beispiel:** `@videovault-player`-Alias; Dual-Build (`mode === 'lib'` → `build.lib` + externals; sonst App-Dev-Server); `toBlobURL('/ffmpeg/…')` aus `@ffmpeg/util` statt `new URL(...)` (ab `@ffmpeg/core` v0.12 kein `dist/umd`-Specifier mehr), Core-Dateien via Copy-Script nach `public/ffmpeg/`, `optimizeDeps.exclude`.
- **Stolpersteine:** **Duplicate React instances** über node_modules-Grenzen → `resolve.alias` für `react`+`react-dom`; Hooks **vor** frühem `return null` platzieren (sonst „Rendered more hooks").

- [ ] **Step 2: Struktur-Check** — `grep -c '^## ' …` → Expected `3`
- [ ] **Step 3: Keine Domain-Literale** — `… || echo OK` → Expected `OK`
- [ ] **Step 4: Commit**

```bash
git add .claude/skills/migrate-foreign-code/references/pattern-source-only-package.md
git commit -m "docs(skill): add migrate-foreign-code pattern-source-only-package"
```

---

### Task 4: `pattern-hybrid-backend.md`

**Files:**
- Create: `.claude/skills/migrate-foreign-code/references/pattern-hybrid-backend.md`

- [ ] **Step 1: Inhalt schreiben**

Inhalt (Quelle: L §„Phase 2c", 2c Architecture/Korrektur):
- **Muster:** Das in der Entkopplung (Phase 1) extrahierte Interface zahlt sich aus — Backend-Tausch **ohne** UI-Änderung; Selektor wählt Implementierung per **Capability-Signal**, ohne neues Typ-Feld am Domänen-Objekt.
- **VideoVault-Beispiel:** `FileHandleRegistry` vorhanden → WASM-Backend, sonst → Server-Backend; nur eine `serverSplitterBackend`-Impl + `selectSplitterBackend`-Selektor; kein neues k8s-Manifest (2b-Infra wiederverwendet).
- **Stolpersteine:** GPU-Annahme prüfen — `ffmpeg -c copy` (Stream-Copy) ist **I/O-gebunden**, nvenc/GPU bringt null; Befund via Code-Erkundung **beim Planen**, nicht erst beim Bauen.

- [ ] **Step 2: Struktur-Check** — `grep -c '^## ' …` → Expected `3`
- [ ] **Step 3: Keine Domain-Literale** — `… || echo OK` → Expected `OK`
- [ ] **Step 4: Commit**

```bash
git add .claude/skills/migrate-foreign-code/references/pattern-hybrid-backend.md
git commit -m "docs(skill): add migrate-foreign-code pattern-hybrid-backend"
```

---

### Task 5: `pattern-embed-bridge.md`

**Files:**
- Create: `.claude/skills/migrate-foreign-code/references/pattern-embed-bridge.md`

- [ ] **Step 1: Inhalt schreiben**

Inhalt (Quelle: 2d Architecture, SP1 §Widget-Kontrakt):
- **Muster:** Host bindet die migrierte App als `<iframe>`-Widget ein; Kommunikation per **postMessage-Bridge** mit **Origin-Validierung** auf beiden Seiten; Host besitzt die Daten und steuert per Props + imperativem Handle; Widget bleibt zustandslos.
- **VideoVault-Beispiel:** Widget-Seite (`bridge.ts`) aus 2a; Host-Seite (`mediaviewer-bridge.ts`) spiegelt das Protokoll; versioniertes Hilfsvideo-Manifest mit **Zod-validiertem Loader**; Companion-Panel postet `setVideos`, empfängt `select`/`progress`/`ended`/`error` origin-validiert; Widget-Domain via `MEDIAVIEWER_HOST` aus `configmap-domains`.
- **Stolpersteine:** Widget-**Allowlist** muss den Host-Origin enthalten (Korrektur in 2d); Domain nie hardcoden → über `configmap-domains` + Env-Injektion.

- [ ] **Step 2: Struktur-Check** — `grep -c '^## ' …` → Expected `3`
- [ ] **Step 3: Keine Domain-Literale** — `… || echo OK` → Expected `OK`
- [ ] **Step 4: Commit**

```bash
git add .claude/skills/migrate-foreign-code/references/pattern-embed-bridge.md
git commit -m "docs(skill): add migrate-foreign-code pattern-embed-bridge"
```

---

### Task 6: `pattern-data-and-auth.md`

**Files:**
- Create: `.claude/skills/migrate-foreign-code/references/pattern-data-and-auth.md`

- [ ] **Step 1: Inhalt schreiben**

Inhalt (Quelle: 2b §DB/PVC, 2d §Auth, CLAUDE.md §beide Namespaces):
- **Muster:** Persistenz über neue DB in der zentralen `shared-db`; Zwischendaten über RWO-PVC (single-replica `Recreate`); host-owned Auth (Keycloak/oauth2-proxy) — die App vertraut dem Host; Domain via `configmap-domains`; cross-cutting Änderungen (DB/OIDC/Schema) explizit über **beide** Namespaces (`workspace` + `workspace-korczewski`).
- **VideoVault-Beispiel:** neue DB `videovault` in `shared-db`; Upload-PVC (RWO, `Recreate`); Auth durch den Workspace-Host; beide Brands.
- **Stolpersteine:** Namespaces sind separate per-Brand-Deployments im selben Fleet-Cluster → Migration muss in beide ausgerollt werden; verweise für Mechanik auf `keycloak-realm-sync` / `secret-rotation` / `fleet-ops` statt sie zu duplizieren.

- [ ] **Step 2: Struktur-Check** — `grep -c '^## ' …` → Expected `3`
- [ ] **Step 3: Keine Domain-Literale** — `… || echo OK` → Expected `OK`
- [ ] **Step 4: Commit**

```bash
git add .claude/skills/migrate-foreign-code/references/pattern-data-and-auth.md
git commit -m "docs(skill): add migrate-foreign-code pattern-data-and-auth"
```

---

### Task 7: `SKILL.md` (Spine)

**Files:**
- Create: `.claude/skills/migrate-foreign-code/SKILL.md`

- [ ] **Step 1: Frontmatter + Inhalt schreiben**

```markdown
---
name: migrate-foreign-code
description: Use when bringing an externally-developed app into the Bachelorprojekt platform — decouple it in its origin repo, vendor it, containerize it, move client-only capabilities server-side, and integrate it (Kustomize/Ingress/Keycloak/embed) across both brands. A 6-phase meta-runbook over dev-flow.
---
```

Body (schlank, progressive disclosure):
- **Wann diese Skill greift:** Übernahme einer bestehenden Fremd-App ins Bachelorprojekt.
- **Schicht-Hinweis:** Operator-getrieben; **jede Phase ist ein eigener `dev-flow-plan`/`dev-flow-execute`-Zyklus** — der Skill ersetzt dev-flow nicht, er sequenziert es.
- **Die 6 Phasen** (Tabelle generisch + VideoVault-Instanz, identisch zur Spec): 0 Assess & Decide · 1 Decouple in-place · 2 Vendor · 3 Containerize · 4 Server-Capabilities · 5 Platform-Integration.
- **Decision-Gates:** zwischen jeder Phase Voraussetzungen/Reversibilität/weiter-stopp; Gate 0→1 = Fitness bejaht + Ursprungs-Suite grün.
- **Pattern-Katalog:** Liste mit relativen Links auf alle 6 `references/pattern-*.md` (Phase-Zuordnung dazuschreiben).
- **Verwandte Skills:** Tabelle — `dev-flow-plan`/`-execute` (pro Phase), `workspace-deploy`/`cluster-deployment` (Phase 3), `keycloak-realm-sync`/`secret-rotation`/`fleet-ops` (Phase 5).
- **Quelle der Learnings:** Pfade in `~/projects/docs/superpowers/` nennen (destillierte Kopie, kein Live-Link).

- [ ] **Step 2: Frontmatter-Felder vorhanden**

Run: `head -4 .claude/skills/migrate-foreign-code/SKILL.md | grep -E '^(name|description):'`
Expected: beide Zeilen `name:` und `description:`

- [ ] **Step 3: Alle Pattern-Links existieren**

```bash
cd .claude/skills/migrate-foreign-code
for f in $(grep -oE 'references/pattern-[a-z-]+\.md' SKILL.md | sort -u); do
  test -f "$f" && echo "OK $f" || echo "MISSING $f"
done
```
Expected: 6× `OK`, kein `MISSING`

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/migrate-foreign-code/SKILL.md
git commit -m "docs(skill): add migrate-foreign-code SKILL.md (6-phase runbook)"
```

---

### Task 8: `OVERVIEW.md`-Eintrag

**Files:**
- Modify: `.claude/skills/OVERVIEW.md`

- [ ] **Step 1: Eintrag ergänzen**

Neue Rubrik „## Migration" (nach „Feature Discovery") mit Tabellenzeile:
`| `migrate-foreign-code` | Eine bestehende externe App ins Bachelorprojekt übernehmen — 6-Phasen-Reise (entkoppeln → vendoren → containerisieren → server-side → integrieren) über dev-flow, mit Pattern-Katalog. |`

- [ ] **Step 2: Verifizieren**

Run: `grep -c 'migrate-foreign-code' .claude/skills/OVERVIEW.md`
Expected: `>= 1`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/OVERVIEW.md
git commit -m "docs(skill): list migrate-foreign-code in skills OVERVIEW"
```

---

### Task 9: Verifikation (CI-Äquivalent)

**Files:** keine (nur Checks)

- [ ] **Step 1: Geänderte Tests**

Run: `task test:changed`
Expected: PASS (oder „keine relevanten Tests" — Doku-only).

- [ ] **Step 2: Freshness regenerieren**

Run: `task freshness:regenerate`
Erwartung: regeneriert Skill-Index/Docs-Artefakte (build-docs entdeckt das neue Skill).

- [ ] **Step 3: Regenerierte Artefakte committen (falls Diff)**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(freshness): regenerate after migrate-foreign-code skill"
```

- [ ] **Step 4: Freshness-Check**

Run: `task freshness:check`
Expected: PASS (inkl. S1–S4-Ratchet + Baseline-Key-Count-Assertion).

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage:** Alle 6 Phasen → Task 7 (SKILL.md); alle 6 Patterns → Tasks 1–6; OVERVIEW → Task 8; Verifikation (freshness/links/frontmatter) → Tasks 2/3-Steps + Task 9. Decision-Gates → Task 7 Body. Relationship-to-existing-skills → Task 7 „Verwandte Skills". ✓
**Placeholder scan:** Jeder Pattern-Task nennt konkrete Quell-Sektionen + Stichpunkte (kein „TBD"). Code-Step (SKILL.md-Frontmatter) zeigt den realen Block. ✓
**Konsistenz:** Dateinamen identisch über File-Structure-Tabelle, Tasks 1–6, SKILL.md-Links (Task 7 Step 3 prüft das maschinell). ✓
