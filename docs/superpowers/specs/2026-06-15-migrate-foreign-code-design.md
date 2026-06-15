---
ticket_id: null
plan_ref: docs/superpowers/plans/2026-06-15-migrate-foreign-code.md
status: active
date: 2026-06-15
---

# `migrate-foreign-code` Skill — Design Spec (Sub-Projekt 3)

## Context

Dies ist **Sub-Projekt 3** des VideoVault-Vorhabens. Die Dekomposition (aus
`~/projects/docs/superpowers/specs/2026-06-15-videovault-split-design.md`, § Gesamtvorhaben):

| # | Sub-Projekt | Repo | Status |
|---|---|---|---|
| 1 | VideoVault-Split (Mediaviewer-Widget + Bibliothek) | `~/projects/` | ✅ fertig |
| 2 | Beide Apps ins Bachelorprojekt übernehmen (Container, Kustomize, Ingress, Keycloak-Auth) | `~/projects/` → `~/Bachelorprojekt/` | ✅ fertig (Phasen 2a–2d) |
| **3** | **Fremdcode-Migrations-Skill aus den Learnings** | `~/Bachelorprojekt/.claude/skills/` | **dieser Spec** |

Abhängigkeit **1 → 2 → 3**: SP1 und SP2 wurden bewusst zuerst durchgeführt, damit SP3 aus
*gelebter* Erfahrung destilliert wird, nicht aus Theorie.

**Rohmaterial** (liegt in `~/projects/`, wird in den Skill destilliert — kein Live-Link):
- `docs/superpowers/specs/2026-06-15-videovault-migration-learnings.md` — die zentrale Learnings-Sammlung
- `docs/superpowers/specs/2026-06-15-videovault-split-design.md` — SP1-Design (Entkopplung)
- `docs/superpowers/plans/2026-06-15-videovault-split.md` — SP1-Plan
- `docs/superpowers/plans/2026-06-15-videovault-migration-2b-service-deploy.md` — SP2b (Vendoring/Build/DB/PVC)
- `docs/superpowers/plans/2026-06-15-videovault-migration-2c-server-split.md` — SP2c (Hybrid-Backend)
- `docs/superpowers/plans/2026-06-15-videovault-migration-2d-embed.md` — SP2d (Embed-Bridge, Auth, Brands)

## Problem

Das Bachelorprojekt wird in Zukunft weitere bestehende, extern entwickelte Apps aufnehmen
(VideoVault war die erste). Jede solche Migration durchläuft dieselbe Reise — Entkoppeln,
Vendoren, Containerisieren, server-seitige Fähigkeiten nachziehen, in die Plattform integrieren —
mit denselben wiederkehrenden Stolpersteinen. Dieses Wissen liegt aktuell verstreut in den
SP1/SP2-Artefakten in einem **anderen Repo** und verfällt, wenn es nicht kodifiziert wird.

## Bestätigte Entscheidungen (aus dem Brainstorming)

1. **Scope: volles Playbook (SP1 + SP2).** Der Skill deckt die ganze Reise ab —
   Entkopplungs-Vorbereitung im Ursprungs-Repo **und** Migration ins Bachelorprojekt.
2. **Form: Referenz-Runbook.** `SKILL.md` (schlank, progressive disclosure) + `references/`
   (Pattern-Katalog). Operator-getrieben; respektiert die „Repo-Arbeit immer über
   `dev-flow-*` einsteigen"-Regel — der Skill *sequenziert* dev-flow-Zyklen, ersetzt sie nicht.
3. **Ziel-Repo: Bachelorprojekt.** Skill lebt unter `.claude/skills/migrate-foreign-code/`.
4. **Generalisierung: Pattern-Katalog.** Generische Migrations-Phasen im `SKILL.md` + ein
   Katalog benannter, wiederverwendbarer Patterns in `references/`, jeweils mit der konkreten
   VideoVault-Instanz als Beispiel.
5. **Umsetzung: seriell, ein Plan.** `SKILL.md` + die 6 Pattern-Dateien werden nacheinander
   geschrieben (keine Multi-Agent-Orchestrierung). Planung über getrimmtes `dev-flow-plan`:
   **kein DB-Ticket, kein `stage-plan`, kein Factory-Enqueue.**

## Goals

- Die SP1/SP2-Erfahrung als **eigenständiges, wiederverwendbares Skill** im Bachelorprojekt
  festhalten, das die nächste Fremdcode-Migration messbar beschleunigt.
- Eine generische **6-Phasen-Reise** mit expliziten Decision-Gates bereitstellen.
- Einen **Pattern-Katalog** der wiederkehrenden technischen Muster + ihrer Stolpersteine liefern.
- Sauber an die **bestehenden Skills** andocken (`dev-flow-*`, `workspace-deploy`,
  `cluster-deployment`, `keycloak-realm-sync`, `secret-rotation`) — routen, nicht duplizieren.

