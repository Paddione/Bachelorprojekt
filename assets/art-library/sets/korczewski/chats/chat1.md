# Document Templates

_Started 2026-04-28 09:39 UTC_

---

## User



## Assistant

_[tool: update_todos]_

_[tool: local_ls]_

Let me explore each file to understand the brand and design system.

_[tool: local_read]_

_[tool: local_read]_

_[tool: local_read]_

_[tool: local_read]_

Now let me check the SVG assets and look at the GitHub repo mentioned.

_[tool: local_read]_

_[tool: local_read]_

_[tool: local_read]_

_[tool: local_read]_

_[tool: local_read]_

I have a strong sense of the brand now: **Kore.** — Aubergine ink dark theme, plasma lime accent, italic serif (Instrument Serif), mono accents (JetBrains Mono), film grain, Kubernetes/infrastructure context (k8s wheel, topology, nodes). The user mentioned "homepage and all the menus" suggesting it's a developer/infra product website.

Let me set up the project, copy assets, and start building.

_[tool: set_project_title]_

_[tool: local_copy_to_project]_

_[tool: snip]_

Now let me write the README.md with all the required sections, the SKILL.md, and start building preview cards.

_[tool: write_file]_

_[tool: write_file]_

_[tool: update_todos]_

_[tool: snip]_

Now let me build the preview cards. I'll batch them up.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: register_assets]_

_[tool: update_todos]_

I'll keep going on the UI kits.

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: show_html]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: register_assets]_

_[tool: update_todos]_

The user wants the logo to feel like "Core" (with a K) — so make the **K** form some kind of core/nucleus shape, not just stylized strokes. Let me redesign the mark with the K embedded in or forming a core/sphere.

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: show_to_user]_

_[tool: snip]_

_[tool: write_file]_

_[tool: show_to_user]_

_[tool: snip]_

I refreshed the iconography card with a richer set — cluster, region, node, search, runs, runbook, healthy, incident, settings, go, manifest, SLA — using the gradient-fill tile background, a solid lime variant for "go", a cyan variant for healthy/region, and a red variant for incident. Each uses 1.5px stroke line work in the spirit of the existing K8s SVG.

**Caveats**
- **Fonts**: served from Google Fonts. Drop licensed copies into `fonts/` if you have them.
- **Icons**: hand-drawn 1.5px-stroke SVGs in the existing house style, plus the original `k8s-wheel`. No icon font in the codebase — flagged for replacement if you adopt Lucide or similar.
- **Photography / portrait / case copy**: invented to match voice; replace with real assets.

**Iterate with me — what to look at next?**
- Does the new **Logo** "Core with a K" direction land? I built it as: vertical K-stem piercing a glowing nucleus, with two arms radiating out of the core. Concentric rings + halo around the pivot dot. Want it more *abstract sphere* (drop the K stem letters and lean into a planet/atom mark)? More *literal letterform* (a heavier K with the core just behind it)? More *minimal* (kill the rings)?
- The **Iconography** card now uses gradient tiles + filled accents — too much, just right, or want to push further (bigger glyphs, custom isometric versions of cluster/node)?
- Do you want me to add **case-study screens, an empty state, a 404 / paper contract** to the kits — or hold and iterate on what's there?

## User

I still need designpieces for: Newsletters/Patchnotes, Invoices, Questionaires, and Contracts

## Assistant

_[tool: snip]_

_[tool: update_todos]_

I'll build all four pieces. The Invoice already exists in the App kit's Billing view — I'll extract it as a standalone piece and add the three new ones (Newsletter/Patchnotes, Questionnaire, Contract). All will live as standalone HTML in `ui_kits/documents/`.

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: register_assets]_

_[tool: write_file]_

_[tool: update_todos]_

_[tool: done]_

