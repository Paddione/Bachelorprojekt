---
title: Coaching-Sessions Service — Coaching Studio MVP + Homepage Redesign
ticket_id: T001002
status: active
date: 2026-06-20
domains: [website, infra, security, ops]
spec_ref: docs/superpowers/specs/2026-06-20-coaching-studio-design.md
openspec_ref: openspec/changes/coaching-studio/
file_locks: []
shared_changes: true
shared_changes_files:
  - k3d/kustomization.yaml
  - k3d/realm-workspace-dev.json
  - k3d/configmap-domains.yaml
  - Taskfile.yml
  - environments/schema.yaml
  - prod-fleet/mentolder/kustomization.yaml
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Implementation Plan: coaching-studio

> Spec: `docs/superpowers/specs/2026-06-20-coaching-studio-design.md` · Ticket: T001002
> Autoritative Anforderungen: `openspec/changes/coaching-studio/assets/requirements.md` (§1–§8) — geht dem
> Prototyp-Intent vor, wo sie Details präzisiert. Prototyp (`assets/new/coaching_studio/*.jsx`) ist Hi-Fi
> Design-Referenz, NICHT zu kopieren. Homepage-Handoff: `assets/new/homepage_redesign/README.md` (autoritativ für WS-B).
> Domains: website (Homepage-Redesign), infra (k3d/prod-fleet-Manifeste, envsubst, configmap), security (Keycloak
> client + group + oauth2-proxy + SealedSecret), ops (studio-server Service/Container/Taskfile).

## Kern-Entscheidungen (vom Planautor gefällt — offen questions aus dem Design-Spec)

1. **Schema: NEUES `studio.*`-Schema** in der bestehenden shared-db `website`-Datenbank (NICHT Erweiterung des
   bestehenden `coaching.*`-Schemas, NICHT separate `studio_app`-DB). Begründung: (a) Anforderung §2 verlangt
   „eine Datenbank" → selbe shared-db wie `coaching.*`/`sessions.*`/`tickets.*`. (b) Das Studio ist ein **eigener
   Service/Container** mit eigener Migrations-Kontrolle (arena-server-Pattern: `src/db/migrations/*.sql`) — ein
   separates Schema hält die DDL-Ownership-Grenze sauber (Website owns `coaching.*`, Studio-Service owns `studio.*`).
   (c) Das Datenmodell ist strukturell verschieden: 10-Ebenen-Bogen mit Pro-Ebene-Prompt-Editor + Reset,
   Zwischenablage, Übersetzung/TTS, genau-1-KI-Profil-pro-Client mit Checkbox-Gating — Einzwängen in
   `coaching.sessions` (projekt/kunde/audit/kiConfigId/live-prep-modus) würde dessen Invarianten korrumpieren.
   (d) `coaching.*` ist brand-scoped + projekt-orientiert (Admin-Wissensbibliothek + Sitzungsplanung); das Studio
   ist ein Live-Coaching-Workspace. Verbindung via `STUDIO_DB_URL` → selbe shared-db (`shared-db.workspace.svc…:5432/website`).
2. **Studio-Frontend-Stack: Vite + React 19 + TypeScript SPA + Express 5 API in EINEM Container.** Kein Astro
   (Coach-Only-Tool, kein SSR/SEO-Bedarf). Der Prototyp ist React → 1:1-Port ist höchste Fidelity + günstigster
   Weg. Express serviert die Vite-gebündeten Static-Assets + die JSON-API auf gleichem Origin (kein CORS-Problem).
   Backend-Patterns 1:1 aus arena-server übernommen: `jose` JWT-Verify gegen Keycloak-JWKS, `drizzle-orm`/`pg`,
   eigene SQL-Migrations, `pino`-Logging, `/healthz`. Tailwind v4 + Design-Tokens (Brass/Ink/Sage) portiert.
3. **Auth: oauth2-proxy vorgeschaltet + Keycloak-Client `studio` (Audience `studio`) + Realm-Group `/coach-access`,
   Studio-API verifiziert das weitergereichte JWT via `jose` (arena `verifyArenaJwt`-Pattern).** Kein duplizierter
   Cookie-Session-Store (wie bei brett/videovault/oauth2-proxy-*). Coach (Gerald) wird Mitglied von `/coach-access`.
4. **TTS: Browser SpeechSynthesis API (Web Speech API) für MVP.** Kein Cluster-TTS-Service (Zero-Infra, erfüllt §8
   „Vorlesen per Knopfdruck", Audio läuft im Coach-Browser → Nextcloud-Talk-Screen-Share-Audiokanal). Cluster-TTS
   ist Folge-Ticket, falls Sprachabdeckung/Qualität ungenügend.
5. **Deployment-Topologie: eigener Deployment `studio-server` + Service + IngressRoute `studio.${PROD_DOMAIN}` +
   `oauth2-proxy-studio` im `workspace`-Namespace (mentolder-only für MVP; korczewski-Fan-out ist Folge-Ticket).**
   Manifeste: `k3d/studio.yaml` + `k3d/oauth2-proxy-studio.yaml` (dev, in `k3d/kustomization.yaml` referenziert) +
   `prod-fleet/mentolder/studio.yaml` (prod-Overlay). `STUDIO_DOMAIN`/`STUDIO_IMAGE` in `configmap-domains.yaml`
   + `environments/schema.yaml` + envsubst-Var-Liste im Taskfile `workspace:deploy`.
6. **Kein LiveKit für MVP** (Anforderung §6/§7). Client-Audio läuft extern über Nextcloud Talk. Studio nutzt nur
   das Coach-Mic → faster-whisper (in-cluster, wie `website/src/pages/api/meeting/transcribe.ts`).

## Architektur

**Workstream A — Coaching Studio MVP (eigener Service `studio-server/`):**
Arena-server-artiger Node-Container: Express 5 API (auth via jose-JWT-Verify, drizzle/pg gegen `studio.*`-Schema,
LLM-Calls an in-cluster LM Studio `LLM_ROUTER_URL`, Whisper-Call an in-cluster faster-whisper) + Vite-gebaute
React 19 SPA (Static-Assets, gleicher Origin). Screens 1:1 aus dem Prototyp: TopBar, Dashboard, Kundenakte,
KI-Profil-Editor, Workspace (Herzstück: 10-Ebenen-Rail, Prompt-Editor+Reset, Mic-Dock, Transkriptions-Review,
KI-Antwort, Zwischenablage, Übersetzungs-Panel+TTS), CompareView, AdminArea, Präsentations- + Export-Fenster.

**Workstream B — Homepage Redesign (in `website/`):**
Hi-Fi Redesign von `src/pages/index.astro` nach Handoff-README. Brand-agnostisches Shared-System (gilt auch für
korczewski.de — nur Copy+Config). Refactor bestehender Svelte/Astro-Komponenten; Daten-Helfer unverändert
(`getEffectiveHomepage()` etc.). Tokens in `global.css` bereits Produktions-CSS — gegen `colors_and_type.css` abgleichen.

**Tech Stack:** Studio: Node 20 + Express 5 + drizzle-orm + pg + jose + pino + Vite 7 + React 19 + TS + Tailwind v4.
Website: Astro 6.4 + Svelte 5 + Tailwind v4 (bestehend). Infra: Kustomize + Traefik IngressRoute + oauth2-proxy +
Keycloak realm JSON + SealedSecrets + go-task.

## Global Constraints

- **S1 — Zeilenbudgets pro Datei (Ratchet gegen BASELINE, nicht gegen das statische Limit).** Limits aus
  `docs/code-quality/gates.yaml:s1.limits`: `.ts/.js/.jsx/.py=600`, `.svelte/.sh/.mjs/.mts=500`, `.astro/.tsx=400`,
  `.cjs=200`, `.bash=300`. `.css/.yaml/.json/.md/.sql/.html` haben KEIN S1-Limit. `website-db.ts` ist
  `s1.ignore` (sanctioned exception) — wird von diesem Plan NICHT angerührt. Baseline-Key-Count = 98 (CI vergleicht
  gegen main; Plan darf KEINE Baseline-Einträge hinzufügen). Budgets für jede berührte Datei:

  | Datei | Ist | Baseline | Limit | Budget | Anmerkung |
  |-------|-----|----------|-------|--------|-----------|
  | `website/src/components/Navigation.svelte` | 719 | **719** | 500 | **0** | GEBASELINED → Änderung MUSS netto zeilenneutral sein ODER Datei echt verkleinern. Plan: Extraktion des Mobile-Menüs + Brand-Mark in `NavMobile.svelte` (echter Split), Topbar-Styling ersetzt alten Code 1:1 → Netto ≤ 0. |
  | `website/src/components/Hero.svelte` | 266 | nb | 500 | 234 | Refactor (Portrait-Prop, Mono-Kicker, CTA-Row). |
  | `website/src/components/ServiceCard.svelte` | 78 | nb | 500 | — | WIRD ENTFERNT (ersetzt durch `ServiceRow.svelte`). Zeilen verschwinden. |
  | `website/src/components/CallToAction.svelte` | 182 | nb | 500 | 318 | Restyle (zentriert, brass-glow, italic H2). |
  | `website/src/components/SlotWidget.astro` | 119 | nb | 400 | 281 | Slot-Pill-Reskin. |
  | `website/src/pages/index.astro` | 342 | nb | 400 | **58** | KNAPP → Sektionen in Komponenten auslagern (WhyMe/QuoteCard/Process/StatsStrip), damit index.astro < 400 bleibt. |
  | `website/src/layouts/Layout.astro` | 103 | nb | 400 | 297 | Footer-Block (4-Spalten-Grid). |
  | `website/src/styles/global.css` | 189 | nb | — (kein .css-Limit) | ∞ | Token-Abgleich + Typo-Helper; kein S1-Risiko. |
  | `website/src/config/brands/mentolder.ts` | 423 | nb | 600 | 177 | Nur `avatarSrc` → `/gerald.jpg` + ggf. Prozess-Datenfeld; minimal. |
  | `website/src/components/NavMobile.svelte` | 0 (NEU) | nb | 500 | 500 | Extraktion aus Navigation. |
  | `website/src/components/Portrait.svelte` | 0 (NEU) | nb | 500 | 500 | Wiederverwendbare Portrait-Frame. |
  | `website/src/components/ServiceRow.svelte` | 0 (NEU) | nb | 500 | 500 | Ersetzt ServiceCard. |
  | `website/src/components/WhyMe.svelte` | 0 (NEU) | nb | 500 | 500 | |
  | `website/src/components/QuoteCard.svelte` | 0 (NEU) | nb | 500 | 500 | |
  | `website/src/components/Process.astro` | 0 (NEU) | nb | 400 | 400 | 4-Schritt-Rail. |
  | `website/src/components/StatsStrip.astro` | 0 (NEU) | nb | 400 | 400 | Stats + Availability. |
  | `studio-server/**/*.{ts,tsx}` | 0 (NEU) | nb | ts=600 / tsx=400 | s.o. | Alle NEU → statisches Limit. Workspace.tsx droht > 400 → Pro-aktiv in Sub-Komponenten splitten (Rail/Main/Clipboard/Translation/MicDock). routes*.ts > 600 → in Routen-Module splitten. |
  | `studio-server/**/*.test.{ts,tsx}` | 0 (NEU) | nb | ts=600 / tsx=400 | | |
  | `k3d/*.yaml`, `prod-fleet/**/*.yaml`, `environments/schema.yaml`, `k3d/realm-workspace-dev.json`, `Taskfile.yml`, `studio-server/package.json`, `studio-server/Dockerfile`, `*.sql`, `*.css`, `*.html` | — | — | kein S1-Limit | ∞ | Nur S3/S4 relevant. |

- **S2 — Import-Zyklen.** Keine neuen Zyklen in den Graphen `website`, `arena-server` (tsconfig-basiert) — und
  analog für den neuen `studio-server`-Graphen. Studio-Helper (`llm/client.ts`, `db/repo.ts`, `auth/jwt.ts`) als
  **pure Module** ohne Rück-Import auf die HTTP/Express-Schicht planen. SPA `lib/api.ts` als pure Fetch-Schicht.
- **S3 — Hardcodierte Hostnamen.** In `k3d/`, `prod*/`, `website/src/`, `studio-server/src/` sind String-Literale
  `*.mentolder.de` / `*.korczewski.de` verboten (Kommentarzeilen ausgenommen). IngressRoute `studio.${PROD_DOMAIN}`;
  oauth2-proxy redirect `http://studio.localhost/oauth2/callback` (dev — `.localhost` ist S3-safe). Prod-Realm-
  Issuer via `KEYCLOAK_ISSUER_MENTOLDER` env (wie arena.yaml). SPA liest API-Base vom gleichen Origin (kein Host
  hardcodiert). LLM/Whisper-URLs aus Env (`LLM_ROUTER_URL`, `WHISPER_URL`), nicht hardcodiert.
- **S4 — Orphan-Manifeste/-Skripte.** `k3d/studio.yaml` + `k3d/oauth2-proxy-studio.yaml` MUSS in
  `k3d/kustomization.yaml:resources` gelistet werden. `prod-fleet/mentolder/studio.yaml` in
  `prod-fleet/mentolder/kustomization.yaml`. Jedes neue `studio-server/src/http/routes/*.ts` MUSS vom
  `routes/index.ts` gemountet werden. `studio-server/Dockerfile` MUSS von einem Taskfile `studio:build`/`studio:deploy`
  referenziert werden. Kein neues `scripts/*.sh` in diesem Plan (Studio-Deploy via Taskfile-Tasks direkt).
- **Guardrails (T000756):** `currentColor` statt `<img>`-Einbettung in SVGs, keine Stray-Hex-Werte in SVGs, kein
  Root-`width/height` auf SVGs. Italic ist die EINZIGE Betonung (kein bold-italic, kein underline, keine Emoji/
  Unicode-Icons). „mentolder." immer mit brass Punkt. Studio-Icons 1:1 aus Prototyp `data.jsx` (Inline-SVG, stroke,
  currentColor) portieren.
