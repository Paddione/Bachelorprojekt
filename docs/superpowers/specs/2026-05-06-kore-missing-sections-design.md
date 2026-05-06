# Kore Homepage — Missing Sections Design

**Date:** 2026-05-06  
**Status:** Approved  

## Summary

Add 4 missing sections to the Kore homepage (`web.korczewski.de`) that exist on mentolder but are absent from the Kore brand layout. All new sections use the Kore-native dark/terminal aesthetic (matching KorePillars, KoreBugs, KoreTeam) rather than importing mentolder components.

No Stripe integration — services link to `#contact` instead.

## New Components

### 1. `KoreServices.astro`
- **Data:** `getEffectiveServices()` filtered to `!s.hidden`
- **Anchor:** `id="services"` — this displaces KorePillars from the `#services` anchor (see Nav Fixes)
- **Layout:** numbered dark rows — service number, title, meta tagline, description, price, "→ Kontakt" link
- **Style:** matches KorePillars card aesthetic (dark border, monospace labels)

### 2. `KoreWhyMe.astro`
- **Data:** `getEffectiveHomepage()` → `whyMeHeadline`, `whyMeIntro`, `whyMePoints[]`, `quote`, `quoteName`
- **Layout:** two-column — left: headline + intro + bullet points; right: pull quote block
- **Style:** Kore section header pattern (`w-section` / `.head` / `.num`)

### 3. `KoreProcess.astro`
- **Data:** Static (same 4 steps as mentolder: Erstgespräch → Klarheit → Begleitung → Transfer)
- **Layout:** 4-column grid of numbered steps, each with step number, heading, description
- **Style:** Kore dark grid matching the w-services pattern

### 4. `KoreFaq.svelte` (client:visible)
- **Data:** `getEffectiveFaq()` passed as `initialItems` prop from `index.astro`
- **Interaction:** Accordion — click to expand/collapse; one open at a time; chevron rotation
- **Style:** dark bordered rows, monospace labels, Kore serif headings

## Page Order (updated)

```
KoreSubNav
KoreHero
KoreServices       ← NEW  (id="services")
KoreWhyMe          ← NEW
KoreProcess        ← NEW
KorePillars        (id changed: "services" → "work")
KoreTimeline       (id="timeline")
KoreBugs
KoreTeam           (id="team")
KoreFaq            ← NEW
KoreContact        (id="contact")
KoreFooter
```

## Nav Fixes (`KoreSubNav.astro`)

| Nav entry | Current href | After |
|-----------|-------------|-------|
| Cluster   | `#work`     | `#work` ✓ (KorePillars gets this id) |
| Leistungen | `#services` | `#services` ✓ (KoreServices gets this id) |
| Notizen   | `#notes`    | `#timeline` (KoreTimeline uses this id) |

## `index.astro` Changes

In the `korczewski` branch:
- Import `KoreServices`, `KoreWhyMe`, `KoreProcess`, `KoreFaq`
- Fetch `homepage = await getEffectiveHomepage()` and `faq = await getEffectiveFaq()`  
  (already fetched for mentolder branch — move fetches above the brand split or duplicate inside the branch)
- Pass `initialItems={faq}` to `KoreFaq`
- Pass homepage data as props to `KoreWhyMe`

## `KorePillars.astro` Change

One-line: change `id="services"` → `id="work"` on the `<section>` element.

## Error Handling

- `getEffectiveServices()` / `getEffectiveHomepage()` / `getEffectiveFaq()` can throw — wrap each in `try/catch` with empty fallbacks (same pattern as `getAvailableSlots` in `KoreContact.astro`)
- `KoreFaq` with empty `initialItems` renders nothing (no section shown)
- `KoreWhyMe` with missing `whyMePoints` falls back to empty array

## Out of Scope

- No CTA section — `KoreContact` already serves as the closing CTA
- No live stream indicator in nav (separate feature)
- No user dropdown in nav (separate feature)
- No Stripe / booking buttons anywhere
