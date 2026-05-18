---
slug: admin-menu-rules
status: draft
domains: [website]
brands: [mentolder, korczewski]
---

# Admin-Menu Rules & Reshuffle — Design

## Context

The admin sidemenu in `website/src/layouts/AdminLayout.astro` currently holds **7 groups / 22 items**, with **19 orphan `/admin/*` routes** that aren't reachable from any menu and **8 redirect-only routes** doing soft fix-ups. The Dashboard KPI links to one of the orphans (`/admin/projekte`), which is the clearest symptom: navigation surfaces disagree on which pages exist.

Three structural problems drive the disorder:

- **No placement gate.** PRs that add `/admin/<route>.astro` can ship without touching `AdminLayout.astro`. Orphans accumulate silently.
- **Mixed-concept groups.** `System` is a junk drawer (`Cluster-Steuerung`, `Monitoring`, `Arena`, `Inbox` — four orthogonal jobs). `Inhalte` is a single item with eight hidden sub-routes. Accounting is split across one in-menu item (`Rechnungen`) and three orphans (`Buchhaltung`, `Steuer`, `Zeiterfassung`).
- **Actions in destinations' clothing.** `Neue Session` is a verb sitting in a list of nouns; it adds noise to the Coaching group.

We close all three by codifying menu rules and enforcing the placement gate in `dev-flow-execute`. The reshuffle proves the rules are workable on a real case.

## The 10 Rules

These rules govern every admin menu change going forward. Each rule traces to a problem above; each is checkable in code (the gate enforces R1–R3, R7, R10).

| # | Rule | Source of truth |
|---|---|---|
| **R1** | **No orphans.** Every `/admin/*` route is reachable from the sidemenu within 2 clicks — either listed directly as a `NavItem`, or as a `matches[]` sub-route of a listed item, or as a dynamic sub-page (`[param]`) of a listed parent. | Detected by gate diffing `git diff origin/main -- 'website/src/pages/admin/**'`. |
| **R2** | **Destinations, not actions.** `NavItem.label` is a noun. Create-actions live as buttons on the destination page (`/admin/coaching/sessions/new` is reached from the `Sessions` page, not via the sidebar). | Gate lints labels against a verb blocklist (`/^(neu|new|add|erstell|create)/i`). |
| **R3** | **Group by user task, not subsystem.** Group label names the kind of work the user does ("Geld", "Plattform"), not the codebase layer ("Billing", "DevOps"). | Editorial — reviewed in PRs, not auto-enforced. |
| **R4** | **Group size ≤ 6 items.** If a group needs more, split or promote a child page. | Gate counts `items[]` per group. |
| **R5** | **Functional groups ≤ 6.** Dashboard is a header, not a group. | Gate counts `navGroups[]`; Dashboard rendered as a standalone link above the groups. |
| **R6** | **Frequency-order within group.** Most-used at top. | Editorial. |
| **R7** | **Dashboard KPIs / quick-links must target sidemenu items.** No widget references an orphan. | Gate parses `website/src/pages/admin.astro` for `href="/admin/..."` and cross-references against the menu. |
| **R8** | **Badges live next to their item.** Counts (drafts pending, inbox unread) belong on the item that resolves them. | Already done by `NavItem.badge`. Lifted to a rule to keep it that way. |
| **R9** | **Brands share the menu by default.** Mentolder and Korczewski use the same `navGroups`. Brand divergence requires an explicit `if (brandId === ...)` block with a comment justifying the split. | Editorial — flagged in review if a brand check appears around the menu without a comment. |
| **R10** | **Adding a new `/admin/*` page is incomplete until it's placed.** The PR cannot merge until the gate is clean. | Hard gate in `dev-flow-execute` Schritt 3.5. |

## Target Menu (applying R1–R9)

Header (standalone, not a group):
- **Dashboard** → `/admin`

Then six groups, each within the ≤ 6-items cap:

