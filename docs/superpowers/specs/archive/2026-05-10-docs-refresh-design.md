# Workspace Docs Refresh — Design Spec

**Date:** 2026-05-10
**Branch:** feature/docs-refresh
**Scope:** `docs-site/` shell + `k3d/docs-content/` markdown — both brand variants

## Overview

Full refresh of `docs.mentolder.de` and `docs.korczewski.de`:

1. **Audience-first sidebar** with three role-based Quickstart entries on top of the existing topical groups.
2. **Brand-switching shell** — same `index.html`, two CSS token sets, switched at runtime by hostname.
3. **Mermaid diagrams on every hub and service page** — ~25 new diagrams, existing ones kept.
4. **Content sweep** — remove Mattermost / InvoiceNinja / Stripe references, correct the korczewski-as-separate-cluster narrative, fix the `[MCP-Server](claude-code)` sidebar mismatch.
5. **Three new Quickstart pages** + Glossary + Decision Log.

Everything ships under the existing Docsify pipeline; the rollout mechanism (`task docs:deploy`) does not change.

---

## Goals

- A first-time visitor finds the right entry within one click.
- Both brand domains feel like the same product but visibly carry their brand.
- No page references a service that no longer exists in the stack.
- Every service page shows *one* diagram explaining its place in the system.
- Patrick can ship this end-of-week without touching the cluster's deployment story.

## Non-Goals

- No move off Docsify (no Astro/Starlight migration).
- No new languages (German only).
- No search/algolia integration beyond Docsify's built-in plugin.
- No PDF/print stylesheet.
- No content split between brands — same markdown, brand only affects chrome and a handful of `{DOMAIN}` substitutions handled by the existing plugin.

---

## Audience & Success Criteria

| Audience | Entry point | First task they should accomplish |
|---|---|---|
| End-user | Quickstart Endnutzer | Log in to portal and start a Talk call |
| Admin | Quickstart Admin | Deploy workspace + run post-setup |
| Developer | Quickstart Entwickler | Understand `k3d/`, `environments/`, run the test suite |

Success is qualitative: the docs feel current, look like mentolder/kore, and any team member can hand them to a stakeholder without apology.

---

## Architecture

```
docs-site/index.html               # Docsify shell — brand-switch CSS + plugins
k3d/docs-content/                  # markdown, served as ConfigMap
├── README.md                      # rewritten landing
├── _sidebar.md                    # restructured: Quickstarts → Services → Betrieb → Sicherheit → Entwicklung → Referenz
├── quickstart-enduser.md          # NEW
├── quickstart-admin.md            # NEW
├── quickstart-dev.md              # NEW
├── glossary.md                    # NEW
├── decisions.md                   # NEW
├── architecture.md                # kept, fresh diagram
├── services.md                    # kept, fresh diagram
├── keycloak.md … vaultwarden.md   # content sweep + per-page diagram
└── (existing pages)
```

Two ConfigMaps in cluster (one per brand namespace) — already the case; nothing to change in the deploy plumbing.

---

## Brand-Switching Shell

The current `docs-site/index.html` already has a `{DOMAIN}` plugin that detects the host. We extend it:

```js
hook.beforeEach(function (content) {
  var host = window.location.hostname;
  var brand = host.endsWith('korczewski.de') ? 'korczewski' : 'mentolder';
  document.documentElement.setAttribute('data-brand', brand);
  // existing {DOMAIN}/{PROTO} replacement stays
});
```

CSS variables are scoped by `[data-brand="…"]`:

```css
:root[data-brand="mentolder"] {
  --bg-1: #0b111c; --bg-2: #101826; --bg-3: #17202e;
  --fg: #eef1f3;  --fg-soft: #cdd3d9; --mute: #8c96a3;
  --accent: #d7b06a; --accent-2: #e8c884; --sage: #9bc0a8;
  --serif: 'Newsreader', Georgia, serif;
  --sans:  'Geist', system-ui, sans-serif;
  --mono:  'Geist Mono', monospace;
}
:root[data-brand="korczewski"] {
  --bg-1: #111111; --bg-2: #161616; --bg-3: #1a1a1a;
  --fg: #e0d9cc;  --fg-soft: #cdd3d9; --mute: #888;
  --accent: #a08060; --accent-2: #c09060; --sage: #9bc0a8;
  --serif: 'Newsreader', Georgia, serif;
  --sans:  'Geist', system-ui, sans-serif;
  --mono:  'Geist Mono', monospace;
}
```

All existing CSS rules are rewritten to consume `var(--…)` tokens instead of hard-coded hex. Mermaid theme is also flipped per brand via a small `mermaid.initialize` re-call inside the brand plugin.

