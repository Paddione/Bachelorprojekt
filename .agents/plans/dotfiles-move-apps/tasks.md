---
title: "dotfiles-move-apps — Implementation Plan"
ticket_id: T901492
domains: [dev-tooling, dotfiles, sdlc-console, websites]
status: draft
file_locks: []
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dotfiles-move-apps — Implementation Plan

SDLC-Console und Massagen-Surface werden per Split aus dem Website-Monolithen
(`components/website`, Multi-Brand) gelöst und ziehen mit Ticket-DB-Tooling,
kuratierten Scripts, `mentolder-web`, k3d-Manifesten und Image-Build nach
Dotfiles (`~/apps/`, `~/scripts/`, `~/mcp-servers/`, neue Dotfiles-CI).
Gemeinsam genutzter Website-Code wird als npm-Workspace-Paket
`@apps/website-shared` extrahiert statt dupliziert. `ticket.sh` bekommt eine
DB-Umschaltung (Default Fleet). Skills, Taskfiles, CI-Workflows und Guards in
Bachelorprojekt werden auf die neuen Pfade repariert.

_Ticket: T901492. Kein ADR-Vorgänger (Prior-Art-Suche ohne Treffer). Remote
`Paddione/dotfiles` für CI und Zweit-Checkout verifiziert._

## File Structure

| Gruppe | Umfang | Maßnahme |
|---|---|---|
| SDLC-Code unter `components/website/src/` (drei Dirs plus ein CSS, rund 200 Dateien) | 29k Zeilen, Entfall im Repo | Split nach `~/apps/sdlc-console/` als eigene Astro-App |
| k3d-Manifeste (`k3d/sdlc-stack/`, drei `k3d/dev-stack`-Dateien) plus Build-Workflow | Entfall im Repo | Umzug nach `~/apps/sdlc-console/deploy/` und Dotfiles-CI |
| Massage-Content, Brand-Config, Brand-Test | Entfall im Repo | Umzug nach `~/apps/massagen/` (Content-Paket) |
| Shared-Kandidaten (neun Lib-/Test-Dateien plus `src/layouts/`) | Entfall im Repo | Extraktion nach `~/apps/website-shared/` |
| Ticket-Tooling (`scripts/ticket*`, `migrate*`, `vda/`, `datamodel/`, `migrations/`, `ticket-mcp/`, `ticket-mcp-node/`) | 14k Zeilen, Entfall im Repo | Umzug nach `~/scripts/` und `~/mcp-servers/ticket/`, dazu Env-Switch in `ticket.sh` |
| Devflow-/Agent-/SDLC-Scripts plus zwei MCP-Server | Entfall im Repo | Umzug nach `~/scripts/`, `~/mcp-servers/devflow/`, `~/mcp-servers/task-runner/` |
| Sieben ungetrackte Base-Scripts plus `scripts/pxe/`, `scripts/cloud-env/` | 620 Zeilen Base-Anteil | Konsolidierung nach `~/scripts/`, Whitelist in `~/.gitignore` |
| `components/mentolder-web/` | Entfall im Repo | Komplett-Umzug nach `~/apps/mentolder-web/` |
| 171 Website-Importer der umziehenden Module plus `package.json`, `astro.config.mjs` | Import-Repair im Repo | Umschreibung auf Workspace-Pakete, `/sdlc/`-Routen abkoppeln |
| 103 Skill-/Doku-/Taskfile-/CI-Dateien mit Script-Referenzen | Pfad-Rewrite im Repo | Aufrufe zeigen auf `~/scripts/`, CI bekommt Zweit-Checkout |
| `tests/spec/repo-structure/inventory-registered.bats` | Guard-Anpassung im Repo | Inventar auf neues Layout bringen |
| `docs/adr/ADR-013-dotfiles-move.md` | neu | Split-Entscheidung festhalten |
| `tests/spec/dotfiles-move/locations.bats`, `tests/spec/dotfiles-move/helpers.bash` | neu | Lage-Guards (Rot zuerst, dann Grün) |

