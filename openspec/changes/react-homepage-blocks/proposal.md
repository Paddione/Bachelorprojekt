# Proposal: react-homepage-blocks

## Why

react.mentolder.de (`mentolder-web`, Vite + React-SPA) ist das **Migrationsziel**, das die
Astro/Svelte-Homepage langfristig ablöst. Heute ist sein Content statisch (teils `content.ts`,
teils inline in `HomePage.tsx` hartcodiert), ohne DB-Anbindung oder Editor. Es soll — wie die
Svelte-Seite — **Felder UND Strukturen** editierbar machen (Block-/Komposition-System) über einen
visuellen Page-Builder, mit gemeinsamer Content-SSOT.

**P1 legt das Fundament ohne sichtbare Änderung:** block-getriebenes Rendering. Eine adversariale
Review hat gezeigt, dass ein CI-Build-Bake aus der internen DB unmöglich ist (GitHub-Runner ist
netz-isoliert vom Fleet-Cluster) und die Seed-Quelle eindeutig sein muss. Daher ist P1 ein
**reiner `mentolder-web`-Refactor aus einem committeten Seed, Null-Diff** — DB/Editor/Endpoint
folgen in P2, wo der Editor sie ohnehin braucht.

## What

**P1 (diese Iteration):**
- Zod-Block-Schema + Katalog (7 Paritäts-Typen + generische `richText`/`image`/`spacer`),
  `services.icon` als Enum der `iconRegistry`-Keys.
- Content-Extraktion des **heute gerenderten** Contents (`content.ts` + Inline-Literale,
  Inline gewinnt) in einen committeten Seed (`mentolder-web/src/blocks/seed.ts`).
- 7 präsentationale Block-Komponenten + `BlockRenderer` (Zod-validiert, fail-closed-to-seed bei
  `schemaVersion`-Mismatch).
- `HomePage.tsx` rendert block-getrieben; vitest + RTL mit per-Block **Null-Diff-Snapshots**.

**Nicht in P1 (→ Roadmap P2–P4):** DB-Persistenz (`site_settings`/`homepage_blocks` +
`CONTENT_REGISTRY`), public Read-Endpoint + Build-Fetch + `configmap-domains`,
Cross-Subdomain-Auth, visueller Editor (`EditableBlock`/dnd-kit), Publish-Trigger, Cutover.

Design-Spec: `docs/superpowers/specs/2026-06-21-react-homepage-blocks-design.md`

_Ticket: T001056_