Headings, eyebrows, and chrome differ slightly by brand. **Body markdown is identical for both brands** — only the shell, sidebar groups, kickers, and tokens differ. We do not lowercase German nouns via CSS (hurts readability).

- **mentolder**: serif h1 with `<em>` italic in brass-2; topical eyebrows (`Services`, `Betrieb`).
- **korczewski**: same serif h1; eyebrows wrapped in mono brackets (`[ SERVICES ]`, `[ BETRIEB ]`). Sidebar group labels also bracketed.

The bracketing for kore is implemented in CSS via `::before "[ "` / `::after " ]"` on `.sidebar-nav > ul > li > p` and on the `.kicker` utility class — markdown stays brand-neutral.

**Mermaid initialization happens once**, before Docsify boots, reading `data-brand` synchronously from `<html>` (set inline in `<head>` via a 3-line script that runs before docsify loads). This avoids re-init on every page navigation and prevents a flash of unthemed diagrams.

---

## Sidebar Layout

`k3d/docs-content/_sidebar.md` becomes:

```markdown
- **Quickstarts**
  - [Endnutzer (5 Min)](quickstart-enduser)
  - [Admin (Setup)](quickstart-admin)
  - [Entwickler (Tour)](quickstart-dev)

- **Services**
  - [Keycloak (SSO)](keycloak)
  - [Nextcloud + Talk](nextcloud)
  - [Collabora (Office)](collabora)
  - [Talk HPB (Signaling)](talk-hpb)
  - [Livestream (LiveKit)](livestream)
  - [E-Invoice (ZUGFeRD & XRechnung)](einvoice)
  - [MCP-Server (Claude Code)](claude-code)
  - [Vaultwarden (Passwörter)](vaultwarden)
  - [Website (Astro & Svelte)](website)
  - [Whiteboard](whiteboard)
  - [Mailpit (Dev-Mail)](mailpit)
  - [Monitoring (Prometheus & Grafana)](monitoring)
  - [PostgreSQL (shared-db)](shared-db)

- **Betrieb**
  - [Deployment & Taskfile](operations)
  - [Umgebungen & Secrets](environments)
  - [ArgoCD (GitOps)](argocd)
  - [Backup & Wiederherstellung](backup)

- **Sicherheit**
  - [Sicherheitsarchitektur](security)
  - [Sicherheitsbericht](security-report)
  - [DSGVO / Datenschutz](dsgvo)
  - [Verarbeitungsverzeichnis](verarbeitungsverzeichnis)

- **Entwicklung**
  - [Beitragen & CI/CD](contributing)
  - [Architektur](architecture)
  - [Tests](tests)
  - [Skripte-Referenz](scripts)
  - [Migration](migration)
  - [Anforderungen](requirements)
  - [Fehlerbehebung](troubleshooting)

- **Administration**
  - [Adminhandbuch](adminhandbuch)
  - [Admin-Webinterface](admin-webinterface)
  - [Projekt-Verwaltung](admin-projekte)
  - [Tickets (Unified Inbox)](admin-tickets)

- **Benutzerhandbuch**
  - [Für Endnutzer](benutzerhandbuch)
  - [Systembrett im Whiteboard](systembrett)
  - [Systemisches Brett (3D)](systemisches-brett)

- **Referenz**
  - [Glossar](glossary)
  - [Decision-Log](decisions)
```

Changes vs. current:
- Quickstarts group is new and sits on top.
- `[MCP-Server](claude-code)` label corrected to `[MCP-Server (Claude Code)](claude-code)`.
- `Architektur` moved from Einführung to Entwicklung (Architektur is a developer concern; the landing page now carries the introductory load).
- Glossar + Decision-Log appear under Referenz.
- Old `Einführung` group removed (the README is reachable via the logo).

---

## Landing Page (`README.md`)

Sections in order:

1. **Lede** — one paragraph in serif/italic. Brand-aware copy via existing `{DOMAIN}`.
2. **Tracks-Cards** (3 columns) — Endnutzer / Admin / Entwickler, each with 2-line description and link to its quickstart.
3. **Architektur-Diagramm** — top-level Mermaid (browser → ingress → services → DB), updated to reflect the post-2026-05-05 unified cluster.
4. **Service-Endpunkte** — table; URLs use `{DOMAIN}` placeholder.
5. **Schnellstart** — terminal-block, three commands (`task cluster:create` / `task workspace:deploy` / `task workspace:post-setup`).
6. **Hilfe** — links to Troubleshooting + Decision-Log.