## Non-Goals (YAGNI)

- **Keine** Automatik/Meta-Orchestrierung (kein factory-autopilot-Stil) — operator-getrieben.
- **Keine** Duplizierung von Deploy-/Auth-/Secret-Mechanik, die bereits Skills haben.
- **Keine** retroaktive Umschreibung der SP1/SP2-Artefakte in `~/projects/`.
- **Kein** generischer „migriere beliebige Sprache/Framework"-Anspruch über das hinaus, was die
  Patterns mit der VideoVault-Instanz tatsächlich belegen — der Katalog wächst mit künftigen Migrationen.

## Architektur — `SKILL.md` + Pattern-Katalog

```
.claude/skills/migrate-foreign-code/
├── SKILL.md                          # 6 generische Phasen + Decision-Gates, schlank
└── references/
    ├── pattern-vendoring.md
    ├── pattern-multistage-build.md
    ├── pattern-source-only-package.md
    ├── pattern-hybrid-backend.md
    ├── pattern-embed-bridge.md
    └── pattern-data-and-auth.md
```

> **Konventions-Hinweis:** Alle bestehenden Bachelorprojekt-Skills sind heute Single-File-`SKILL.md`;
> ein gemeinsames `.claude/skills/references/` hält nur dev-flow-übergreifende Docs. Dieser Skill
> führt bewusst ein **per-Skill `references/`-Unterverzeichnis** ein (Standard-Skill-Konvention,
> progressive disclosure) — der Pattern-Katalog ist zu umfangreich für einen Fließtext und profitiert
> von Disclosure-on-demand. `SKILL.md` verlinkt die Pattern-Dateien per relativem Pfad.

### Die 6 Phasen (im `SKILL.md`)

Jede Phase = ein eigener `dev-flow-plan`/`dev-flow-execute`-Zyklus mit Eingangs-/Ausgangs-Gate.

| Phase | Generisch | VideoVault-Instanz (Beispiel) |
|---|---|---|
| **0 Assess & Decide** | Stack/Build/Daten/Auth inventarisieren; Migrations-Fitness-Gate (lohnt sich die Übernahme?) | Zwei Apps, client-first, FSAA-basiert |
| **1 Decouple in-place** | God-Module zerlegen, Shared-Packages extrahieren, Verhalten per Characterization-Tests einfrieren — **im Ursprungs-Repo gegen dessen Test-Suite** | SP1: `useVideoManager` (1762 Z.) → 3 Hooks; `videovault-player`-Package |
| **2 Vendor** | Code in-repo holen (Dockerfile + CI, Idiom wie `website/`/`brett/`); source-only-Package via Alias | SP2a |
| **3 Containerize** | Multi-Stage-Build (Client + Server → 1 Runtime-Port); Base-Image, native Deps; neue DB in `shared-db`; PVC für Zwischendaten | SP2b |
| **4 Server-Capabilities** | Client-only-Backend hinter dem **bestehenden Interface** auf server-resident tauschen (Hybrid via Capability-Signal) | SP2c (server-side Split) |
| **5 Platform-Integration** | Kustomize/Ingress; host-owned Auth (Keycloak/oauth2-proxy); Embed-Bridge; `configmap-domains`; **beide Brands** | SP2d (Companion-Panel) |

### Der Pattern-Katalog (`references/`)

Jede Datei: **(a)** das generische Muster, **(b)** die konkrete VideoVault-Instanz als Beispiel,
**(c)** die zugehörigen Stolpersteine/Workarounds aus den Learnings.

1. **`pattern-vendoring.md`** — In-Repo-Vendoring-Idiom (Dockerfile + CI wie `website/`/`brett/`),
   `git add -f` für gitignore-geschützte Verzeichnisse, **kein** committed `node_modules`
   (Stolperstein: zweimal versehentlich committet → `git rm -r --cached`).
2. **`pattern-multistage-build.md`** — Client (`vite build` → `dist/public`) + Server
   (`esbuild` → `dist/index.js`) → ein Runtime-Port; Base-Image `bookworm-slim`; native/System-Deps
   (`ffmpeg`/`ffprobe` via APT).
3. **`pattern-source-only-package.md`** — `file:packages/*`-Alias, `main`/`types` = `src/index.ts`,
   `resolve.alias` für `react`/`react-dom` (Duplicate-React-Instances-Falle), `paths` in tsconfig,
   Dual-Build (`mode === 'lib'` vs. App), `toBlobURL` für WASM-Assets (`@ffmpeg/core`-Specifier-Falle).