- **Out of scope (Folge-Tickets):** Systembrett, Coaching Vertrag, Art-Library-Ingestion-Pipeline, Avatare-&-Sidekick-
  Productionisation, korczewski-Studio-Deploy, Cluster-TTS-Service, LiveKit-Client-Audio, Systemtest-Seed für Studio.
- **Bestehende Tests erweitern statt neue Dateien anlegen** — zuerst nach vitest/playwright/bats-Tests für berührte
  Komponenten suchen. Studio-Service hat noch keine Tests → NEUE Test-Dateien sind erlaubt (neues Modul).

## File Structure

### Workstream A — Studio Service (`studio-server/`, NEU)

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `studio-server/package.json` | NEU | npm-Manifest (express, drizzle-orm, pg, jose, pino, vite, react, tailwindcss, vitest) |
| `studio-server/tsconfig.json` | NEU | TS-Config (server + web via project refs oder ein Config) |
| `studio-server/vite.config.ts` | NEU | Vite-Build für SPA (React-Plugin, Tailwind, outDir → dist/public) |
| `studio-server/vitest.config.ts` | NEU | Vitest-Config (node-env für API-Tests, jsdom für Komponenten) |
| `studio-server/Dockerfile` | NEU | Multi-Stage: deps → build (tsc + vite) → runtime (node dist/index.js) |
| `studio-server/src/index.ts` | NEU | Express-Entry: pinoHttp, json, static(dist/public), routes, healthz, shutdown |
| `studio-server/src/config.ts` | NEU | loadConfig (port, dbUrl, issuers, llmRouterUrl, whisperUrl, logLevel) |
| `studio-server/src/log.ts` | NEU | pino-Logger |
| `studio-server/src/db/client.ts` | NEU | makeDb(cfg) → { pool, db } (drizzle/node-postgres, arena-Pattern) |
| `studio-server/src/db/migrate.ts` | NEU | runMigrations(pool) — studio._migrations-Tabelle + SQL-Dateien |
| `studio-server/src/db/schema.ts` | NEU | drizzle-PgSchema `studio` + Tabellen (clients, profiles, sessions, session_levels, standard_levels, standard_profile_fields) |
| `studio-server/src/db/migrations/0001_studio.sql` | NEU | CREATE SCHEMA studio + alle Tabellen (idempotent IF NOT EXISTS) |
| `studio-server/src/db/repo.ts` | NEU | Pure DB-Funktionen (clients/profiles/sessions/levels/clipboard/standards) |
| `studio-server/src/db/repo.test.ts` | NEU | Vitest-Unit-Tests (pg-mem oder gemockter Pool) |
| `studio-server/src/auth/jwt.ts` | NEU | verifyStudioJwt(token, {issuers}) → StudioClaims (jose, audience 'studio') |
| `studio-server/src/auth/jwks.ts` | NEU | getJwks(issuer) (jose createRemoteJWKSet, gecacht) |
| `studio-server/src/http/middleware.ts` | NEU | authMiddleware (liest X-Forwarded-Access-Token, verifyStudioJwt, req.user) |
| `studio-server/src/http/routes/index.ts` | NEU | Mountet alle Routen-Module unter /api |
| `studio-server/src/http/routes/clients.ts` | NEU | GET/POST/PUT /api/clients, /api/clients/:id, /api/clients/:id/profile |
| `studio-server/src/http/routes/sessions.ts` | NEU | GET/POST/PUT /api/sessions (create/list/get/pause/resume/complete/copy-as-template) |
| `studio-server/src/http/routes/levels.ts` | NEU | GET/PUT /api/sessions/:id/levels/:n (prompt/answer/notes/done/clipboard) |
| `studio-server/src/http/routes/admin.ts` | NEU | GET/PUT /api/admin/levels + /api/admin/profile-fields (Standard-Prompts + -Profilfragen) |
| `studio-server/src/http/routes/llm.ts` | NEU | POST /api/llm/answer (KI-Antwort pro Ebene) + /api/llm/translate (Übersetzung DE∥Zielsprache) |
| `studio-server/src/http/routes/transcribe.ts` | NEU | POST /api/transcribe (Coach-Mic-Audio → faster-whisper → Text) |
| `studio-server/src/http/routes/export.ts` | NEU | GET /api/sessions/:id/export (Session-Verlauf als druckbares HTML/JSON, inkl. Zielsetzungen+Vereinbarungen) |
| `studio-server/src/http/routes/health.ts` | NEU | GET /healthz |
| `studio-server/src/llm/client.ts` | NEU | Pure LLM-Client (openai-SDK → LLM_ROUTER_URL; chat-Antwort + Übersetzung) |
| `studio-server/src/llm/whisper.ts` | NEU | Pure Whisper-Client (POST audio an WHISPER_URL → Text) |
| `studio-server/web/index.html` | NEU | SPA-Einstiegspunkt |
| `studio-server/web/src/main.tsx` | NEU | ReactDOM.createRoot |
| `studio-server/web/src/App.tsx` | NEU | Screen-Routing (dashboard/akte/profile/workspace/compare/admin) + RTL-Toggle |
| `studio-server/web/src/lib/api.ts` | NEU | Pure Fetch-Schicht (same-origin /api) |
| `studio-server/web/src/lib/types.ts` | NEU | TS-Typen (Client, Profile, Session, Level, StandardLevel, ProfileField, TargetLang) |
| `studio-server/web/src/lib/constants.ts` | NEU | TARGET_LANGS (fa/ar/tr/en/fr + rtl-Flags), Speicher-Highlight-Level (05, 09) |
| `studio-server/web/src/styles/tokens.css` | NEU | Design-Tokens portiert aus `colors_and_type.css` (Brass/Ink/Sage + Typo-Scale) |
| `studio-server/web/src/styles/app.css` | NEU | Hi-Fi Styling portiert aus Prototyp `app.css` (Tailwind-@theme + Komponenten-Klassen) |
| `studio-server/web/src/components/Icons.tsx` | NEU | Inline-SVG-Iconset (currentColor, kein width/height-Root) aus data.jsx |
| `studio-server/web/src/components/BrandMark.tsx` | NEU | Radial-brass-Quadrat + „mentolder." Wortmarke |
| `studio-server/web/src/components/TopBar.tsx` | NEU | Brand + Nav + RTL-Toggle + Präsentation/Session-CTAs |
| `studio-server/web/src/components/Dashboard.tsx` | NEU | Kundengitter + Stats + Suche + Admin-Button + Neue-Session-CTA |
| `studio-server/web/src/components/Kundenakte.tsx` | NEU | Stammdaten + KI-Profil-Pin + Session-Liste |
| `studio-server/web/src/components/ProfileEditor.tsx` | NEU | Checkbox-gated Profilfelder, nur aktive fließen in KI-Anfrage |
| `studio-server/web/src/components/Workspace.tsx` | NEU | Herzstück-Shell (Rail + Main + Aux koordiniert Sub-Komponenten) |
| `studio-server/web/src/components/WorkspaceRail.tsx` | NEU | 10-Ebenen-Liste (Tastaturnavigation, Done-Checks, Speicher-Highlight 05/09) |
| `studio-server/web/src/components/PromptEditor.tsx` | NEU | Pro-Ebene-Prompt + Standard/Reset-Schalter |
| `studio-server/web/src/components/MicDock.tsx` | NEU | Mic idle→recording→review + Waveform + Transkriptions-Review |
| `studio-server/web/src/components/AnswerPanel.tsx` | NEU | KI-Antwort + „In Zwischenablage" |
| `studio-server/web/src/components/ClipboardPanel.tsx` | NEU | Zwischenablage (leert n. Senden + Ebenenwechsel) |
| `studio-server/web/src/components/TranslationPanel.tsx` | NEU | DE ∥ Zielsprache, RTL, TTS (SpeechSynthesis) |
| `studio-server/web/src/components/CompareView.tsx` | NEU | Alt-vs-Neu-Split + Diff-Highlighting |
| `studio-server/web/src/components/AdminArea.tsx` | NEU | Tabs: Standard-Prompts (10 Ebenen) + Standard-Profilfragen |
| `studio-server/web/src/components/Presentation.tsx` | NEU | Präsentationsfenster-Route (/present) |
| `studio-server/web/src/components/Export.tsx` | NEU | Export/Druck-Fenster-Route (/export) |

### Workstream A — Infra (MODIFY + NEU)

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `k3d/studio.yaml` | NEU | Deployment `studio-server` + Service + IngressRoute `studio.${PROD_DOMAIN}` (workspace-ns) |
| `k3d/oauth2-proxy-studio.yaml` | NEU | oauth2-proxy (client-id=studio, upstream=studio-server:80) — Mirror von oauth2-proxy-brett |
| `k3d/kustomization.yaml` | ÄNDERN (shared) | resources: + studio.yaml + oauth2-proxy-studio.yaml |
| `k3d/realm-workspace-dev.json` | ÄNDERN (shared) | + Keycloak-Client `studio` (audience `studio`) + Group `/coach-access` + Gerald-Mitgliedschaft |
| `k3d/configmap-domains.yaml` | ÄNDERN (shared) | + STUDIO_DOMAIN + STUDIO_IMAGE |
| `prod-fleet/mentolder/studio.yaml` | NEU | Prod-Overlay (image-digest, node-affinity, prod-Issuer, tls) |
| `prod-fleet/mentolder/kustomization.yaml` | ÄNDERN (shared) | resources: + studio.yaml |
| `environments/schema.yaml` | ÄNDERN (shared) | + STUDIO_DOMAIN, STUDIO_IMAGE, STUDIO_DB_URL, STUDIO_OIDC_SECRET, WHISPER_URL |
| `environments/.secrets/mentolder.yaml` | ÄNDERN (gitignored) | + STUDIO_OIDC_SECRET (openssl rand) |
| `environments/sealed-secrets/mentolder.yaml` | ÄNDERN | via `task env:seal ENV=mentolder` regeneriert |
| `Taskfile.yml` | ÄNDERN (shared) | envsubst-Var-Liste in workspace:deploy + studio:build/studio:deploy Tasks |