The cards are markdown HTML blocks, styled by classes the index.html already provides for the page-hero / toc-box. New utility class `.tracks` renders the 3-column grid.

---

## Mermaid Coverage

Hub pages (existing diagrams refreshed):

| Page | Diagram type | Purpose |
|---|---|---|
| `README.md` | flowchart | top-level system map |
| `architecture.md` | flowchart | full namespace + dependency map |
| `services.md` | flowchart | services-only view, no infra |
| `security.md` | flowchart | trust boundaries + auth flow |
| `dsgvo.md` | flowchart | personal-data flow + retention |
| `backup.md` | sequenceDiagram | nightly backup → off-site copy |
| `talk-hpb.md` | flowchart | client → HPB → Janus → coturn |

Service pages (new diagrams, one each):

| Page | Diagram type | Shows |
|---|---|---|
| `keycloak.md` | sequenceDiagram | OIDC code flow with one client (Nextcloud) |
| `nextcloud.md` | flowchart | Nextcloud + Collabora + Talk + shared-db |
| `collabora.md` | sequenceDiagram | open-document handshake |
| `livestream.md` | flowchart | publisher → LiveKit → ingress/egress → viewer |
| `einvoice.md` | flowchart | ZUGFeRD generation + storage |
| `claude-code.md` | flowchart | MCP monolith pod + auth-proxy + Claude Code client |
| `vaultwarden.md` | flowchart | clients → Vaultwarden → shared-db, OIDC redirect |
| `website.md` | flowchart | Astro SSR + Svelte islands + portal sub-routes + DB |
| `whiteboard.md` | flowchart | Nextcloud Whiteboard app → board.${DOMAIN} backend |
| `mailpit.md` | sequenceDiagram | dev SMTP capture |
| `monitoring.md` | flowchart | Prometheus + Grafana scraping which targets |
| `shared-db.md` | flowchart | PG 16 + per-service DBs + backup CronJob |
| `argocd.md` | flowchart | hub-mentolder cluster → ApplicationSets → workspaces |
| `environments.md` | flowchart | env file → env-resolve.sh → SealedSecret → cluster |
| `operations.md` | flowchart | Taskfile entry points by category |
| `contributing.md` | sequenceDiagram | PR → CI → review → squash-merge |
| `tests.md` | flowchart | runner.sh → BATS / Playwright / Acceptance |

Diagrams use Docsify-Mermaid; Mermaid theme is set per brand (mentolder uses dark with brass accents, kore uses dark with brass-2 accents — both supported by `themeVariables`).

---

## New Pages

### `quickstart-enduser.md`

- One-paragraph intro.
- Numbered list (10 steps max): open portal → SSO login → land in dashboard → open Files → upload one file → open Talk → start a call → invite by link → leave a chat message → log out.
- Inline screenshots — **out of scope for this spec**, leave placeholder image refs (`![](assets/quickstart/01-portal.png)`) for a follow-up screenshot pass.
- Closing block: link to Benutzerhandbuch for depth.

### `quickstart-admin.md`

- "Was du brauchst" (Docker, k3d, kubectl, task).
- Three commands (cluster:create / workspace:deploy / workspace:post-setup).
- "Erste Validierung" — 4 health checks (kubectl get pods, log in to Keycloak, log in to Nextcloud, run a backup).
- Mermaid sequence: setup walkthrough.
- Closing block: link to Adminhandbuch + Backup.

### `quickstart-dev.md`

- Repo layout in 12 lines (the `k3d/`, `environments/`, `prod-mentolder/`, `scripts/`, `tests/`, `website/`, etc.).
- "Wie ich was ändere" — three example workflows (a website change, a manifest change, a test).
- Mermaid: Taskfile entry points.
- Link to Beitragen & CI/CD.

### `glossary.md`

Alphabetical, ~25 entries. Each entry: term, one-sentence plain definition, one-sentence "wo es im Workspace vorkommt", optional cross-link. Examples:

- **Brand** — visuelles Identitätsset; Workspace serviert `mentolder` und `korczewski`. Erscheint in `BRAND_ID`-ConfigMap und im Docsify-Shell.
- **ENV** — eine Umgebung wie `dev`, `mentolder`, `korczewski`. Steuert Cluster-Kontext + Sealed Secret + Overlay.
- **OIDC** — OpenID Connect. Keycloak ist der Provider; Nextcloud / Vaultwarden / Website / DocuSeal / Tracking sind Clients.
- **SealedSecret** — verschlüsseltes Geheimnis, das im Repo committed werden darf. Wird vom Sealed-Secrets-Controller im Cluster zu einem `Secret`.
- **Workspace** — die Plattform als Ganzes; auch der Kubernetes-Namespace (`workspace`, `workspace-korczewski`).