S1-Notizen: Alle Entfall-Dateien schrumpfen das Repo und sind Ratchet-neutral.
`scripts/ticket.sh` (1012 Zeilen, `.sh`-Schwelle 800, nicht-baselined) zieht
nach Dotfiles um (dort kein S1-Gate); die Env-Switch-Änderung bleibt trotzdem
minimal. `components/website/src/middleware.ts` (33 Zeilen, nicht-baselined,
Schwelle ist das `.ts`-Limit) verliert nur seinen `/sdlc/`-Zweig. Neue Dateien
in Dotfiles sind S1-ungated; neue `.bats`/`.md`-Dateien im Repo sind
extensions-ungated. Breiter Split statt vieler Klein-Edits: der Plan verlagert
ganze Verzeichnisse und repariert Importe mechanisch.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-sdlc-console.md | Console-Split | `components/website/src/pages/sdlc/**`, `components/website/src/components/sdlc/**`, `components/website/src/lib/sdlc/**`, `components/website/src/styles/sdlc-leitstand.css`, `k3d/sdlc-stack/**`, `k3d/dev-stack/sdlc-console.yaml`, `k3d/dev-stack/sdlc-console-rbac.yaml`, `k3d/dev-stack/sdlc-console-secrets.yaml`, `.github/workflows/build-sdlc-console.yml`, `~/apps/sdlc-console/package.json`, `~/apps/sdlc-console/astro.config.mjs`, `~/apps/sdlc-console/tsconfig.json`, `~/apps/sdlc-console/Dockerfile`, `~/apps/sdlc-console/README.md`, `~/apps/sdlc-console/src/**`, `~/apps/sdlc-console/deploy/**`, `~/.github/workflows/build-sdlc-console.yml` | p9 |
| p2 | tasks.d/p2-massagen.md | Massagen-Paket | `components/website/content/massage/**`, `content/massage/**`, `components/website/src/config/brands/massage.ts`, `components/website/src/lib/__tests__/massage-brand.test.ts`, `~/apps/massagen/package.json`, `~/apps/massagen/README.md`, `~/apps/massagen/content/**`, `~/apps/massagen/config/**`, `~/apps/massagen/tests/**` | p9 |
| p3 | tasks.d/p3-website-shared.md | Shared-Extrakt | `components/website/src/lib/content.ts`, `components/website/src/lib/content-publish.ts`, `components/website/src/lib/content-bundle.ts`, `components/website/src/lib/content.test.ts`, `components/website/src/lib/__tests__/content-publish.test.ts`, `components/website/src/lib/__tests__/content-bundle.test.ts`, `components/website/src/lib/__tests__/booking-availability.test.ts`, `components/website/src/lib/admin/content-client.ts`, `components/website/src/lib/admin/content-client.test.ts`, `components/website/src/layouts/**`, `~/apps/package.json`, `~/apps/website-shared/package.json`, `~/apps/website-shared/src/**` | p9 |
| p4 | tasks.d/p4-ticket-tooling.md | Ticket-Umzug | `scripts/ticket.sh`, `scripts/ticket-attach.sh`, `scripts/ticket-reclaim.sh`, `scripts/ticket-status-validate.sh`, `scripts/tickets-sunset.mjs`, `scripts/tickets-sunset-audit.mjs`, `scripts/ticket-db-schema.sql`, `scripts/migrate.sh`, `scripts/migrate-db.mjs`, `scripts/migrate-lib.sh`, `scripts/migrate-bugs-to-tickets.mjs`, `scripts/migrate-projects-to-tickets.mjs`, `scripts/migrate-homepage-blocks.mjs`, `scripts/migrate-eur-on-payment.ts`, `scripts/migrate-superpowers.sql`, `scripts/vda.sh`, `scripts/vda/**`, `scripts/datamodel/**`, `scripts/migrations/**`, `scripts/ticket-mcp/**`, `scripts/ticket-mcp-node/**`, `~/scripts/ticket.sh`, `~/scripts/ticket-attach.sh`, `~/scripts/ticket-reclaim.sh`, `~/scripts/ticket-status-validate.sh`, `~/scripts/tickets-sunset.mjs`, `~/scripts/tickets-sunset-audit.mjs`, `~/scripts/ticket-db-schema.sql`, `~/scripts/migrate.sh`, `~/scripts/migrate-db.mjs`, `~/scripts/migrate-lib.sh`, `~/scripts/migrate-bugs-to-tickets.mjs`, `~/scripts/migrate-projects-to-tickets.mjs`, `~/scripts/migrate-homepage-blocks.mjs`, `~/scripts/migrate-eur-on-payment.ts`, `~/scripts/migrate-superpowers.sql`, `~/scripts/vda.sh`, `~/scripts/vda/**`, `~/scripts/datamodel/**`, `~/scripts/migrations/**`, `~/scripts/ticket-mcp/**`, `~/mcp-servers/ticket/**` | p9 |
| p5 | tasks.d/p5-devflow-agent-scripts.md | Tooling-Umzug | `scripts/devflow-build-loop.sh`, `scripts/devflow-ci-watch.sh`, `scripts/devflow-post-merge-deploy.sh`, `scripts/devflow-post-merge-finalize.sh`, `scripts/devflow-post-merge-ticket-closure.sh`, `scripts/devflow-verify.sh`, `scripts/devflow/**`, `scripts/sdlc-auth-mode.sh`, `scripts/sdlc-sync-oidc-secret.sh`, `scripts/sdlc-cockpit-smoke.mjs`, `scripts/sdlc/**`, `scripts/agent-collision.sh`, `scripts/agent-escalate.sh`, `scripts/agent-lock-activity.sh`, `scripts/agent-lock-guards.sh`, `scripts/agent-lock-identity.sh`, `scripts/agent-lock-merged.sh`, `scripts/agent-lock-reap.sh`, `scripts/agent-lock.sh`, `scripts/agent-model-select.sh`, `scripts/agent-msg.sh`, `scripts/agent-orchestrator.sh`, `scripts/agent-push.sh`, `scripts/agent-tmux-start.sh`, `scripts/agent-guide/**`, `scripts/tmux/**`, `scripts/vim/**`, `scripts/devflow-mcp/**`, `scripts/mcp-task-runner/**`, `~/scripts/devflow-build-loop.sh`, `~/scripts/devflow-ci-watch.sh`, `~/scripts/devflow-post-merge-deploy.sh`, `~/scripts/devflow-post-merge-finalize.sh`, `~/scripts/devflow-post-merge-ticket-closure.sh`, `~/scripts/devflow-verify.sh`, `~/scripts/devflow/**`, `~/scripts/sdlc-auth-mode.sh`, `~/scripts/sdlc-sync-oidc-secret.sh`, `~/scripts/sdlc-cockpit-smoke.mjs`, `~/scripts/sdlc/**`, `~/scripts/agent-collision.sh`, `~/scripts/agent-escalate.sh`, `~/scripts/agent-lock-activity.sh`, `~/scripts/agent-lock-guards.sh`, `~/scripts/agent-lock-identity.sh`, `~/scripts/agent-lock-merged.sh`, `~/scripts/agent-lock-reap.sh`, `~/scripts/agent-lock.sh`, `~/scripts/agent-model-select.sh`, `~/scripts/agent-msg.sh`, `~/scripts/agent-orchestrator.sh`, `~/scripts/agent-push.sh`, `~/scripts/agent-tmux-start.sh`, `~/scripts/agent-guide/**`, `~/scripts/tmux/**`, `~/scripts/vim/**`, `~/mcp-servers/devflow/**`, `~/mcp-servers/task-runner/**`, `~/.config/muse/settings.json`, `~/.codex/config.toml`, `~/.claude/settings.json`, `~/.config/opencode/opencode.jsonc`, `~/.gemini/config/mcp_config.json` | p9 |
| p6 | tasks.d/p6-base-consolidation.md | Base-Konsolidierung | `~/bootstrap.sh`, `~/cloud-setup.sh`, `~/pxe-start.sh`, `~/sync-windows.sh`, `~/vault-cleanup.sh`, `~/vault-import.sh`, `~/wt-warden-cleanup.sh`, `scripts/pxe/**`, `scripts/cloud-env/**`, `~/scripts/bootstrap.sh`, `~/scripts/cloud-setup.sh`, `~/scripts/pxe-start.sh`, `~/scripts/sync-windows.sh`, `~/scripts/vault-cleanup.sh`, `~/scripts/vault-import.sh`, `~/scripts/wt-warden-cleanup.sh`, `~/scripts/pxe/**`, `~/scripts/cloud-env/**`, `~/.gitignore` | p9 |
| p7 | tasks.d/p7-mentolder-web.md | Frontend-Umzug | `components/mentolder-web/**`, `~/apps/mentolder-web/**` | p9 |
| p8 | tasks.d/p8-remainder-repair.md | Rest-Reparatur | `components/website/src/components/DependencyGraph.svelte`, `components/website/src/components/Footer.astro`, `components/website/src/components/PlanningOffice.svelte`, `components/website/src/components/PlanningOfficeTriage.svelte`, `components/website/src/components/PortalSidekick.svelte`, `components/website/src/components/PortalSidekick.test.ts`, `components/website/src/components/QaModal.svelte`, `components/website/src/components/SystemtestReplayDrawer.svelte`, `components/website/src/components/TicketQuickCreate.svelte`, `components/website/src/components/TicketQuickEdit.svelte`, `components/website/src/components/admin/AdminShortcuts.svelte`, `components/website/src/components/admin/AdminSidebarNav.astro`, `components/website/src/components/admin/ArchitekturGraph.svelte`, `components/website/src/components/admin/GrillingStepper.svelte`, `components/website/src/components/admin/GrillingStepper.test.ts`, `components/website/src/components/admin/PromptLibraryManager.svelte`, `components/website/src/components/admin/SuggestionBar.test.ts`, `components/website/src/components/admin/TicketActionBar.svelte`, `components/website/src/components/admin/TicketAttachmentsPanel.svelte`, `components/website/src/components/admin/TicketAttachmentsPanel.test.ts`, `components/website/src/components/admin/TicketDetailSections.astro`, `components/website/src/components/admin/coaching/CoachingSettings.svelte`, `components/website/src/components/admin/framework/SchemaEditor.svelte`, `components/website/src/components/admin/ops/DatenbankTab.svelte`, `components/website/src/components/admin/ops/DienstTab.svelte`, `components/website/src/components/admin/ops/DnsZertTab.svelte`, `components/website/src/components/admin/ops/LogsTab.svelte`, `components/website/src/components/admin/platform/AssetTicketDrawer.svelte`, `components/website/src/components/admin/platform/BackupStatusCard.svelte`, `components/website/src/components/admin/platform/HardwareTab.svelte`, `components/website/src/components/admin/platform/HealthTab.svelte`, `components/website/src/components/admin/platform/SoftwareTab.svelte`, `components/website/src/components/assistant/AiQualitySidekickView.svelte`, `components/website/src/components/assistant/CockpitSidekickView.svelte`, `components/website/src/components/assistant/CockpitSidekickView.test.ts`, `components/website/src/components/assistant/LlmProxyView.svelte`, `components/website/src/components/assistant/LogsSidekickView.svelte`, `components/website/src/components/assistant/PipelineSidekickView.svelte`, `components/website/src/components/assistant/PipelineSidekickView.test.ts`, `components/website/src/components/assistant/SupportView.svelte`, `components/website/src/components/kore/KoreHomepage.svelte`, `components/website/src/components/leitstand/ApiKatalog.svelte`, `components/website/src/components/leitstand/DeckLeiste.svelte`, `components/website/src/components/leitstand/HelpOverlay.svelte`, `components/website/src/components/leitstand/Kontextzone.svelte`, `components/website/src/components/leitstand/KpiGrid.svelte`, `components/website/src/components/leitstand/LeitstandStatusband.svelte`, `components/website/src/components/leitstand/decks/DeckKi.svelte`, `components/website/src/components/leitstand/decks/DeckPlattform.svelte`, `components/website/src/components/leitstand/decks/DeckQualitaet.svelte`, `components/website/src/components/leitstand/decks/DeckWissen.svelte`, `components/website/src/config/index.ts`, `components/website/src/content-schema/index.ts`, `components/website/src/integrations/build-target.mjs`, `components/website/src/integrations/build-target.test.ts`, `components/website/src/lib/admin/nav-items.test.ts`, `components/website/src/lib/admin/nav-items.ts`, `components/website/src/lib/logging/error-report.test.ts`, `components/website/src/lib/logging/error-report.ts`, `components/website/src/lib/login-redirect.test.ts`, `components/website/src/lib/prompt-insert.test.ts`, `components/website/src/lib/prompt-insert.ts`, `components/website/src/lib/questionnaire-db/scoring.test.ts`, `components/website/src/lib/questionnaire-db/scoring.ts`, `components/website/src/lib/stores/cockpit-floor-store.test.ts`, `components/website/src/lib/stores/cockpit-floor-store.ts`, `components/website/src/lib/systemtest/recorder.test.ts`, `components/website/src/lib/systemtest/recorder.ts`, `components/website/src/lib/tickets/status.ts`, `components/website/src/lib/tickets/suggest-prompt.ts`, `components/website/src/lib/tickets/tables/tickets.ts`, `components/website/src/lib/tickets/transition.ts`, `components/website/src/lib/website-db.ts`, `components/website/src/middleware.test.ts`, `components/website/src/middleware.ts`, `components/website/src/middleware/redirect-map.test.ts`, `components/website/src/middleware/redirect-map.ts`, `components/website/src/pages/404.astro`, `components/website/src/pages/[service].astro`, `components/website/src/pages/admin.astro`, `components/website/src/pages/admin/[clientId].astro`, `components/website/src/pages/admin/asset-generation.astro`, `components/website/src/pages/admin/assets.astro`, `components/website/src/pages/admin/billing/elster.astro`, `components/website/src/pages/admin/buchhaltung.astro`, `components/website/src/pages/admin/clients.astro`, `components/website/src/pages/admin/coaching/projekte/[id].astro`, `components/website/src/pages/admin/coaching/projekte/index.astro`, `components/website/src/pages/admin/coaching/sessions/[id].astro`, `components/website/src/pages/admin/coaching/sessions/index.astro`, `components/website/src/pages/admin/coaching/sessions/new.astro`, `components/website/src/pages/admin/coaching/settings.astro`, `components/website/src/pages/admin/content-db.astro`, `components/website/src/pages/admin/dokumente.astro`, `components/website/src/pages/admin/einstellungen/backup.astro`, `components/website/src/pages/admin/einstellungen/benachrichtigungen.astro`, `components/website/src/pages/admin/einstellungen/branding.astro`, `components/website/src/pages/admin/einstellungen/email.astro`, `components/website/src/pages/admin/einstellungen/ordner-templates.astro`, `components/website/src/pages/admin/einstellungen/rechnungen.astro`, `components/website/src/pages/admin/fragebogen/[assignmentId].astro`, `components/website/src/pages/admin/inbox.astro`, `components/website/src/pages/admin/inhalte.astro`, `components/website/src/pages/admin/kalender.astro`, `components/website/src/pages/admin/knowledge/drafts.astro`, `components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro`, `components/website/src/pages/admin/knowledge/templates/index.astro`, `components/website/src/pages/admin/live/sessions/[id].astro`, `components/website/src/pages/admin/meetings.astro`, `components/website/src/pages/admin/members.astro`, `components/website/src/pages/admin/members/[userId].astro`, `components/website/src/pages/admin/projekte.astro`, `components/website/src/pages/admin/projekte/[id].astro`, `components/website/src/pages/admin/rechnungen.astro`, `components/website/src/pages/admin/rechtliches.astro`, `components/website/src/pages/admin/steuer.astro`, `components/website/src/pages/admin/termine.astro`, `components/website/src/pages/admin/wissen.astro`, `components/website/src/pages/admin/zeiterfassung.astro`, `components/website/src/pages/agb.astro`, `components/website/src/pages/api/admin/__tests__/save-publish.test.ts`, `components/website/src/pages/api/admin/ai-quality.test.ts`, `components/website/src/pages/api/admin/angebote/save.test.ts`, `components/website/src/pages/api/admin/angebote/save.ts`, `components/website/src/pages/api/admin/backup-status.test.ts`, `components/website/src/pages/api/admin/content-sections-save.test.ts`, `components/website/src/pages/api/admin/faq/save.ts`, `components/website/src/pages/api/admin/footer/save.ts`, `components/website/src/pages/api/admin/homepage/save.test.ts`, `components/website/src/pages/api/admin/homepage/save.ts`, `components/website/src/pages/api/admin/kontakt/save.ts`, `components/website/src/pages/api/admin/kore-flags/save.ts`, `components/website/src/pages/api/admin/legal/retokenize.ts`, `components/website/src/pages/api/admin/navigation/save.ts`, `components/website/src/pages/api/admin/referenzen/save.ts`, `components/website/src/pages/api/admin/seo/pages.ts`, `components/website/src/pages/api/admin/seo/save.ts`, `components/website/src/pages/api/admin/service-page/save.ts`, `components/website/src/pages/api/admin/stammdaten/save.ts`, `components/website/src/pages/api/admin/startseite/save.ts`, `components/website/src/pages/api/admin/uebermich/save.ts`, `components/website/src/pages/api/booking.ts`, `components/website/src/pages/api/homepage.test.ts`, `components/website/src/pages/api/homepage.ts`, `components/website/src/pages/api/leistungen.ts`, `components/website/src/pages/api/owner/bookings/phone.ts`, `components/website/src/pages/barrierefreiheit.astro`, `components/website/src/pages/cookie-einstellungen.astro`, `components/website/src/pages/datenschutz.astro`, `components/website/src/pages/faq.astro`, `components/website/src/pages/impressum.astro`, `components/website/src/pages/index.astro`, `components/website/src/pages/kontakt.astro`, `components/website/src/pages/leistungen.astro`, `components/website/src/pages/meine-daten.astro`, `components/website/src/pages/newsletter/bestaetigt.astro`, `components/website/src/pages/newsletter/token-ungueltig.astro`, `components/website/src/pages/owner/kalender.astro`, `components/website/src/pages/portal.astro`, `components/website/src/pages/portal/besprechung/[id].astro`, `components/website/src/pages/portal/document.astro`, `components/website/src/pages/portal/fragebogen/[assignmentId].astro`, `components/website/src/pages/portal/loslernen.astro`, `components/website/src/pages/portal/raum/[id].astro`, `components/website/src/pages/portal/sign/[assignmentId].astro`, `components/website/src/pages/referenzen.astro`, `components/website/src/pages/registrieren.astro`, `components/website/src/pages/sitemap.xml.ts`, `components/website/src/pages/status.astro`, `components/website/src/pages/stripe/success.astro`, `components/website/src/pages/ueber-mich.astro`, `components/website/package.json`, `components/website/astro.config.mjs`, `tests/spec/repo-structure/inventory-registered.bats`, `docs/adr/ADR-013-dotfiles-move.md`, `.agents/skills/**`, `.opencode/hooks/**`, `.opencode/memory/**`, `.opencode/prompts/**`, `.opencode/skills/**`, `.opencode/opencode.jsonc`, `docs/agent-guide/**`, `taskfiles/**`, `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/post-merge.yml` | p1, p2, p3, p4, p5, p6, p7, p9 |
| p9 | tasks.d/p9-tests.md | tests | `tests/spec/dotfiles-move/locations.bats`, `tests/spec/dotfiles-move/helpers.bash` |  |