| Group | Items | Notes |
|---|---|---|
| **Tagesgeschäft** (6) | Termine · Tickets · Inbox · Live · Nachrichten · Räume | `Nachrichten`, `Räume` formerly orphan. `Inbox` moved here from "System" (it's communication, not platform admin). |
| **Klienten** (5) | Klienten · Projekte · Meetings · Kalender · Followups | `Projekte`, `Meetings`, `Followups` formerly orphan. Closes the Dashboard-KPI broken-link (`/admin/projekte`). |
| **Coaching** (4) | Sessions · Projekte · Brett · KI-Einstellungen | `Brett` formerly orphan (proxy iframe under `/admin/brett`). `Neue Session` removed — surfaced as a button on the Sessions page. The two `Projekte` items are disambiguated by group: "Klienten → Projekte" vs "Coaching → Projekte". |
| **Wissen & Inhalte** (5) | Website-Inhalte · Bücher · Drafts · Quellen · Vorlagen | `Vorlagen` formerly orphan (`/admin/knowledge/templates`). `draftsPending` badge stays on Drafts. |
| **Geld** (4) | Rechnungen · Buchhaltung · Zeiterfassung · Steuer | All three formerly-orphans consolidated next to `Rechnungen`. |
| **Plattform** (6) | Monitoring · Software-History · Systemtest · Arena · Cluster-Steuerung · Einstellungen | `Systemtest` formerly orphan (`/admin/systemtest/board`). Arena is the admin view of a service offering — it belongs alongside Monitoring, not in Tagesgeschäft. |

**Dynamic sub-routes** (exempt from R1 — reached from their parent):

- `/admin/projekte/[id]` ← parent: Klienten/Projekte
- `/admin/meetings/[id]` ← parent: Klienten/Meetings
- `/admin/coaching/sessions/[id]`, `/new` ← parent: Coaching/Sessions
- `/admin/live/sessions/[id]` ← parent: Tagesgeschäft/Live
- `/admin/fragebogen/[assignmentId]` ← parent: Coaching/Sessions (questionnaire flow)
- `/admin/billing/elster`, `/admin/billing/[id]/drucken` ← parent: Geld/Rechnungen
- `/admin/brett/[...path]` ← parent: Coaching/Brett (proxy passthrough)
- `/admin/knowledge/snippets/[id]/publish` ← parent: Wissen & Inhalte/Drafts

**Redirect routes** kept as-is for backward compatibility (URL preservation): `bugs → tickets`, `stream → live`, `newsletter → dokumente`, and the brand-section redirects (`coaching`, `50plus-digital`, etc.) into `/admin/inhalte?tab=…`.

## dev-flow-execute Integration

A new **Schritt 3.5 — Admin-Menu Placement Gate** sits between Schritt 3 (Lokale Verifikation) and Schritt 5 (PR). It runs `scripts/admin-menu-gate.sh` against the diff vs `origin/main`.

### Gate Logic

```
1. Enumerate new/modified static admin pages:
     git diff --name-only origin/main \
       -- 'website/src/pages/admin/**/*.astro' \
       | grep -v '\[.*\]'        # exclude dynamic routes

2. For each route, derive canonical href:
     website/src/pages/admin/foo/bar.astro     -> /admin/foo/bar
     website/src/pages/admin/foo/index.astro   -> /admin/foo

3. Parse AdminLayout.astro to extract:
     - navGroups[].items[].href
     - navGroups[].items[].matches[]
     Reach set = union of both.

4. For each route, check:
     - Listed directly       (href in reach set)         -> OK
     - Listed via matches[]  (any matches[] prefix hits) -> OK
     - Dynamic parent listed (parent dir has a NavItem)  -> OK
     - Otherwise                                          -> ORPHAN

5. R4/R5 caps:
     - len(navGroups) <= 6
     - max(len(group.items) for group in navGroups) <= 6

6. R7 (dashboard cross-ref):
     For each href in website/src/pages/admin.astro that starts with /admin/,
     verify it appears in the reach set.

7. R2 (label hygiene):
     For each NavItem.label, fail if matches /^(neu|new|add|erstell|create)/i

Exit non-zero with a structured report if any rule fails.
```

### Failure UX

The gate prints a precise report and exits 1:

```
✗ Admin-Menu Gate failed (3 issues)

R1 No orphans — 1 new static admin page is not reachable:
  - /admin/widgetwall (added by this branch)
    Suggestion: add to Tagesgeschäft, or list parent /admin in matches[].

R4 Group size cap — 'Tagesgeschäft' has 7 items (max 6):
  - Termine, Tickets, Inbox, Live, Nachrichten, Räume, Widgetwall
    Suggestion: move 'Widgetwall' to a different group, or split 'Tagesgeschäft'.

R7 Dashboard cross-ref — KPI links to orphan:
  - admin.astro: href="/admin/forecasting"  (not in sidemenu)
```

Patrick can override with `ADMIN_MENU_GATE=skip` (logged, but the PR title gets prefixed with `[menu-gate-skip]` so it's reviewable). Default behaviour is hard-fail.

### Where the script lives

- `scripts/admin-menu-gate.sh` — the actual gate (bash + `jq` + minimal awk parsing of `AdminLayout.astro`)
- `.claude/skills/dev-flow-execute/SKILL.md` — Schritt 3.5 documented, invokes the script

The gate runs:
- In `dev-flow-execute` Schritt 3.5 (interactive, blocking)
- As an offline test in `task test:menu-gate` so CI catches drift even when Patrick bypasses `dev-flow-execute`

## Out of Scope

- **Building missing pages.** Every "orphan" already exists as a working page — we're only wiring them into the menu. No new functionality.
- **Brand divergence.** Mentolder and Korczewski continue to share `navGroups`. The Kore brand only changes typography/styling.
- **Dashboard redesign.** We only fix `/admin/projekte`'s broken-link symptom. Reorganising KPI cards or service tiles is a separate spec.
- **Permission gating.** Hide vs. grey-out is a real question, but not for this round. We treat all admin items as visible to anyone reaching `/admin/*` (i.e. anyone in the `dev-access` / admin Keycloak group).
- **Mobile sidebar UX.** Out of scope.
- **Icon design system.** We'll fix the two referenced-but-missing icons (`folder`, `settings`) inline, but the broader icon library is untouched.

## Verification

The implementation is considered complete when:

1. **`AdminLayout.astro` renders the target menu.** `Dashboard` is a standalone header link above the groups; 6 groups (`Tagesgeschäft`, `Klienten`, `Coaching`, `Wissen & Inhalte`, `Geld`, `Plattform`), each ≤ 6 items.
2. **Dashboard KPI for "Aktive Projekte" resolves.** Following `/admin/projekte` returns 200, and the same href appears as a `NavItem` in `Klienten`.
3. **`scripts/admin-menu-gate.sh` exits 0** on the post-implementation tree.
4. **`task test:menu-gate` exits 0** offline.
5. **`task feature:website`** deploys cleanly to both clusters; `https://web.mentolder.de/admin` and `https://web.korczewski.de/admin` show the new menu with all six groups, badges intact (`draftsPending`, `inboxPending`).
6. **No regressions in `task test:all`.**

Smoke checks against live URLs:

- `web.mentolder.de/admin` — load page, sidebar shows Dashboard + 6 groups, no overflow.
- `web.mentolder.de/admin/projekte` — page loads (was orphan; now linked).
- `web.korczewski.de/admin` — same structure, Kore styling intact.

## Mishaps Found During Spec

These are unrelated to the rules but were spotted during the audit:

- **MISHAP (broken):** `AdminLayout.astro` references `icon: 'folder'` and `icon: 'settings'` in the Coaching group, but neither icon is defined in the `icons` record (lines 35–65). The SVG slot renders empty. Fix inline during reshuffle.

## Brainstorm Reference

This design was settled in a brainstorming session on 2026-05-18. The 10 rules were proposed by Claude and accepted by Patrick without modification (response: "do it").