### `decisions.md`

Decision log — chronological, newest first. Format per entry:

```
## YYYY-MM-DD — Titel
**Status:** akzeptiert / verworfen / superseded by …
**Kontext:** 1-2 Sätze.
**Entscheidung:** 1-2 Sätze.
**Konsequenz:** Was es uns einbringt / kostet.
```

Initial entries (exact dates filled in during implementation by `git log --first-parent --grep='<keyword>' --format='%ad' --date=short`):

- Korczewski-Cluster mit Mentolder-Cluster vereinen (2026-05-05 per memory).
- Stripe komplett rausnehmen (date from commit `chore(stripe): remove Stripe end-to-end…`).
- Mattermost und InvoiceNinja entfernen (date from earliest CLAUDE.md gotchas referencing the removal).
- LiveKit als hostNetwork-Pin für Streaming (date from livekit-server manifest creation).
- SealedSecrets statt envsubst-Workflow (PR #61 per memory `project_env_secrets_redesign.md`).
- Custom Messaging in der Astro-Website statt Mattermost (date from website chat scaffolding commit).
- k3d/k3s + Kustomize als einziger Deploy-Pfad (initial — no separate decision date, mark as "Status: Foundation").

Each entry is 4-6 lines. Total page ~120 lines.

---

## Content Sweep

Files to edit in addition to the structural rewrites:

- `requirements.md` — drop Mattermost / InvoiceNinja / Stripe rows; renumber FA-IDs only if they re-number elsewhere (they don't; gaps are intentional per CLAUDE.md).
- `tests.md` — remove rows for tests that referenced retired services.
- `vaultwarden.md` — remove the InvoiceNinja example from "Vaults für Geschäftsdaten".
- `README.md` — replace "korczewski-Cluster und mentolder-Cluster" wording with "mentolder-Cluster (vereint, betreibt korczewski.de in eigener Namespace)".
- `architecture.md` — diagram already exists; refresh node count in the unified-cluster section.
- `services.md` — drop Mattermost service row if present.
- `operations.md` — review for `mentolder:*` / `korczewski:*` shorthand commands (removed 2026-05-05 per CLAUDE.md); update to `ENV=` form.
- `_sidebar.md` — already covered.

---

## Deployment

No changes to the deploy mechanism:

```bash
task docs:deploy            # rebuilds ConfigMap + restarts both clusters
```

Per CLAUDE.md: ArgoCD does not auto-sync the `docs-content` ConfigMap. After every merged docs change, `task docs:deploy` is the manual step.

For the brand-switch CSS shell (`docs-site/index.html`), the same task picks it up — index.html is part of the same ConfigMap.

---

## Risks & Mitigations

- **Mermaid theme switch can flicker on first load.** Mitigation: set `data-brand` *before* loading docsify, and pass the corresponding `themeVariables` synchronously into `mermaid.initialize`.
- **Brand-switch breaks if a future env adds a third brand.** Acceptable — we'd extend the hostname check; the CSS-tokens approach scales linearly.
- **Quickstart screenshots become stale fast.** Mitigated by leaving placeholders and capturing them in a follow-up; quickstart text alone is functional without images.
- **Decision-Log can rot.** Mitigated by adding a one-line entry rule to CLAUDE.md (out of scope here, called out in the implementation plan).

---

## Out of Scope

- Screenshots for `quickstart-enduser.md` — placeholders only.
- Translations — German only.
- Search backend swap — keep Docsify built-in.
- Migration to Astro Starlight or any other generator.
- Adding a feedback form / "war diese Seite hilfreich?" widget.
- Touching `docs/` (the in-repo planning docs) — only `k3d/docs-content/` and `docs-site/` are in scope.

---

## Acceptance Checklist

- [ ] `docs.mentolder.de` and `docs.korczewski.de` show different chrome (palette + eyebrow brackets).
- [ ] Sidebar starts with three Quickstart entries.
- [ ] Landing page shows 3 audience cards above the architecture Mermaid diagram.
- [ ] No occurrence of "Mattermost", "InvoiceNinja", or "Stripe" remains in `k3d/docs-content/*.md` (excluding `decisions.md` which intentionally records their removal).
- [ ] No page describes korczewski as a separate Kubernetes cluster.
- [ ] Every page in the Services group has at least one Mermaid diagram.
- [ ] `[MCP-Server (Claude Code)](claude-code)` is the sidebar entry.
- [ ] `glossary.md` and `decisions.md` are reachable from the sidebar.
- [ ] `task docs:deploy` runs cleanly against both clusters.