## Entscheidungen

- D1 Pfad: Feature mit Plan zuerst, Umsetzung durch `dev-flow-execute` nach Freigabe.
- D2 Scope: echter Monolith-Split (weder Whole-Move noch Verbleib der Website).
- D3 Scripts: kuratiert (Ticket, Devflow, SDLC, Agent, tmux/vim, MCP-Server der
  umziehenden Tools); Rest bleibt in Bachelorprojekt.
- D4 Layout: `~/apps/<name>/`, `~/scripts/`, `~/mcp-servers/<name>/`; die sieben
  ungetrackten Base-Scripts werden eingezogen und getrackt.
- D5 `ticket.sh`: Umschaltung per Env (`TICKET_DB_TARGET`, Default Fleet).
- D6 Image-Build: neue Dotfiles-CI, Workflow zieht mit, Image-Name neu
  `sdlc-console` statt `website-sdlc`.
- D7 Verlauf: kein History-Rewrite; frischer Stand in Dotfiles plus
  Herkunftsvermerk, Verlauf bleibt in Bachelorprojekt lesbar.
- D8 Staging-only: keine Commits und Pushes ohne Freigabe (User-Vorgabe schlägt
  den Lifecycle-Standard; `stage-plan` und Claims entfallen bis dahin).
- A1 `mentolder-web` zieht ganz um; `brett`, `VideoVault`, `mediaviewer-widget`
  und `studio-server` bleiben.