4. **`pattern-hybrid-backend.md`** — Das in Phase 1 extrahierte Interface zahlt sich aus: Backend-Tausch
   ohne UI-Änderung; Selektor per **Capability-Signal** (z.B. `FileHandleRegistry` → WASM, sonst Server),
   ohne neues Typ-Feld; Falle: „Stream-Copy (`-c copy`) ist I/O-gebunden → GPU bringt null".
5. **`pattern-embed-bridge.md`** — postMessage-Bridge Host↔iframe mit **Origin-Validierung**;
   versioniertes Manifest (Zod-validierter Loader); Props + imperatives Handle als Kontrakt;
   Widget-Allowlist-Korrektur.
6. **`pattern-data-and-auth.md`** — Neue DB in zentraler `shared-db` über **beide** Namespaces
   (`workspace` + `workspace-korczewski`); host-owned Auth (Keycloak/oauth2-proxy); Domain via
   `configmap-domains` + Env-Injektion; beide Brands.

### Decision-Gates

Zwischen jeder Phase ein explizites Gate: **Voraussetzungen erfüllt?** · **reversibel?** ·
**weiter/stopp?**. Spiegelt das SP-Prinzip „erst in-place stabilisieren, dann migrieren". Beispiel
Gate 0→1: Migrations-Fitness bejaht und Ursprungs-Test-Suite grün, bevor entkoppelt wird.

## Relationship to existing skills

Der Skill ist ein **Meta-Runbook**, das bestehende Skills sequenziert statt sie zu duplizieren:

| Phase | Ruft / verweist auf |
|---|---|
| Alle | `dev-flow-plan` / `dev-flow-execute` (pro Phase ein Zyklus) |
| 3 | `workspace-deploy`, `cluster-deployment` (Manifeste/DB/PVC) |
| 5 | `keycloak-realm-sync` (OIDC/Auth), `secret-rotation` (Credentials), `fleet-ops` (beide Brands) |

`OVERVIEW.md` erhält einen Eintrag unter einer passenden Rubrik (z.B. „Development Flow" oder eine
neue „Migration"-Zeile).

## Verification (leicht)

Kein klassischer Unit-Test (reine Doku). Validierung:
- `SKILL.md` hat gültiges Frontmatter (`name`, `description`).
- Alle `references/`-Links lösen relativ auf.
- Skill ist invokebar (per `description` auto-discoverbar) und in `OVERVIEW.md` gelistet.
- Falls Skill-HTML in den Docs-Build (`scripts/build-docs.mjs` → `k3d/docs-content-built/`) einfließt:
  `task freshness:regenerate` + `task freshness:check` grün (beim Schreiben des Plans verifizieren).

## Execution Path (gemäß Entscheidung 5)

Getrimmtes `dev-flow-plan`:
1. Worktree `feature/migrate-foreign-code` (✅ angelegt) + Branch-Claim (✅).
2. Diese Spec nach `docs/superpowers/specs/2026-06-15-migrate-foreign-code-design.md` → commit/push.
3. Plan-Schreiben (`superpowers:writing-plans`) → `docs/superpowers/plans/2026-06-15-migrate-foreign-code.md`,
   gegen `.claude/skills/references/plan-quality-gates.md`; serielles Authoring von `SKILL.md` + 6 Pattern-Dateien.
4. Plan committen/pushen. **STOPP** — kein Ticket, kein `stage-plan`, kein Factory-Enqueue.

Implementierung später via `dev-flow-execute` (oder manuell), wenn freigegeben.

## Risks & Mitigations

| Risiko | Mitigation |
|---|---|
| **Über-Generalisierung** — Patterns zu abstrakt, unbrauchbar | Jedes Pattern trägt die konkrete VideoVault-Instanz als Beispiel |
| **Learnings-Drift** — Quelle in `~/projects/`, Skill in `~/Bachelorprojekt/` | Spec nennt die Quell-Pfade; Skill ist destillierte, eigenständige Kopie (kein Live-Link) |
| **Per-Skill `references/` ist neu** im BA-Repo | Bewusste, im Spec dokumentierte Konvention; relative Links |
| **Single-File-Erwartung** anderer Tooling | Beim Plan prüfen, ob Docs-Build/Freshness das `references/`-Subdir korrekt aufnimmt |

## Out of Scope

- Implementierung der nächsten konkreten Fremdcode-Migration (der Skill *ermöglicht* sie, führt sie nicht durch).
- Erweiterung des Pattern-Katalogs über die durch VideoVault belegten Muster hinaus (wächst künftig organisch).
- Jegliche Änderung an den SP1/SP2-Artefakten in `~/projects/`.