### Workstream B — Homepage Redesign (`website/`, MODIFY + NEU)

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `website/src/styles/global.css` | ÄNDERN | Token-Abgleich mit colors_and_type.css + Typo-Helper (.t-eyebrow/.t-stat/.t-lede) |
| `website/public/gerald.jpg` | NEU (Asset) | Portrait aus `assets/new/homepage_redesign/assets/gerald.jpg` |
| `website/src/components/Navigation.svelte` | ÄNDERN (Budget 0) | Sticky-Topbar-Refactor + Extraktion Mobile-Menü → NavMobile |
| `website/src/components/NavMobile.svelte` | NEU | Extrahiertes Mobile-Menü (echter Split, macht Navigation.svelte Platz) |
| `website/src/components/Hero.svelte` | ÄNDERN | Two-col, Mono-Kicker, H1 italic-accent, CTA-Row, <Portrait> |
| `website/src/components/Portrait.svelte` | NEU | Wiederverwendbare Portrait-Frame (Halos, Duotone, Hairline, Tag/Caption-Plate) |
| `website/src/components/ServiceCard.svelte` | ENTFERNEN | Ersetzt durch ServiceRow |
| `website/src/components/ServiceRow.svelte` | NEU | Nummerierte Rows (brass-dot bullets, price block, circle „Mehr"-Icon) |
| `website/src/components/StatsStrip.astro` | NEU | 4 Stats + Availability-Widget (sage-pulse, getAvailableSlots) |
| `website/src/components/SlotWidget.astro` | ÄNDERN | Slot-Pill-Reskin (Geist Mono, --line-2 border, brass-hover) |
| `website/src/components/WhyMe.svelte` | NEU | Eyebrow + H2 italic + Points-List (homepage.whyMePoints) |
| `website/src/components/QuoteCard.svelte` | NEU | Brass-radial Quote-Card + dekoratives italic-Glyph + Byline |
| `website/src/components/Process.astro` | NEU | 4-Schritt-Rail (brass line + dots) |
| `website/src/components/CallToAction.svelte` | ÄNDERN | Zentriert, brass-glow, italic H2 |
| `website/src/layouts/Layout.astro` | ÄNDERN | Footer-Block (4-Spalten-Grid, mono heads, brass-hover) |
| `website/src/pages/index.astro` | ÄNDERN (Budget 58) | Sektionen komponieren (statt inline) → < 400 halten |
| `website/src/config/brands/mentolder.ts` | ÄNDERN | avatarSrc → /gerald.jpg + ggf. process-Schritte-Feld (minimal) |

---

## Workstream A — Coaching Studio Service

## Task A1: studio-server Scaffold + Express-Entry

**Files:**
- Create: `studio-server/package.json`, `studio-server/tsconfig.json`, `studio-server/vite.config.ts`, `studio-server/vitest.config.ts`, `studio-server/src/index.ts`, `studio-server/src/config.ts`, `studio-server/src/log.ts`, `studio-server/src/http/routes/health.ts`

**Interfaces:**
- Consumes: env `PORT` (default 8092), `DB_URL`, `KEYCLOAK_ISSUER_MENTOLDER`, `LLM_ROUTER_URL`, `WHISPER_URL`, `LOG_LEVEL`.
- Produces: Express-App, die Static-Assets (`dist/public`) + JSON-API (`/api/*`) auf gleichem Origin serviert; `GET /healthz` → `{ok:true}`; graceful shutdown (SIGTERM/SIGINT, pool.end).

- [ ] **Step 1: package.json + tsconfig + vite.config anlegen**
  - `type: "module"`, scripts: `dev` (tsx watch), `build` (`tsc -p tsconfig.json && vite build`), `start` (`node dist/index.js`), `test` (`vitest run`).
  - deps: express ^5, drizzle-orm ^0.45, pg ^8, jose ^6, pino ^9, openai ^6 (LLM-Client), dotenv ^17.
  - devDeps: typescript, tsx, vite ^7, @vitejs/plugin-react ^5, react ^19, react-dom ^19, @types/react, @types/react-dom, tailwindcss ^4, @tailwindcss/vite ^4, vitest ^4, @types/express, @types/pg, supertest (API-Tests).
  - `vite.config.ts`: root `web`, build.outDir `../dist/public` (relativ zu studio-server), plugins `[react(), tailwindcss()]`, resolve.alias `$lib → web/src/lib`. Server.proxy `/api → http://localhost:${PORT}` (dev-ergonomics).
  - `vitest.config.ts`: environments `node` (server) + `jsdom` (web) via projects oder test.environment-Option.

- [ ] **Step 2: config.ts + log.ts**
  - `loadConfig(env=process.env)` → `{ port, dbUrl, issuers:[{url,brand:'mentolder'}], llmRouterUrl, whisperUrl, logLevel }` (arena `config.ts`-Pattern; `need(env,k)` für Pflicht-Vars).
  - `log.ts`: `export const log = pino({ level: cfg.logLevel })` — oder Factory `makeLog(level)`.

- [ ] **Step 3: index.ts — Express-Entry (arena index.ts-Pattern)**
  - `dotenv/config`; `loadConfig`; `makeDb(cfg)`; `await runMigrations(pool)`; `makeRepo(pool)`.
  - `app.use(pinoHttp({logger:log}))`, `express.json({limit:'25mb'})` (Audio-Upload).
  - Static: `app.use(express.static(join(__dirname,'../public')))` (Vite-outDir) mit SPA-fallback `app.get('*',(req,res)=>res.sendFile(indexHtml))` für nicht-/api-Routen (client-side routing für /present, /export).
  - Routes: `app.use('/api', makeApiRouter({...}))`; `app.get('/healthz', ...)`.
  - Error-Handler (arena-Pattern: status aus err.code, fallback 500).
  - `httpServer.listen(cfg.port)`; SIGTERM/SIGINT → `pool.end()` + `httpServer.close()`.

- [ ] **Step 4: health.ts** — `GET /healthz` → 200 `{ok:true, service:'studio-server'}`.

- [ ] **Step 5: Failing-Test `health.test.ts` (TDD red→green)** — supertest: `GET /healthz` → 200 + body.ok===true. Test VOR Implementierung von health.ts schreiben und laufen lassen:
  Run: `cd studio-server && npx vitest run src/http/routes/health.test.ts`
  Expected: FAIL (rot — `/healthz`-Route existiert noch nicht, Test schlägt fehl → verifiziert, dass der Test das Verhalten wirklich prüft). Dann health.ts (Step 4) implementieren und erneut laufen lassen → Expected: PASS (grün).

- [ ] **Step 6: Test + Build-Gate**
  Run: `cd studio-server && npx vitest run src/http/routes/health.test.ts && npm run build`
  Expected: PASS; `dist/index.js` + `dist/public/index.html` existieren.

- [ ] **Step 7: Zeilen-Budget-Check** — `wc -l studio-server/src/index.ts` < 600 (Ziel < ~140); `vite.config.ts` < 600 (Ziel < ~60).

- [ ] **Step 8: Commit**
  `git add studio-server/ && git commit -m "feat(studio): scaffold studio-server Express+Vite app + healthz [T001002]"`

## Task A2: DB-Schema + Migrationen (`studio.*`)

**Files:**
- Create: `studio-server/src/db/client.ts`, `studio-server/src/db/migrate.ts`, `studio-server/src/db/schema.ts`, `studio-server/src/db/migrations/0001_studio.sql`

**Interfaces:**
- Consumes: `cfg.dbUrl` (shared-db `website`-DB, gleicher Postgres wie `coaching.*`).
- Produces: `studio.*`-Schema mit Tabellen: `studio.clients`, `studio.profiles` (genau 1 pro Client, JSONB-Felder mit active-Flags), `studio.sessions` (10-Ebenen, status aktiv/pausiert/fertig, template_of FK für Kopie-als-Vorlage), `studio.session_levels` (Pro-Ebene: prompt, prompt_is_default, answer, notes, done, clipboard JSONB, generated_at), `studio.standard_levels` (Admin-Standard-Prompts, 10 Rows, editierbar), `studio.standard_profile_fields` (Admin-Standard-Profilfragen: label/value/type/required/active), `studio._migrations`.

- [ ] **Step 1: client.ts** — `makeDb(cfg)` → `{ pool: new Pool({connectionString:cfg.dbUrl, max:10}), db: drizzle(pool) }` (1:1 arena `db/client.ts`).

- [ ] **Step 2: migrate.ts** — `runMigrations(pool)`: `CREATE SCHEMA IF NOT EXISTS studio`; `CREATE TABLE IF NOT EXISTS studio._migrations (filename text PK, applied_at timestamptz default now())`; iteriere `migrations/*.sql` sortiert, skip angewendete, BEGIN/COMMIT pro Datei (arena `migrate.ts`-Pattern, nur schema-name `studio` statt `arena`).

- [ ] **Step 3: schema.ts** — drizzle `pgSchema('studio')` + Tabellen (arena `schema.ts`-Pattern). Typen: `clients{id uuid PK, name, initials, since, lang, category, created_at}`; `profiles{client_id uuid PK/FK→clients ON DELETE CASCADE, fields jsonb NOT NULL default '[]'}` (fields = `[{key,label,value,type,required,active}]`); `sessions{id uuid PK, client_id FK, title, status text default 'aktiv', current_level int default 0, template_of uuid nullable FK→sessions, lang text, created_at, updated_at, completed_at, paused_at}`; `session_levels{session_id FK, level_no int 1..10, prompt text, prompt_is_default bool default true, answer text, notes text, done bool default false, clipboard jsonb default '[]', generated_at timestamptz, PK(session_id,level_no)}`; `standard_levels{level_no int PK, name, goal, prompt, updated_at}`; `standard_profile_fields{key text PK, label, value, type, required bool, active bool, sort int, updated_at}`.

- [ ] **Step 4: 0001_studio.sql** — idempotentes DDL (CREATE SCHEMA IF NOT EXISTS studio; CREATE TABLE IF NOT EXISTS …). Seed `studio.standard_levels` mit den 10 Ebenen aus Prototyp `data.jsx:LEVELS` (01 Ankommen → 10 Abschluss) + `studio.standard_profile_fields` mit `PROFILE_FIELDS`-Defaults — nur wenn leer (`INSERT … ON CONFLICT DO NOTHING`).

- [ ] **Step 5: Failing-Test `migrate.test.ts`** — pg-mem oder gemockter Pool: `runMigrations` → `studio._migrations` + `studio.standard_levels` (10 Rows) + `studio.standard_profile_fields` existieren; zweiter Aufruf ist idempotent (kein Fehler, keine Duplikate).

- [ ] **Step 6: Test + Budget-Gate**
  Run: `cd studio-server && npx vitest run src/db/migrate.test.ts`
  Expected: PASS. `wc -l studio-server/src/db/schema.ts` < 600 (Ziel < ~130); `migrate.ts` < 600 (Ziel < ~40).

- [ ] **Step 7: Commit**
  `git add studio-server/src/db/ && git commit -m "feat(studio): add studio.* schema + migrations [T001002]"`

## Task A3: Auth-Middleware (jose JWT-Verify, Audience `studio`)

**Files:**
- Create: `studio-server/src/auth/jwt.ts`, `studio-server/src/auth/jwks.ts`, `studio-server/src/http/middleware.ts`, `studio-server/src/http/middleware.test.ts`

**Interfaces:**
- Consumes: `X-Forwarded-Access-Token`-Header (von oauth2-proxy gesetzt, wie `--pass-access-token=true`); `cfg.issuers` (`[{url:'https://auth.${PROD_DOMAIN}/realms/workspace', brand:'mentolder'}]`).
- Produces: `authMiddleware` → `req.user: {sub, preferredUsername, realmRoles, brand}`; 401 wenn kein/ungültiges Token. `verifyStudioJwt(token,{issuers})` (arena `verifyArenaJwt`-Pattern, audience `'studio'`).

- [ ] **Step 1: jwks.ts** — `getJwks(issuer)` → `jose.createRemoteJWKSet(new URL(issuer+'/protocol/openid-connect/certs'))` (pro Issuer cachen via Map).

- [ ] **Step 2: jwt.ts** — `verifyStudioJwt(token,{issuers,keyResolver?})` → iteriere TrustedIssuers, `jwtVerify(token,key,{issuer:ti.url,audience:'studio'})`, return `{sub,preferredUsername,realmRoles,brand,exp}` (1:1 arena `jwt.ts`, nur audience + brand-Typ ggf. auf `'mentolder'|'korczewski'`).

- [ ] **Step 3: middleware.ts** — `makeAuthMiddleware({issuers})` → Express-Middleware: liest `X-Forwarded-Access-Token` (fallback `Authorization: Bearer`), `verifyStudioJwt`, `req.user=claims`, `next()`; kein Token → 401 `{error:'unauthorized'}`; Verify-Fehler → 401. Optional `/healthz` + static ausgenommen.

- [ ] **Step 4: Failing-Test `middleware.test.ts`** — supertest: kein Header → 401; gültiges gemocktes Token (keyResolver-Stub) → req.user gesetzt, next gerufen; ungültiges Token → 401.

- [ ] **Step 5: Test + Budget-Gate** — PASS. `wc -l studio-server/src/auth/jwt.ts` < 600 (Ziel < ~70); `middleware.ts` < 600 (Ziel < ~80).

- [ ] **Step 6: Commit**
  `git add studio-server/src/auth/ studio-server/src/http/middleware.* && git commit -m "feat(studio): add jose JWT auth middleware (audience studio) [T001002]"`

## Task A4: repo.ts — Pure DB-Funktionen

**Files:**
- Create: `studio-server/src/db/repo.ts`, `studio-server/src/db/repo.test.ts`

**Interfaces:**
- Consumes: `pool` + die `studio.*`-Tabellen. Produces pure Funktionen (kein Express-Import — S2):
  - `listClients()`, `getClient(id)`, `createClient(args)`, `updateClient(id,args)`.
  - `getProfile(clientId)`, `upsertProfile(clientId, fields[])` (genau 1 — upsert by client_id PK).
  - `listSessions(clientId?)`, `getSession(id)` (mit levels), `createSession(args)`, `updateSessionStatus(id,status)` (aktiv/pausiert/fertig; paused_at/completed_at setzen), `copySessionAsTemplate(id)` (neue Session mit `template_of=id`, levels übernommen, status 'aktiv'), `completeSession(id)`.
  - `getLevel(sessionId,n)`, `upsertLevel(sessionId,n,{prompt,prompt_is_default,answer,notes,done,clipboard})`.
  - `getStandardLevels()`, `setStandardLevels(rows[])`; `getStandardProfileFields()`, `setStandardProfileFields(rows[])`.

- [ ] **Step 1: Failing-Test `repo.test.ts`** — pg-mem: createClient → getClient; upsertProfile ersetzt (genau 1); createSession + upsertLevel + getSession(mit levels); copySessionAsTemplate erzeugt neue Session mit template_of + gleichen levels; updateSessionStatus pausiert/fertigt; Standard-CRUD.

- [ ] **Step 2: repo.ts implementieren** — pure `pool.query`-Funktionen, SQL mit Parametern ($1…), JSONB via `JSON.stringify`. Clipboard in `session_levels.clipboard` JSONB-Array `[{id,text}]`. Keine Express-Imports (S2: pure Modul).

- [ ] **Step 3: Test + Budget-Gate** — PASS. `wc -l studio-server/src/db/repo.ts` < 600 (Ziel < ~450; falls darüber, split in `repo/clients.ts`+`repo/sessions.ts`+`repo/standards.ts`).

- [ ] **Step 4: Commit**
  `git add studio-server/src/db/repo.* && git commit -m "feat(studio): add pure repo functions for studio.* [T001002]"`

## Task A5: API-Routen — Clients/Profile/Sessions/Levels/Admin

**Files:**
- Create: `studio-server/src/http/routes/index.ts`, `studio-server/src/http/routes/clients.ts`, `studio-server/src/http/routes/sessions.ts`, `studio-server/src/http/routes/levels.ts`, `studio-server/src/http/routes/admin.ts` (+ `*.test.ts` je eine)

**Interfaces:**
- Consumes: `authMiddleware` (req.user), `repo.*`.
- Produces:
  - `GET/POST /api/clients`, `GET/PUT /api/clients/:id`, `GET/PUT /api/clients/:id/profile` (PUT profile = upsertProfile, active-Flags pro Feld).
  - `GET /api/sessions?clientId=`, `POST /api/sessions` (create), `GET /api/sessions/:id` (mit levels), `PATCH /api/sessions/:id` (status: pause/resume/complete), `POST /api/sessions/:id/copy` (template).
  - `GET /api/sessions/:id/levels`, `PUT /api/sessions/:id/levels/:n` (prompt/answer/notes/done/clipboard; prompt_is_default beim Reset).
  - `GET/PUT /api/admin/levels` (Standard-Prompts), `GET/PUT /api/admin/profile-fields` (Standard-Profilfragen).

- [ ] **Step 1: routes/index.ts** — `makeApiRouter({repo,auth})` → `router.use(auth)`; mount clients/sessions/levels/admin. (Health bleibt außerhalb /api.)

- [ ] **Step 2: clients.ts** — CRUD + profile. Validate `id` (uuid). 401 wenn anon; req.user für ownership-logs.

- [ ] **Step 3: sessions.ts** — create/list/get/updateStatus/copy-as-template. `PATCH status`: nur aktiv→pausiert→aktiv→fertig→(ansehen); fertige nicht mehr editierbar (außer ansehen). copy: neue Session, `template_of=srcId`, levels kopieren, `status='aktiv'`.

- [ ] **Step 4: levels.ts** — `PUT /levels/:n` akzeptiert Teil-Update (prompt, prompt_is_default, answer, notes, done, clipboard). Reset = `prompt=standard.prompt, prompt_is_default=true` (Repo liest Standard).

- [ ] **Step 5: admin.ts** — `GET/PUT /api/admin/levels` + `/api/admin/profile-fields`. PUT ersetzt die Standard-Sets atomar (Transaktion).

- [ ] **Step 6: Failing-Tests** je Route — supertest + gemockter repo: 401 anon; CRUD-Happy-Path; copy erzeugt neue Session; status-Übergänge validiert; level PUT + reset.

- [ ] **Step 7: Test + Budget-Gate** — PASS. JEDE routes/*.ts < 600 (Ziel je < ~180; falls sessions.ts > 600 → split copy/status in sessions-ops.ts).

- [ ] **Step 8: Commit**
  `git add studio-server/src/http/routes/ && git commit -m "feat(studio): add API routes for clients/profiles/sessions/levels/admin [T001002]"`

## Task A6: LLM-Client (KI-Antwort + Übersetzung) + Whisper-Client

**Files:**
- Create: `studio-server/src/llm/client.ts`, `studio-server/src/llm/whisper.ts`, `studio-server/src/http/routes/llm.ts`, `studio-server/src/http/routes/transcribe.ts` (+ tests)

**Interfaces:**
- Consumes: `cfg.llmRouterUrl` (in-cluster LM Studio, OpenAI-kompatibel) via `openai`-SDK (`baseURL: llmRouterUrl`); `cfg.whisperUrl` (in-cluster faster-whisper, wie website `api/meeting/transcribe.ts`).
- Produces:
  - `POST /api/llm/answer` `{sessionId, levelNo, prompt, input, profileFields[]}` → `{answer}` (baut System-Prompt aus Ebenen-Standard + aktiven Profilfeldern, ruft LM Studio chat).
  - `POST /api/llm/translate` `{text, targetLang}` → `{translated, rtl}` (DE→Zielsprache; Zielsprachen fa/ar/tr/en/fr).
  - `POST /api/transcribe` (multipart/`audio/webm` Blob vom Coach-Mic) → `{text}` (POST an WHISPER_URL, return transcript).

- [ ] **Step 1: llm/client.ts** — pure Modul: `chatAnswer({baseURL, systemPrompt, userPrompt})` + `translate({baseURL, text, targetLang})` via `new OpenAI({baseURL})`. Keine Express-Imports (S2). Fehler → werfen (Route fängt).

- [ ] **Step 2: llm/whisper.ts** — `transcribe({whisperUrl, audioBlob})` → POST multipart/form-data an whisperUrl, parse `text`. (Mirror website `api/meeting/transcribe.ts`-Logik, ohne meeting-spezifische Persistenz.)

- [ ] **Step 3: routes/llm.ts** — auth-gate; `POST /api/llm/answer` liest body, ruft `chatAnswer`; `POST /api/llm/translate` ruft `translate`. System-Prompt = `standard_levels[levelNo].prompt` (oder session-level-prompt falls bearbeitet) + aktive Profilfelder als Kontext. Antwort persistiert via `repo.upsertLevel(answer)`.

- [ ] **Step 4: routes/transcribe.ts** — auth-gate; `POST /api/transcribe` liest audio (express.raw oder multer-in-memory; `express.json` überspringt multipart). Rufe `whisper.transcribe`. Return `{text}`. NICHT persistieren (Text ist Coach-Review — erst nach Accept+Send gespeichert).

- [ ] **Step 5: Failing-Tests** — gemockter OpenAI/fetch: answer gibt Text; translate gibt Text+rtl; transcribe gibt Text; 401 anon; LLM-Down → 502 mit Klartext-Fehler.

- [ ] **Step 6: Test + Budget-Gate** — PASS. `wc -l` je Datei < 600 (client.ts < ~150; llm.ts < ~140; transcribe.ts < ~120).

- [ ] **Step 7: Commit**
  `git add studio-server/src/llm/ studio-server/src/http/routes/llm.ts studio-server/src/http/routes/transcribe.ts && git commit -m "feat(studio): add LLM answer/translate + whisper transcribe routes [T001002]"`

## Task A7: Export-Route (druckbarer Session-Verlauf, §5 Speicher-Highlighting)

**Files:**
- Create: `studio-server/src/http/routes/export.ts` (+ test)

**Interfaces:**
- Consumes: `repo.getSession(id)` (mit levels). Produces `GET /api/sessions/:id/export` → `text/html` (druckbarer Verlauf aller 10 Ebenen mit Prompt+Eingabe+KI-Antwort; **Ebenen 05 (Zielsetzungen) + 09 (Vereinbarungen) visuell hervorgehoben** und als extrahierter Block gelistet — Anforderung §5).

- [ ] **Step 1: export.ts** — baue HTML-String aus session+levels; Ebenen 05/09 mit eigener Sektion „Zielsetzungen" / „Vereinbarungen" (brass-hervorgehoben). `Content-Type: text/html; charset=utf-8`. Print-CSS inline (dark→paper für Druck).

- [ ] **Step 2: Test** — gemockter repo: export enthält alle Ebenen-Namen + „Zielsetzungen" + „Vereinbarungen"-Sektion; 404 wenn session unbekannt.

- [ ] **Step 3: Budget-Gate** — `wc -l export.ts` < 600 (Ziel < ~180; HTML-Template ggf. in `llm/export-template.ts` auslagern falls > 600).

- [ ] **Step 4: Commit**
  `git add studio-server/src/http/routes/export.ts && git commit -m "feat(studio): add session export route with §5 storage highlighting [T001002]"`

## Task A8: SPA-Frontend — Tokens, App-Shell, TopBar, Routing

**Files:**
- Create: `studio-server/web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/lib/api.ts`, `web/src/lib/types.ts`, `web/src/lib/constants.ts`, `web/src/styles/tokens.css`, `web/src/styles/app.css`, `web/src/components/Icons.tsx`, `web/src/components/BrandMark.tsx`, `web/src/components/TopBar.tsx`

**Interfaces:**
- Consumes: `/api/*` (same-origin via `lib/api.ts`). Produces SPA-Shell mit Screen-Routing (dashboard/akte/profile/workspace/compare/admin) + `/present` + `/export`-Fenster-Routen + RTL-Toggle (`document.dir`).

- [ ] **Step 1: tokens.css** — 1:1 aus `assets/new/colors_and_type.css` (`:root`-Tokens + Typo-Scale + Radii + Spacing). Keine Stray-Hex außer den dokumentierten (brass-deep, brass-hex für PDF).

- [ ] **Step 2: app.css** — port aus Prototyp `app.css` (Hi-Fi: topbar, ws-layout, mic-states, translation-panel, compare, admin). Tailwind `@import "tailwindcss"` + `@theme`-Block der tokens exponiert (`bg-ink-900`, `text-brass` etc.). Film-grain-overlay (wie website global.css). Keine Emoji/Unicode-Icons.

- [ ] **Step 3: Icons.tsx** — Inline-SVG-Iconset aus `data.jsx` (currentColor, stroke, **kein Root width/height** — via props). BrandMark.tsx (radial-brass square + „mentolder." mit brass Punkt).

- [ ] **Step 4: api.ts** — pure Fetch-Wrapper (same-origin `/api/...`), typed Returns. `lib/types.ts` (Client, Profile, Session, Level, StandardLevel, ProfileField, TargetLang). `constants.ts` (TARGET_LANGS fa/ar/tr/en/fr + rtl; HIGHLIGHT_LEVELS=[5,9]).

- [ ] **Step 5: App.tsx** — useState-Routing (wie Prototyp `app.jsx`); RTL-Toggle (`useEffect document.documentElement.dir`). TopBar (brand + nav Übersicht/Admin + RTL + Präsentation/Session-CTAs). Routing: dashboard/akte/profile/workspace/compare/admin; `/present` + `/export` → eigene Vollbild-Komponenten (window.open-Targets).

- [ ] **Step 6: Build-Gate** — `cd studio-server && npm run build` → `dist/public/index.html` + Assets; kein TS-Fehler.

- [ ] **Step 7: Budget-Gate** — `wc -l web/src/App.tsx` < 400 (.tsx! Ziel < ~130); `app.css`/`tokens.css` kein S1-Limit. TopBar.tsx < 400 (Ziel < ~80).

- [ ] **Step 8: Commit**
  `git add studio-server/web/ && git commit -m "feat(studio): SPA app-shell, tokens, topbar, routing [T001002]"`

## Task A9: SPA — Dashboard + Kundenakte + ProfileEditor

**Files:**
- Create: `studio-server/web/src/components/Dashboard.tsx`, `Kundenakte.tsx`, `ProfileEditor.tsx`

**Interfaces:**
- Consumes: `api.listClients()`, `api.getClient(id)`, `api.getProfile(id)`, `api.upsertProfile(id,fields)`, `api.listSessions(clientId)`. Produces die 3 Kern-Screens (1:1 aus `screens_core.jsx`).

- [ ] **Step 1: Dashboard.tsx** — Kundengitter mit Stats (aktiv/pausiert/fertig via aggregation), Suche (Name/Kategorie), Admin-Button, Neue-Session-CTA. Daten via `useEffect`+`api`.

- [ ] **Step 2: Kundenakte.tsx** — Aside: Stammdaten + KI-Profil-Pin (genau 1, zeigt aktive/inaktive Felder, „X von Y aktiv"); Main: Session-Liste mit Status-Pills + Ebene X/10 + lang + Fortsetzen/Vorlage/Export-Actions.

- [ ] **Step 3: ProfileEditor.tsx** — Checkbox-gated Profilfelder (nur active fließen in KI-Anfrage — visuell markiert); add-field + save; admin-erweiterbar-Hinweis.

- [ ] **Step 4: Budget-Gate** — JEDE < 400 (.tsx). Dashboard < ~180; Kundenakte < ~220 (falls > 400 → split SessionList in eigene Komponente); ProfileEditor < ~200.

- [ ] **Step 5: Commit**
  `git add studio-server/web/src/components/Dashboard.tsx studio-server/web/src/components/Kundenakte.tsx studio-server/web/src/components/ProfileEditor.tsx && git commit -m "feat(studio): dashboard, kundenakte, profile editor screens [T001002]"`

## Task A10: SPA — Workspace (Herzstück)

**Files:**
- Create: `studio-server/web/src/components/Workspace.tsx`, `WorkspaceRail.tsx`, `PromptEditor.tsx`, `MicDock.tsx`, `AnswerPanel.tsx`, `ClipboardPanel.tsx`, `TranslationPanel.tsx`

**Interfaces:**
- Consumes: `api.getSession(id)`, `api.upsertLevel(...)`, `api.llmAnswer(...)`, `api.llmTranslate(...)`, `api.transcribe(audioBlob)`. Produces den 10-Ebenen-Workspace (1:1 aus `workspace.jsx`, in Sub-Komponenten gesplittet wegen .tsx-Limit 400).

- [ ] **Step 1: Workspace.tsx (Shell)** — State: active level, prompts[], done[], clip[], input, mic-state (idle/recording/review), transcript, answer[]. `switchLevel(i)` → **clip leeren + mic/transcript/input reset** (§4: leert nach Ebenenwechsel). `send()` → answer setzen + **clip leeren** + input/mic reset + done markieren (§4: leert nach Senden). Koordiniert Rail + PromptEditor + MicDock + AnswerPanel + ClipboardPanel + TranslationPanel. Tastaturnavigation (ArrowUp/Down) im Rail.

- [ ] **Step 2: WorkspaceRail.tsx** — 10-Ebenen-Liste (Done-Checks, is-active, aria-current). **Speicher-Highlighting (§5):** Ebenen 05 + 09 visuell hervorgehoben (brass-marker/badge). Mobile horizontal rail (wie Prototyp `ws-railbar`).

- [ ] **Step 3: PromptEditor.tsx** — Pro-Ebene textarea + ResetSwitch (Standard/Zurücksetzen); `isDefault` = prompt entspricht Standard; Reset → Standard wiederherstellen (api.upsertLevel mit `prompt_is_default:true`).

- [ ] **Step 4: MicDock.tsx** — Coach-Mic only (§7): `MediaRecorder` → audio/webm Blob; states idle→recording (Waveform)→review. `POST /api/transcribe` → transcript (editierbar textarea). Actions: Abspielen (Audio-Playback der Aufnahme), Ersetzen (neu aufnehmen), Löschen, „In Eingabe übernehmen". Senden disabled während recording.

- [ ] **Step 5: AnswerPanel.tsx** — KI-Antwort pro Ebene (via `api.llmAnswer`); „In Zwischenablage" (clip-push). Empty-State.

- [ ] **Step 6: ClipboardPanel.tsx** — Zwischenablage-Items (add aus Eingabe, remove); leer-Hint. Wird von Workspace-Shell bei send/level-switch geleert.

- [ ] **Step 7: TranslationPanel.tsx** — DE ∥ Zielsprache (TARGET_LANGS, Farsi default RTL); `api.llmTranslate` für live-Übersetzung; RTL-Layout (`dir`); **TTS via `window.speechSynthesis`** (§8) — „Vorlesen" play-states (DE + Zielsprache). Kein Cluster-TTS.

- [ ] **Step 8: Build-Gate** — `npm run build` grün.

- [ ] **Step 9: Budget-Gate** — JEDE < 400 (.tsx). Workspace.tsx < ~280 (Shell-only, Logik delegiert); MicDock < ~220; TranslationPanel < ~200; andere < ~150. Falls Workspace > 400 → weiteren Sub-Extract.

- [ ] **Step 10: Commit**
  `git add studio-server/web/src/components/Workspace*.tsx studio-server/web/src/components/{PromptEditor,MicDock,AnswerPanel,ClipboardPanel,TranslationPanel}.tsx && git commit -m "feat(studio): 10-level workspace heart with mic/clipboard/translation/TTS [T001002]"`

## Task A11: SPA — CompareView + AdminArea + Präsentation + Export

**Files:**
- Create: `studio-server/web/src/components/CompareView.tsx`, `AdminArea.tsx`, `Presentation.tsx`, `Export.tsx`

**Interfaces:**
- Consumes: `api.getSession`, `api.copySessionAsTemplate`, `api.getStandardLevels/setStandardLevels`, `api.getStandardProfileFields/setStandardProfileFields`, `api.getSessionExport(id)` (oder `/api/sessions/:id/export` iframe). Produces die restlichen Screens (1:1 aus `screens_more.jsx` + Präsentation/Export-Fenster).

- [ ] **Step 1: CompareView.tsx** — Alt-vs-Neu-Split (template_of-Session links, aktuelle rechts); Diff-Highlighting pro Ebene (brass „geändert"); Export-Button. Öffnet idealerweise eigenes Fenster (`window.open('/compare?...')` oder eigener Screen).

- [ ] **Step 2: AdminArea.tsx** — Tabs: „10 Ebenen · Standard-Prompts" (edit name/goal/prompt, add/remove) + „Standard-Profilfragen" (edit label/value/type/required/active, add/remove). Save → `api.setStandardLevels`/`setStandardProfileFields`.

- [ ] **Step 3: Presentation.tsx** — `/present`-Route: sessionbezogene Maßnahmen (Texteingaben + KI-Antworten) in großem Layout für Bildschirmfreigabe via Nextcloud Talk / Zweitmonitor (§6). Liest aktuelle Session + active level. Read-only.

- [ ] **Step 4: Export.tsx** — `/export`-Route: lädt `/api/sessions/:id/export` (druckbares HTML) in einem print-ready-View; `window.print()`-Button. Inkl. Zielsetzungen+Vereinbarungen (§5).

- [ ] **Step 5: Budget-Gate** — JEDE < 400 (.tsx). CompareView < ~200; AdminArea < ~280 (ggf. split AdminLevels/AdminQuestions falls > 400); Presentation < ~150; Export < ~120.

- [ ] **Step 6: Commit**
  `git add studio-server/web/src/components/{CompareView,AdminArea,Presentation,Export}.tsx && git commit -m "feat(studio): compare, admin, presentation + export windows [T001002]"`

## Task A12: Dockerfile + studio:build/deploy Taskfile-Tasks

**Files:**
- Create: `studio-server/Dockerfile`
- Modify: `Taskfile.yml` (shared) — add `studio:build` + `studio:deploy` Tasks (referenzieren Dockerfile → S4)

**Interfaces:**
- Consumes: `studio-server/` Source. Produces: Container-Image `studio-server` + Taskfile-Tasks zum Bauen/Deployen (dev + prod), analog arena:deploy.

- [ ] **Step 1: Dockerfile** — Multi-Stage (arena `Dockerfile`-Pattern): deps (npm ci) → build (`tsc -p tsconfig.json && vite build`) → runtime (`node dist/index.js`, EXPOSE 8092, USER node). Kopiere `dist/index.js` + `dist/public` + `dist/db/migrations`.

- [ ] **Step 2: Taskfile `studio:build`** — `docker build -t ${STUDIO_IMAGE:-studio-server} studio-server/` (dev :latest). `studio:deploy` — envsubst + kubectl apply `k3d/studio.yaml`+`k3d/oauth2-proxy-studio.yaml` (dev) bzw. prod-Overlay (referenziert `STUDIO_IMAGE`, `STUDIO_DOMAIN`, `WORKSPACE_NAMESPACE`, `PROD_DOMAIN`).

- [ ] **Step 3: S4-Self-Check** — `grep -n "studio:build\|studio:deploy" Taskfile.yml` → gefunden (Dockerfile/Tasks nicht orphaned).

- [ ] **Step 4: Commit**
  `git add studio-server/Dockerfile Taskfile.yml && git commit -m "feat(studio): add Dockerfile + studio:build/deploy tasks [T001002]"`

## Task A13: Keycloak Realm — `studio` Client + `/coach-access` Group

**Files:**
- Modify: `k3d/realm-workspace-dev.json` (shared)

**Interfaces:**
- Consumes: `BRETT_OIDC_SECRET`-Pattern (confidential client). Produces: Keycloak client `studio` (confidential, redirect `http://studio.localhost/oauth2/callback`, audience-mapper `studio`) + group `/coach-access` + Gerald-Mitgliedschaft. Prod-Realm via `task keycloak:sync` (keycloak-realm-sync-Skill).

- [ ] **Step 1: Client `studio` anlegen** — Mirror des `brett`-Clients (jq-Inspect wie active-sessions-hub Task 2): `clientId:'studio'`, `secret:'${STUDIO_OIDC_SECRET}'` (oder Literal per bestehender Konvention), `redirectUris:['http://studio.localhost/oauth2/callback']`, `publicClient:false`, `standardFlowEnabled:true`. Audience-Mapper für `studio` (wie arena `audience:arena`).

- [ ] **Step 2: Group `/coach-access`** — Mirror `brainstorm-access`-Shape; `path:'/coach-access'`.

- [ ] **Step 3: Gerald (`gekko`/Coach-User) Mitglied** — `users[].groups` um `/coach-access` ergänzen (append, nicht replace).

- [ ] **Step 4: JSON-Validity-Gate** — `jq empty k3d/realm-workspace-dev.json && jq '.clients[]|select(.clientId=="studio")|{clientId,redirectUris,publicClient}' k3d/realm-workspace-dev.json` → prints new client. `jq '.groups[]|select(.name=="coach-access")|.path'` → `/coach-access`.

- [ ] **Step 5: Commit**
  `git add k3d/realm-workspace-dev.json && git commit -m "feat(security): add studio Keycloak client + coach-access group [T001002]"`

## Task A14: Secrets — STUDIO_OIDC_SECRET + STUDIO_DB_URL (Schema + Seal)

**Files:**
- Modify: `environments/schema.yaml` (shared), `environments/.secrets/mentolder.yaml` (gitignored), `environments/sealed-secrets/mentolder.yaml` (via env:seal)

**Interfaces:**
- Produces: `STUDIO_OIDC_SECRET` (oauth2-proxy) + `STUDIO_DB_URL` (shared-db-Conn) + `STUDIO_DOMAIN`/`STUDIO_IMAGE`/`WHISPER_URL` als env-vars in `workspace-secrets`/ConfigMap.

- [ ] **Step 1: schema.yaml** — env_vars: `STUDIO_DOMAIN` (required:true, default_dev:'studio.localhost', validate `^[a-z0-9.-]+$`), `STUDIO_IMAGE` (default_dev 'studio-server'), `STUDIO_DB_URL` (required:false, default_dev shared-db-URL), `WHISPER_URL` (required:false, default_dev in-cluster faster-whisper). secrets: `STUDIO_OIDC_SECRET` (required:true, generate:true, length:40, extra_namespaces workspace-secrets).

- [ ] **Step 2: .secrets/mentolder.yaml** — `STUDIO_OIDC_SECRET: <openssl rand -hex 20>` (gitignored, nicht committen).

- [ ] **Step 3: Validate + Seal**
  Run: `task env:validate ENV=mentolder && task env:seal ENV=mentolder`
  Expected: validate grün; seal schreibt `STUDIO_OIDC_SECRET` in sealed-secrets/mentolder.yaml. Verify: `grep -c STUDIO_OIDC_SECRET environments/sealed-secrets/mentolder.yaml` → 1.

- [ ] **Step 4: Commit (nur schema + sealed)**
  `git add environments/schema.yaml environments/sealed-secrets/mentolder.yaml && git commit -m "feat(secrets): add STUDIO_OIDC_SECRET + STUDIO_DOMAIN/IMAGE/DB_URL schema [T001002]"`

## Task A15: k3d-Manifeste + configmap-domains + envsubst + prod-Overlay

**Files:**
- Create: `k3d/studio.yaml`, `k3d/oauth2-proxy-studio.yaml`, `prod-fleet/mentolder/studio.yaml`
- Modify: `k3d/kustomization.yaml` (shared), `k3d/configmap-domains.yaml` (shared), `prod-fleet/mentolder/kustomization.yaml` (shared), `Taskfile.yml` (shared envsubst)

**Interfaces:**
- Consumes: `STUDIO_IMAGE`, `STUDIO_DOMAIN`, `PROD_DOMAIN`, `WORKSPACE_NAMESPACE`, `STUDIO_OIDC_SECRET`, `STUDIO_DB_URL`, `KEYCLOAK_ISSUER_MENTOLDER`, `LLM_ROUTER_URL`, `WHISPER_URL`, `TLS_SECRET_NAME`.
- Produces: Deployment `studio-server` (workspace-ns, port 8092, env aus workspace-secrets + ConfigMap) + Service + IngressRoute `studio.${PROD_DOMAIN}` + oauth2-proxy `oauth2-proxy-studio` (upstream `studio-server:80`).

- [ ] **Step 1: k3d/studio.yaml** — Mirror `prod-korczewski/arena.yaml`-Struktur (Deployment+Service+IngressRoute), aber envsubst-dev: `namespace: ${WORKSPACE_NAMESPACE}`, `image: ${STUDIO_IMAGE}`, env `DB_URL` aus secretKeyRef `workspace-secrets:STUDIO_DB_URL` (oder derive), `KEYCLOAK_ISSUER_MENTOLDER: http://keycloak:8080/realms/workspace` (dev), `LLM_ROUTER_URL`, `WHISPER_URL` aus env. readiness/liveness `/healthz:8092`. IngressRoute `Host(\`studio.${PROD_DOMAIN}\`)`, tls `${TLS_SECRET_NAME}`. **S3: nur ${PROD_DOMAIN} + in-cluster Service-Names.**

- [ ] **Step 2: k3d/oauth2-proxy-studio.yaml** — 1:1 Mirror `k3d/oauth2-proxy-brett.yaml`: `--client-id=studio`, `--client-secret=$(STUDIO_OIDC_SECRET)`, `--redirect-url=http://studio.localhost/oauth2/callback`, `--upstream=http://studio-server:80`, `--cookie-name=_oauth2_proxy_studio`, `--oidc-extra-audience=studio`, `--pass-access-token=true`, `--set-xauthrequest=true`. secretKeyRef `workspace-secrets:STUDIO_OIDC_SECRET`. IngressRoute für studio.localhost→oauth2-proxy→studio-server.

- [ ] **Step 3: k3d/kustomization.yaml** — `resources:` um `- studio.yaml` + `- oauth2-proxy-studio.yaml` ergänzen.

- [ ] **Step 4: k3d/configmap-domains.yaml** — `STUDIO_DOMAIN: "studio.localhost"`, `STUDIO_IMAGE: "studio-server"`.

- [ ] **Step 5: Taskfile envsubst** — In der `workspace:deploy` envsubst-Var-Liste (Taskfile ~line 2448 + ~3759) `$STUDIO_DOMAIN $STUDIO_IMAGE` ergänzen (und `$STUDIO_DB_URL $WHISPER_URL` falls in Manifesten verwendet). Studio-Manifeste werden via `kustomize build k3d/` (bereits in der pipeline) mit envsubst gerendert.

- [ ] **Step 6: prod-fleet/mentolder/studio.yaml** — Prod-Overlay (image-digest, node-affinity hetzner, `KEYCLOAK_ISSUER_MENTOLDER: https://auth.mentolder.de/realms/workspace` — Achtung S3: in prod-manifest ist `auth.mentolder.de` ein Brand-Literal → statt dessen via `KEYCLOAK_ISSUER_MENTOLDER` env aus ConfigMap/`auth.${PROD_DOMAIN}` ableiten, NICHT hardcodieren). tls `mentolder-tls`.

- [ ] **Step 7: prod-fleet/mentolder/kustomization.yaml** — `resources:` um `- studio.yaml` ergänzen.

- [ ] **Step 8: S4-Kustomize-Gate**
  Run: `kubectl kustomize k3d/ 2>/dev/null | grep -c studio-server` → >0 (Manifest rendert + referenziert).
  Run: `kubectl kustomize prod-fleet/mentolder/ 2>/dev/null | grep -c studio-server` → >0.

- [ ] **Step 9: S3-Self-Check**
  Run: `grep -nE 'mentolder\.de|korczewski\.de' k3d/studio.yaml k3d/oauth2-proxy-studio.yaml prod-fleet/mentolder/studio.yaml | grep -v '^[0-9]*:#' || echo "S3 OK"`
  Expected: `S3 OK` (keine Brand-Literale außerhalb Kommentare). Prod-Issuer via env, nicht Literal.

- [ ] **Step 10: workspace:validate-Gate**
  Run: `task workspace:validate` → kustomize dry-run grün (Studio-Manifeste parsebar + referenziert).

- [ ] **Step 11: Commit**
  `git add k3d/studio.yaml k3d/oauth2-proxy-studio.yaml k3d/kustomization.yaml k3d/configmap-domains.yaml prod-fleet/mentolder/studio.yaml prod-fleet/mentolder/kustomization.yaml Taskfile.yml && git commit -m "feat(infra): add studio-server k3d+prod manifests, domains, envsubst [T001002]"`

---

## Workstream B — Homepage Redesign (in website/)

> Handoff: `assets/new/homepage_redesign/README.md` (autoritativ, 255 Zeilen). Hi-Fi: pixel-genau bewusst;
> Abweichungen müssen bewusst sein. Brand-agnostisch (gilt auch korczewski.de — nur Copy+Config). Daten-Helfer
> unverändert (`getEffectiveHomepage()`, `getEffectiveServices()`, `getEffectiveFaq()`, `getAvailableSlots()`).

## Task B1: Token-Abgleich in global.css + gerald.jpg Asset

**Files:**
- Modify: `website/src/styles/global.css` (189, nb, kein .css-Limit)
- Create: `website/public/gerald.jpg` (Asset-Kopie aus `assets/new/homepage_redesign/assets/gerald.jpg`)
- Modify: `website/src/config/brands/mentolder.ts` (423, nb, limit 600 → budget 177) — `avatarSrc: '/gerald.jpg'`

- [ ] **Step 1: gerald.jpg kopieren** — `cp openspec/changes/coaching-studio/assets/new/homepage_redesign/assets/gerald.jpg website/public/gerald.jpg`.

- [ ] **Step 2: global.css Token-Abgleich** — `@theme`-Block bereits brass/ink/sage (verifiziert gegen `colors_and_type.css`). Ergänze fehlende Typo-Helper-Klassen aus Handoff (`.t-eyebrow` mit ::before brass-bar, `.t-stat`, `.t-lede`, `.t-h3-serif`) falls noch nicht vorhanden. Keine Stray-Hex (nur dokumentierte brass-deep/brass-hex). Film-grain bereits vorhanden.

- [ ] **Step 3: mentolder.ts** — `avatarSrc: '/gerald.webp'` → `'/gerald.jpg'` (minimal, < 5 Zeilen Delta). Ggf. `process`-Schritte-Feld falls für Process.astro nötig (sonst inline in Komponente). Prüfen: `homepage.stats`/`whyMePoints`/`quote`/`services` bereits vorhanden → unverändert nutzen.

- [ ] **Step 4: Build-Gate** — `cd website && npm run build` → kein Fehler; Token-Klassen in Ausgabe.

- [ ] **Step 5: Commit**
  `git add website/public/gerald.jpg website/src/styles/global.css website/src/config/brands/mentolder.ts && git commit -m "feat(website): align homepage tokens + gerald portrait asset [T001002]"`

## Task B2: Navigation.svelte Refactor + NavMobile.svelte Extraktion (Budget 0)

**Files:**
- Modify: `website/src/components/Navigation.svelte` (719, **BASELINED 719 → Budget 0**)
- Create: `website/src/components/NavMobile.svelte` (NEU, limit 500)

**Interfaces:**
- Consumes: `config` (brand mark, nav links via `getEffectiveHomepage()`/nav-config), bestehendes Mobile-Menü-Verhalten. Produces: 72px sticky TopBar (blur backdrop, brand mark radial-brass, nav links, meta pill, primary CTA) + extrahiertes `NavMobile.svelte` (hamburger + mobile menu).

> **S1-Budget 0 ist der kritische Constraint.** Navigation.svelte ist auf 719 eingefroren. Der TopBar-Refactor
> MUSS netto zeilenneutral sein ODER die Datei echt verkleinern. Strategie: das bestehende Mobile-Menü + Brand-Mark-
> Markup werden nach `NavMobile.svelte`/`BrandMark.svelte` (falls noch nicht existent) extrahiert (echter Split),
> der neue TopBar-Styling-Block ersetzt alten Code. Ziel: Navigation.svelte ≤ 719 nach der Änderung (vorzugsweise
> < 719 → echte Verkleinerung, erlaubt durch Ratchet).

- [ ] **Step 1: Bestehende Struktur lesen** — `wc -l website/src/components/Navigation.svelte` (719). Identifiziere Mobile-Menü-Block + Brand-Mark-Block als Extraktionskandidaten (echter Split, kein kosmetisches Zusammenziehen).

- [ ] **Step 2: NavMobile.svelte anlegen** — extrahiere Mobile-Menü (hamburger + open/close + Link-Liste). Props: `links`, `open`, `onToggle`. Svelte 5 Runes. < 500.

- [ ] **Step 3: Navigation.svelte refactor** — neuer 72px sticky TopBar (blur backdrop, brand mark, nav links center/right, meta pill `Lüneburg · DE`, primary CTA pill); importiert `NavMobile` für ≤860px. **Netto Zeilenkonto ≤ 0**: jeder neue TopBar-Block ersetzt äquivalenten alten Block; Extraktion reduziert die Datei. Vor dem Commit `wc -l` prüfen.

- [ ] **Step 4: S1-Budget-Verifikation (PFICHT)**
  Run: `wc -l website/src/components/Navigation.svelte`
  Expected: ≤ 719 (Ratchet: Wachstum würde CI rot machen). Falls > 719 → weitere Extraktion (z.B. BrandMark in eigene `.svelte`), NICHT Baseline-Ausnahme.

- [ ] **Step 5: S2-Check** — keine Import-Zyklen (NavMobile importiert nur config/types, nicht zurück nach Navigation).

- [ ] **Step 6: Build + Type-Gate** — `cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -20` (oder `npm run build`).

- [ ] **Step 7: Commit**
  `git add website/src/components/Navigation.svelte website/src/components/NavMobile.svelte && git commit -m "feat(website): refactor Navigation topbar + extract NavMobile (line-neutral) [T001002]"`

## Task B3: Hero.svelte Refactor + Portrait.svelte

**Files:**
- Modify: `website/src/components/Hero.svelte` (266, nb, limit 500 → budget 234)
- Create: `website/src/components/Portrait.svelte` (NEU, limit 500)

**Interfaces:**
- Consumes: `config` (homepage H1/lede/CTA, `avatarSrc`, `avatarType`), `gerald.jpg`. Produces: two-col Hero (Mono-Kicker-Row, H1 Newsreader italic-brass-accent, lede, CTA-Row primary+ghost) + wiederverwendbare `<Portrait>` (Halos, Duotone-Wash, brass-Hairline, Tag-Plate, Caption-Plate).

- [ ] **Step 1: Portrait.svelte** — Props `{src, tag, name, role, meta}`. Halos (warm brass + cool ink), vertical hairline `::before`, frame `border-radius:4px`, duotone-wash `::before`, brass hairline `::after`, tag-plate (sage dot), caption-plate (3-col grid). aria `role="img"`. < 500.

- [ ] **Step 2: Hero.svelte refactor** — two-col grid `1.15fr .85fr`; Mono-Kicker-Row (44px brass bar · `Digital Coaching` · sage dot · `Führungskräfte-Beratung`); H1 `clamp(44px,6.2vw,88px)` Newsreader, italic-accent in `--brass-2`; lede 18px; CTA-Row (primary pill + ghost pill); `<Portrait src={homepage.avatarSrc} ...>`. bg-halo + film-grain (global). < 500.

- [ ] **Step 3: Budget-Gate** — `wc -l Hero.svelte` < 500 (Ziel < ~240); `Portrait.svelte` < 500.

- [ ] **Step 4: Build-Gate** — `npm run build` grün.

- [ ] **Step 5: Commit**
  `git add website/src/components/Hero.svelte website/src/components/Portrait.svelte && git commit -m "feat(website): refactor Hero + add reusable Portrait frame [T001002]"`

## Task B4: StatsStrip.astro + SlotWidget.astro Reskin

**Files:**
- Create: `website/src/components/StatsStrip.astro` (NEU, limit 400)
- Modify: `website/src/components/SlotWidget.astro` (119, nb, limit 400 → budget 281)

**Interfaces:**
- Consumes: `homepage.stats` (4 Stats: 30+, 50+, 40, KI), `getAvailableSlots()` (CalDAV). Produces: Stats+Availability-Strip (2-col grid, 4 Stat-Cells mit Newsreader-Ziffern + brass-`<em>`, Availability mit sage-pulse-dot + slot-pills).

- [ ] **Step 1: StatsStrip.astro** — 2-col grid `1.1fr .9fr`; links 4 Stat-Cells (`repeat(4,1fr)`, --line divider); rechts Availability (sage pulsing dot via `@keyframes pulse` aus global.css, title „Nächste freie Termine", sub, slot-pills aus `getAvailableSlots()`). Stat-Number Newsreader 44px, accent chars `<em>` brass non-italic. < 400.

- [ ] **Step 2: SlotWidget.astro reskin** — Slot-Pills: Geist Mono 12px, `--line-2` border, `--fg-soft`, hover → brass. Bestehende CalDAV-Logik unverändert, nur Presentation. ≤ 400.

- [ ] **Step 3: Budget-Gate** — `wc -l StatsStrip.astro` < 400; `SlotWidget.astro` ≤ 400.

- [ ] **Step 4: Commit**
  `git add website/src/components/StatsStrip.astro website/src/components/SlotWidget.astro && git commit -m "feat(website): add StatsStrip + reskin SlotWidget pills [T001002]"`

## Task B5: ServiceRow.svelte (ersetzt ServiceCard.svelte) + ServiceCard entfernen

**Files:**
- Create: `website/src/components/ServiceRow.svelte` (NEU, limit 500)
- Delete: `website/src/components/ServiceCard.svelte` (78, nb) — wird ersetzt

**Interfaces:**
- Consumes: `getEffectiveServices()` (homepage.services: 01/02/03 mit title/desc/features/price/unit/meta). Produces: numbered Rows (grid `80px 1fr 1.6fr 220px 140px`, brass-dot bullets, price-block mit border-left, circle „Mehr →"-Icon das bei row-hover brass-fillt). Responsive ≤1000px → 3-col.

- [ ] **Step 1: ServiceRow.svelte** — Svelte 5; map über services; number Geist Mono, title Newsreader 28px + sage meta-label, desc + brass-dot bullet list, price-block, „Mehr →" circle icon button (currentColor SVG, kein Root width/height). < 500.

- [ ] **Step 2: ServiceCard.svelte entfernen** — `git rm website/src/components/ServiceCard.svelte`. Alle Importe von ServiceCard auf ServiceRow umleiten (in index.astro Task B10).

- [ ] **Step 3: S4-Check** — `grep -rn "ServiceCard" website/src/` → keine Referenzen mehr (außer ggf. Historie). ServiceRow wird in index.astro importiert (Task B10).

- [ ] **Step 4: Budget-Gate** — `wc -l ServiceRow.svelte` < 500 (Ziel < ~220).

- [ ] **Step 5: Commit**
  `git add website/src/components/ServiceRow.svelte && git rm website/src/components/ServiceCard.svelte && git commit -m "feat(website): replace ServiceCard with ServiceRow [T001002]"`

## Task B6: WhyMe.svelte + QuoteCard.svelte

**Files:**
- Create: `website/src/components/WhyMe.svelte` (NEU, limit 500), `website/src/components/QuoteCard.svelte` (NEU, limit 500)

**Interfaces:**
- Consumes: `homepage.whyMePoints` (3 Punkte: number/title/desc), `homepage.quote`/`quoteName`. Produces: Why-Me-Sektion (--ink-850 bg, eyebrow + H2 italic-accent + lede + points-list 2-col `56px 1fr`) + Quote-Card (border-radius 22, brass-radial bg, dekoratives italic-Öffnungszeichen, blockquote Newsreader italic, byline mit brass-gradient avatar „GK").

- [ ] **Step 1: WhyMe.svelte** — eyebrow + H2 (italic `--brass-2`), lede 20px, points-list (top-border, 26px padding, Geist 17px h4 + 14px mute p). < 500.

- [ ] **Step 2: QuoteCard.svelte** — container 22px radius, 1px `--line-2`, brass-radial bg + `--ink-800`; dekoratives `"` Newsreader italic 120px brass opacity .4 (absolut); blockquote 26px italic; byline 44px brass-gradient avatar + name/role. < 500.

- [ ] **Step 3: Budget-Gate** — beide < 500.

- [ ] **Step 4: Commit**
  `git add website/src/components/WhyMe.svelte website/src/components/QuoteCard.svelte && git commit -m "feat(website): add WhyMe + QuoteCard components [T001002]"`

## Task B7: Process.astro

**Files:**
- Create: `website/src/components/Process.astro` (NEU, limit 400)

**Interfaces:**
- Consumes: 4 Prozess-Schritte (Erstgespräch/Klarheit/Begleitung/Transfer) — inline oder aus config. Produces: 4-Schritt-Rail (2-col `1fr 2.5fr`, brass line + dots, num `01 — Erstgespräch`, h4, p).

- [ ] **Step 1: Process.astro** — section chrome (padding 80px, top/bottom --line, gradient bg); 2-col grid; right: `repeat(4,1fr)` rail mit absoluter `::before` brass-line (opacity .4), 14×14 dots (ink bg, brass border, inner 3px brass), Geist Mono num, Geist 15px h4, Geist 13px mute p. Copy aus Handoff §5. < 400.

- [ ] **Step 2: Budget-Gate** — `wc -l Process.astro` < 400 (Ziel < ~160).

- [ ] **Step 3: Commit**
  `git add website/src/components/Process.astro && git commit -m "feat(website): add Process section [T001002]"`

## Task B8: CallToAction.svelte Restyle + Layout.astro Footer

**Files:**
- Modify: `website/src/components/CallToAction.svelte` (182, nb, limit 500 → budget 318)
- Modify: `website/src/layouts/Layout.astro` (103, nb, limit 400 → budget 297)

**Interfaces:**
- Consumes: `config` (CTA copy, contact email). Produces: CTA-Sektion (zentriert, brass-glow `::before`, italic H2) + Footer (4-col grid, mono heads, brass-hover, foot-bottom).

- [ ] **Step 1: CallToAction.svelte restyle** — padding 130px, `::before` radial brass-glow ellipse; zentriert max-width 760; eyebrow „Kostenloses Erstgespräch"; H2 `clamp(36px,4.6vw,60px)` Newsreader italic-accent; paragraph; button-row (primary „Termin vorschlagen" + ghost „info@…"). < 500.

- [ ] **Step 2: Layout.astro footer** — 4-col grid `1.4fr repeat(3,1fr)` (brand+tagline, Kontakt, Angebote, Rechtliches); h5 Geist Mono 11px brass; links Geist 14px mute → fg hover; foot-bottom (`© 2026 Mentolder …` / `Gestaltet in Lüneburg · DE`). **S3: keine Brand-Domain-Literale** — Links via config/stammdaten, nicht `mentolder.de` hardcodiert. ≤ 400.

- [ ] **Step 3: Budget-Gate** — `wc -l CallToAction.svelte` < 500; `Layout.astro` ≤ 400 (Ziel ~230).

- [ ] **Step 4: S3-Self-Check** — `grep -nE 'mentolder\.de|korczewski\.de' website/src/layouts/Layout.astro website/src/components/CallToAction.svelte | grep -v '^[0-9]*:#' || echo "S3 OK"`.

- [ ] **Step 5: Commit**
  `git add website/src/components/CallToAction.svelte website/src/layouts/Layout.astro && git commit -m "feat(website): restyle CTA + redesign footer [T001002]"`

## Task B9: index.astro — Sektionen komponieren (Budget 58)

**Files:**
- Modify: `website/src/pages/index.astro` (342, nb, limit 400 → **budget 58**)

**Interfaces:**
- Consumes: alle neuen/überarbeiteten Komponenten (Navigation, Hero+Portrait, StatsStrip+SlotWidget, ServiceRow, WhyMe+QuoteCard, Process, CallToAction, Layout footer) + `getEffectiveHomepage()`. Produces: die komponierte Homepage in Sektions-Reihenfolge 0→7.

> **Budget 58 ist knapp.** index.astro darf auf 400 wachsen (342+58). Strategie: Sektionen werden als
> Komponenten-Importe komponiert (nicht inlineMarkup) — jede Sektion ist EIN `<Component />`-Aufruf. Alte inline-
> Sektionen (die 342 Zeilen) werden durch die Komponenten-Aufrufe ersetzt → netto sollte die Datei deutlich
> UNTER 400 landen. Falls dennoch > 400 → weitere Sektion auslagern (z.B. Offers-Wrapper).

- [ ] **Step 1: Sektionen komponieren** — Reihenfolge: `<Navigation/>` → `<Hero/>` (mit `<Portrait/>`) → `<StatsStrip/>` → `<section id="angebote"><ServiceRow/></section>` → `<WhyMe/>`+`<QuoteCard/>` → `<Process/>` → `<CallToAction/>` (id=termin) → Footer (in Layout). Daten via `getEffectiveHomepage()`/`getEffectiveServices()`/`getAvailableSlots()` (Astro frontmatter, unverändert).

- [ ] **Step 2: S3-Check** — keine Brand-Domain-Literale in index.astro (S3).

- [ ] **Step 3: Budget-Gate (PFICHT)**
  Run: `wc -l website/src/pages/index.astro`
  Expected: < 400 (Ziel ~120–200 durch Komponenten-Komposition). Falls ≥ 400 → Sektion auslagern.

- [ ] **Step 4: Build-Gate** — `cd website && npm run build` → Homepage rendert, keine TS/Astro-Fehler.

- [ ] **Step 5: Commit**
  `git add website/src/pages/index.astro && git commit -m "feat(website): compose redesigned homepage sections [T001002]"`

## Task B10: Homepage-Tests (vitest erweitern / visuelle Verifikation)

**Files:**
- Modify/Create: bestehende vitest-Tests für berührte Komponenten ERWEITERN (zuerst suchen: `ls website/src/components/*.test.ts`); nur falls keine existieren NEUE anlegen.

- [ ] **Step 1: Test-Inventory prüfen** — `grep -l "Navigation\|Hero\|ServiceCard\|CallToAction" website/src/components/*.test.ts 2>/dev/null`. Bestehende Tests an neuen Props/Struktur anpassen.

- [ ] **Step 2: Smoke-Tests** —Portrait rendert mit Props; ServiceRow mapt services; WhyMe/QuoteCard rendern whyMePoints/quote; Navigation topbar sticky + NavMobile toggle. (Svelte 5 Runes-Testing via @testing-library/svelte, schon in devDeps.)

- [ ] **Step 3: Test ausführen**
  Run: `cd website && npx vitest run` (oder gezielt die berührten Test-Dateien).
  Expected: PASS.

- [ ] **Step 4: Commit**
  `git add website/src/components/*.test.ts && git commit -m "test(website): update homepage component tests for redesign [T001002]"`

---

## Task C: Finale Verifikation (PFLICHT)

**Files:** none (verification only).

> Zwingendes Schluss-Gate. Jeder Befehl muss grün sein, bevor der PR öffnet. (Hinweis: `openspec validate` hat
> vorbestehende FAILs in ANDEREN Changes ohne specs/-Dir — nicht von diesem Plan verursacht; coaching-studio
> selbst hat eine gültige specs/coaching-studio.md.)

- [ ] **Step 1: Zielgerichtete Tests für die geänderten Domains**
  ```bash
  task test:changed
  ```
  Expected: PASS — Vitest `--changed` (pickt studio-server-Tests + website Homepage-Tests), BATS-Auswahl + `quality:check`.

- [ ] **Step 2: Studio-Service-Tests (explizit, da neues Modul)**
  ```bash
  cd studio-server && npx vitest run
  ```
  Expected: PASS — alle studio-server Unit/Route-Tests grün.

- [ ] **Step 3: Studio-Build**
  ```bash
  cd studio-server && npm run build
  ```
  Expected: `dist/index.js` + `dist/public/index.html` + Assets; kein TS-Fehler.

- [ ] **Step 4: Website-Build + Type-Check**
  ```bash
  npm --prefix website run build
  ```
  Expected: Homepage rendert ohne Fehler.

- [ ] **Step 5: Manifest-Validierung (Studio + Homepage-Infra)**
  ```bash
  task workspace:validate
  ```
  Expected: kustomize dry-run grün (Studio-Manifeste parsebar + in kustomization referenziert → S4).

- [ ] **Step 6: Frische generierte Artefakte aktualisieren**
  ```bash
  task freshness:regenerate
  ```
  Expected: regeneriert `website/src/data/test-inventory.json` (inkl. neuer Studio- + Homepage-Tests) + weitere Artefakte. Geänderte Artefakte stagen.

- [ ] **Step 7: Frische- + Qualitäts-Ratchet (CI-Äquivalent — S1–S4 + Baseline-Assertion)**
  ```bash
  task freshness:check
  ```
  Expected: PASS — keine S1-Zeilenlimit-Regressionen (insb. Navigation.svelte ≤ 719, index.astro < 400, studio-Dateien unter statischen Limits), keine S2-Import-Zyklen (studio-server-Graph), keine S3-Brand-Domain-Literale (Task A15/B8 S3-Self-Checks), keine S4-Orphans (Studio-Manifeste referenziert), `baseline.json`-Key-Count nicht gewachsen (98, keine neuen Baseline-Einträge).

- [ ] **Step 8: Test-Inventar regenerieren + committen (nach Test-Änderungen)**
  ```bash
  task test:inventory
  git add website/src/data/test-inventory.json docs/code-quality/ docs/generated/ 2>/dev/null || true
  git status --short
  git commit -m "chore: regenerate freshness + test-inventory for coaching-studio [T001002]" || echo "nichts zu regenerieren"
  ```

- [ ] **Step 9: OpenSpec-Validate (coaching-studio- eigener Check)**
  ```bash
  bash scripts/openspec.sh validate 2>&1 | grep -E "coaching-studio|openspec validate: OK"
  ```
  Expected: coaching-studio taucht NICHT in FAIL-Liste auf (eigene specs/coaching-studio.md ist valide). Vorbestehende FAILs anderer Changes (fehlende specs/-Dirs) sind nicht Teil dieses Plans.

- [ ] **Step 10: S3-Final-Sweep über alle geänderten Code-Dateien**
  ```bash
  git diff --name-only origin/main | grep -E '\.(ts|tsx|svelte|astro|yaml)$' | xargs grep -nE 'mentolder\.de|korczewski\.de' 2>/dev/null | grep -v '^[^:]*:[0-9]*:#' || echo "S3 final OK"
  ```
  Expected: `S3 final OK` (keine Brand-Literale in geändertem Code außerhalb Kommentaren).

---

## Self-Review (gegen die Spec geprüft)

**Anforderungs-Abdeckung (§1–§8) — jeder Abschnitt mappt auf Tasks:**
- §1 Sessions (mehrere/Kunde, pausierbar, kopierbar als Vorlage, Alt-vs-Neu-Vergleich, Verlauf dauerhaft) → Task A4 (repo: createSession/updateSessionStatus/copySessionAsTemplate/completeSession), A5 (sessions-Routen), A11 (CompareView), A7 (Export = dauerhafter Verlauf).
- §2 Profil/Daten (zentrale DB, genau 1 KI-Profil, admin-erweiterbar, Checkbox-gated, nur active in KI-Anfrage) → Task A2 (`studio.profiles` + `studio.standard_profile_fields`), A4 (repo: upsertProfile/Standard-CRUD), A5 (profile-Routen + admin-Routen), A9 (ProfileEditor), A11 (AdminArea). Zentrale DB via shared-db `studio.*` (Kern-Entscheidung 1).
- §3 10 Ebenen + Standard-Prompts (Admin editierbar, pro Session anpassbar, Reset) → Task A2 (`standard_levels` + `session_levels.prompt_is_default`), A4 (repo: upsertLevel/Reset), A5 (levels-Routen + admin-Routen), A10 (PromptEditor + ResetSwitch), A11 (AdminArea-Tab Ebenen).
- §4 Zwischenablage (leert nach Senden + Ebenenwechsel) → Task A10 (Workspace: switchLevel+send leeren clip), A4 (clipboard in session_levels JSONB).
- §5 Speicher-Highlighting (Zielsetzungen E05 + Vereinbarungen E09, Export inkludiert) → Task A10 (WorkspaceRail HIGHLIGHT_LEVELS=[5,9]), A7 (Export-Sektion), A11 (Export.tsx), B-Konstanten (constants.ts)..constants.ts).
- §6 Präsentationsfenster (separates Fenster, Bildschirmfreigabe/Zweitmonitor) → Task A11 (Presentation.tsx `/present`-Route, window.open), A8 (App-Routing).
- §7 Coach-Mic only (Transkription, abhörbar/löschbar/ersetzbar, editierbar vor Senden) → Task A6 (whisper + transcribe-Route), A10 (MicDock: idle/recording/review + Abspielen/Ersetzen/Löschen/Übernehmen).
- §8 Übersetzung + TTS (DE ∥ Zielsprache, min. fa/ar/tr/en/fr, RTL, Vorlesen) → Task A6 (llm translate), A8 (constants TARGET_LANGS), A10 (TranslationPanel: DE∥target, RTL, SpeechSynthesis TTS).

**Architektur-Entscheidungen durchgesetzt:**
- Studio = eigener Service/Container (arena-Pattern) → Tasks A1–A12 (studio-server/).
- Homepage in website/ → Tasks B1–B10.
- Shared Design-Tokens → A8 (tokens.css port) + B1 (global.css Abgleich).
- Kein LiveKit, kein Client-Audio → A6 (nur coach-mic whisper), A10 (MicDock), A11 (Presentation via Nextcloud Talk extern).

**S1-Budgets konserviert:**
- Navigation.svelte Budget 0 → Task B2 plant echte Extraktion (NavMobile) + netto-zeilenneutralen Refactor mit PFICHT-wc-Check ≤ 719.
- index.astro Budget 58 → Task B9 komponiert via Komponenten (kein inlineMarkup) → deutlich < 400.
- Alle studio-server .tsx < 400 / .ts < 600 → pro-aktive Sub-Komponenten-Splits (Workspace, ggf. AdminArea).
- Baseline-Key-Count 98 darf nicht wachsen → Plan fügt KEINE Baseline-Einträge hinzu (nicht-baselined neue Dateien fallen unter statische Limits).

**S2/S3/S4 durchgesetzt:**
- S2: studio-Helper (llm/client, db/repo, auth/jwt) pure Module; SPA lib/api pure Fetch-Schicht. Keine Rück-Imports.
- S3: Hosts via `${PROD_DOMAIN}`/configmap/Env; Issuer via `KEYCLOAK_ISSUER_MENTOLDER` env; SPA same-origin; LLM/Whisper via Env. S3-Self-Checks in A15 + B8 + final C Step 10.
- S4: k3d/studio.yaml + oauth2-proxy-studio.yaml in kustomization (A15 Step 3); prod-overlay in prod-fleet/mentolder/kustomization (A15 Step 7); Dockerfile via Taskfile studio:build/deploy (A12); routes via routes/index.ts (A5). S4-Kustomize-Gate in A15 Step 8.

**Finaler Verifikations-Task (C)** enthält verbindlich: `task test:changed` (C1), `task freshness:regenerate` (C6), `task freshness:check` (C7) + `task test:inventory` + Commit (C8) + `task workspace:validate` (C5). Erfüllt die Plan-Quality-Gates-Pflichtlektüre.

**Out-of-scope respektiert:** Systembrett, Coaching Vertrag, Art-Library-Ingestion, Avatare/Sidekick-Productionisation, korczewski-Studio-Deploy, Cluster-TTS, LiveKit-Client-Audio — alle in Folge-Tickets verwiesen, NICHT in diesem Plan.

**Typ-Konsistenz:** Studio-Typen (`Client`, `Profile`, `Session`, `Level`, `StandardLevel`, `ProfileField`, `TargetLang`) definiert in `web/src/lib/types.ts` (A8) und durch `repo.ts` (A4) → routes (A5/A6/A7) → api.ts (A8) → Komponenten (A9–A11) konsistent geteilt. Endpoint-Pfade (`/api/clients`, `/api/sessions/:id/levels/:n`, `/api/llm/answer`, `/api/transcribe`, `/api/sessions/:id/export`) stimmen zwischen routes + api.ts + Komponenten überein.