- A2 `ticket`-, `devflow`- und `task-runner`-MCP-Server ziehen mit;
  `warden`, `gateway`, `comfy`, `bge`, `glimmer` bleiben (cluster-/lab-gebunden).
- A3 Massagen startet als Content-Paket ohne Duplikat der Shared-Pages; ein
  eigenständiges Frontend ist dokumentierte Folgearbeit.
- A4 Gemeinsamer Code wird als `@apps/website-shared` extrahiert, nicht kopiert.
- A5 CI-Workflows bekommen einen Zweit-Checkout des Dotfiles-Repos.
- A6 Skills bleiben in Bachelorprojekt; ihre Aufrufe zeigen auf `~/scripts/`.

## Risiken

- R1 Die Import-Analyse kann weitere Shared-Dateien finden (z. B.
  `content-schema`, `website-db`); Erweiterung nur als Plan-Mutation mit
  D1-Neuprüfung.
- R2 `ticket.sh` liegt über der `.sh`-Schwelle; die Switch-Änderung bleibt
  minimal und zieht ins ungated Dotfiles-Layout.
- R3 Parallele Session in Bachelorprojekt: Execute braucht Lock-Abstimmung vor
  dem Löschen (branch-Claim).
- R4 `components/leitstand/**` ist evtl. console-exklusiv; dann wandert es per
  Plan-Mutation nach p1 statt Totcode im Rest zu lassen.
- R5 Inventar-Guard und Freshness-Baseline müssen neu einrasten (Verify-Task).

## Tasks

- [ ] **Task 0 — Rotphase zuerst.** Partial p9 schreibt die Lage-Guards, danach
  `bats tests/spec/dotfiles-move/locations.bats` laufen lassen (erwartet Rot,
  Ziele existieren noch nicht). Erst bei Rot mit Task 1 fortfahren.
- [ ] **Task 1 — Partials ausführen.** p1 bis p8 in `depends_on`-Reihenfolge
  umsetzen (p9 zuerst, p8 zuletzt). Commit-Form pro Partial:
  `feat(T901492): <partial-kurztext>` — erst nach Freigabe committen (D8), bis
  dahin nur stagen. Betrifft beide Repos (Bachelorprojekt und Dotfiles).
- [ ] **Task 2 — Grün und Verify.** Lage-Guards müssen grün sein, dann final:
  `task test:changed`; `task freshness:regenerate`; `task freshness:check`.
