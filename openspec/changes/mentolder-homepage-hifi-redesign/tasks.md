---
title: "Mentolder Homepage — hifi-Redesign in Astro+Svelte"
ticket_id: T001034
domains: [website/mentolder]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Mentolder Homepage hifi-Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the visual quality of the mentolder homepage (Hero, ServiceRow, WhyMe, QuoteCard, FAQ, Process, StatsStrip, CallToAction) with consistent design tokens, entrance animations, glassmorphism card treatments, and smooth accordion transitions — all within the existing Astro+Svelte 5 stack, touching no content or routes.

**Architecture:** Pure CSS/Svelte enhancements. All tokens are already defined in `website/src/styles/factory-tokens.css` (imported via `global.css`). Animations use `@keyframes` + CSS transitions + `IntersectionObserver` via Svelte `onMount`. No new dependencies. No new routes. Korczewski/Kore brand is untouched.

**Tech Stack:** Astro 5, Svelte 5 (`$props()`, `$state()`, `onMount`), CSS Custom Properties (`var(--brass)`, `var(--ink-900)`, etc.), `@keyframes` CSS animations, `IntersectionObserver` API.

## File Structure

Betroffene Dateien (rein visuelle Änderungen — keine neuen Dateien außer ggf. `QuoteCard.svelte`):

```
website/src/
  styles/
    global.css                  ← Scroll-Reveal @keyframes + utility classes
  components/
    Hero.svelte                 ← Entrance-Animation, Kicker-Kontrast (266 → ≤320 Z.)
    ServiceRow.svelte           ← Glassmorphism Cards, Stagger-Reveal (280 → ≤370 Z.)
    WhyMe.svelte                ← Brass-Connector, Scroll-Reveal (178 → ≤240 Z.)
    QuoteCard.svelte            ← Enhanced visual treatment
    FAQ.svelte                  ← Smooth-Height-Transition (163 → ≤220 Z.)
    CallToAction.svelte         ← Button-Styles, Glow (182 → ≤240 Z.)
    Process.astro               ← Connector-Linie, Brass-Nummerierung (189 → ≤260 Z.)
    StatsStrip.astro            ← Brass-Zahlen, Responsive (136 → ≤200 Z.)
```

Alle Dateien bleiben unter dem S1-Limit (`.svelte` ≤500, `.astro` ≤400).

---

## Global Constraints

- Svelte 5 syntax only: `$props()`, `$state()`, `$derived()`, `onMount` from `'svelte'`. No `export let`, no Svelte 4 reactivity.
- No new npm packages, no CSS framework additions.
- All CSS tokens must reference `var(--brass)`, `var(--ink-900)`, `var(--fg)`, etc. for color properties. For `box-shadow` and `background` properties where per-alpha-opacity variants are needed (e.g. `oklch(0.80 0.09 75 / 0.45)`) and no named token exists, the raw oklch value may be used — but only for the brass family and only in shadow/gradient contexts.
- No brand-domain string literals (e.g. `mentolder.de`, `korczewski.de`) in any code snippet.
- `IntersectionObserver` only inside `onMount` (Svelte SSR guard).
- S1 line limits (no baseline entries exist for any homepage component — wirksame Schwelle = statisches Limit):
  - `.svelte` files: limit 500 lines. Budget per file: Hero 234 (266 used / 500 limit), ServiceRow 220, WhyMe 322, FAQ 337, CallToAction 318, QuoteCard 396.
  - `.astro` files: limit 400 lines. Budget: Process 211, StatsStrip 264.
  - `global.css` (265 lines, non-baselined `.css` has no S1 limit — safe to extend).
- Brand guard: every Svelte component change must NOT affect the `isKore` branch in `index.astro`. Components in this plan are mentolder-only (`client:visible`/`client:load` rendered only in the `!isKore` branch).
- Commit after each task.

---

## Aufgabe 1: Scroll-Reveal-Utility in global.css + shared animation keyframes

### Requirement

Centralize all entrance `@keyframes` and the `.reveal` / `.reveal.visible` CSS classes in `global.css` so that each component can apply scroll-reveal by adding a class and calling a single `IntersectionObserver` in its `onMount`. Without this shared base, each component would duplicate the same `@keyframes` — a DRY violation.

### Scenario

**GIVEN** `global.css` is imported by every page via `Layout.astro`  
**WHEN** a component adds `class="reveal"` to a wrapper element  
**THEN** that element starts at `opacity: 0; transform: translateY(18px)` and transitions to `opacity: 1; transform: none` once the `.visible` class is applied by JS

**GIVEN** the user has `prefers-reduced-motion: reduce` set  
**WHEN** the same animation runs  
**THEN** the transition is instant (no motion)

#### Steps

- [ ] **Schritt 1: Append keyframes + reveal utility to `global.css`**

  - `target_file`: `website/src/styles/global.css`
  - `wc -l` aktuell: 265 / no S1 limit for `.css` (no extension entry in gates.yaml)

  Append exactly this block at the end of `website/src/styles/global.css`:

  ```css
  /* ── Shared entrance animations (homepage hifi-redesign T001034) ── */
  @keyframes halo-in {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* Scroll-reveal base — applied by IntersectionObserver in onMount */
  .reveal {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.55s ease, transform 0.55s ease;
  }
  .reveal.visible {
    opacity: 1;
    transform: none;
  }

  /* Staggered children: each .reveal child gets +100ms delay per index */
  .reveal-stagger > .reveal:nth-child(1) { transition-delay: 0ms; }
  .reveal-stagger > .reveal:nth-child(2) { transition-delay: 100ms; }
  .reveal-stagger > .reveal:nth-child(3) { transition-delay: 200ms; }
  .reveal-stagger > .reveal:nth-child(4) { transition-delay: 300ms; }

  @media (prefers-reduced-motion: reduce) {
    .reveal, .reveal.visible {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
  ```

- [ ] **Schritt 2: Verify no existing `.reveal` class conflicts**

  ```bash
  grep -rn "\.reveal" /tmp/wt-hifi-redesign/website/src/ --include="*.svelte" --include="*.astro" --include="*.css"
  ```

  Expected output: zero matches (or only the lines just added). If existing matches appear, rename the class to `.scroll-reveal` in both the global.css addition and all component uses in this plan.

- [ ] **Schritt 3: Check line count stays within budget**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/styles/global.css
  ```

  Expected: ≤ 310 lines (no S1 limit for `.css`).

- [ ] **Schritt 4: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/styles/global.css
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): add shared scroll-reveal keyframes + utility classes (T001034)"
  ```

---

## Aufgabe 2: Hero.svelte — Entrance-Animation + stärkerer Kicker-Kontrast

### Requirement

The Hero needs a polished entrance: the halo background animates in (`halo-in` keyframe), the copy block fades up (`fade-up`), and the kicker row gets higher contrast (color changed from `var(--mute)` to `var(--fg-soft)` so it reads clearly on dark background). Typography hierarchy stays unchanged — `clamp(44px, 6.2vw, 88px)` serif h1 is already correct.

### Scenario

**GIVEN** a user opens the mentolder homepage in a desktop browser  
**WHEN** the page finishes loading  
**THEN** the `.bg-halo` element plays a 0.6s `halo-in` ease-out animation, and the `.hero-copy` block plays a 0.5s `fade-up` ease-out animation with 0.1s delay (so halo appears first)

**GIVEN** a user opens on mobile (375px)  
**WHEN** the page loads  
**THEN** the hero grid is single-column, animations play identically, no overflow

#### Files

- Modify: `website/src/components/Hero.svelte`

#### Steps

- [ ] **Schritt 1: Check current line count and budget**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/Hero.svelte
  ```

  Expected: 266. Budget: 500 − 266 = **234 lines** available. This task adds ~8 CSS lines and touches 2 existing lines — net +6 lines. Well within budget.

- [ ] **Schritt 2: Update kicker-row color from `var(--mute)` to `var(--fg-soft)`**

  In `website/src/components/Hero.svelte`, find the `.kicker-row` style block (around line 145–154). Change:

  ```css
  /* BEFORE */
  .kicker-row {
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mute);
    margin-bottom: 26px;
  }
  ```

  To:

  ```css
  /* AFTER */
  .kicker-row {
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--fg-soft);
    margin-bottom: 26px;
  }
  ```

- [ ] **Schritt 3: Add entrance animations to `.bg-halo` and `.hero-copy`**

  In `website/src/components/Hero.svelte`, add `animation` to `.bg-halo` and `.hero-copy`:

  Find the `.bg-halo` rule (around line 96–102) and add one line:

  ```css
  .bg-halo {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
    animation: halo-in 0.6s ease-out both;
  }
  ```

  Find the `.hero-copy` rule (around line 140–143) and add one line:

  ```css
  .hero-copy {
    display: flex;
    flex-direction: column;
    animation: fade-up 0.5s 0.1s ease-out both;
  }
  ```

  The keyframes `halo-in` and `fade-up` are defined in `global.css` (Aufgabe 1) — no local `@keyframes` needed.

- [ ] **Schritt 4: Add reduced-motion guard for Hero-specific animations**

  At the bottom of the `<style>` block in `Hero.svelte`, add:

  ```css
  @media (prefers-reduced-motion: reduce) {
    .bg-halo, .hero-copy {
      animation: none;
    }
  }
  ```

- [ ] **Schritt 5: Verify line count stays within S1 limit**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/Hero.svelte
  ```

  Expected: ≤ 275 (well under 500 limit).

- [ ] **Schritt 6: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/Hero.svelte
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): Hero entrance animation + kicker contrast (T001034)"
  ```

---

## Aufgabe 3: ServiceRow.svelte — Glassmorphism Card + Staggered Scroll-Reveal

### Requirement

Each service row needs a glassmorphism treatment: a `border-top: 2px solid var(--brass)` on hover (currently `border-top: 1px solid var(--line)` static), and a subtle `backdrop-filter: blur(6px)` on the hover background. Additionally, the parent `.offers` list in `index.astro` needs `class="offers reveal-stagger"` so each `ServiceRow` wrapping `<div>` picks up staggered scroll-reveal, and each `ServiceRow` itself needs the IntersectionObserver wired to add `.visible`.

The `ServiceRow` component renders with `client:visible` (Astro island), so `onMount` runs in the browser after the element is in view — the observer is a secondary enhancement for the stagger delay visual.

### Scenario

**GIVEN** a user scrolls to the Angebote section  
**WHEN** the three ServiceRow elements enter the viewport  
**THEN** each row fades up with 100ms stagger between rows (first at 0ms, second at 100ms, third at 200ms delay)

**GIVEN** a user hovers over a ServiceRow on desktop  
**WHEN** the mouse enters the `.offer` div  
**THEN** the top border transitions to 2px brass and the background shows a subtle glassmorphism highlight over 0.25s

#### Files

- Modify: `website/src/components/ServiceRow.svelte`
- Modify: `website/src/pages/index.astro` (add `reveal-stagger` class + per-row `reveal` class wrapper)

#### Steps

- [ ] **Schritt 1: Check line counts**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/ServiceRow.svelte
  wc -l /tmp/wt-hifi-redesign/website/src/pages/index.astro
  ```

  Expected: 280 (budget 220) and 242 (budget: `.astro` limit 400, so 158 lines free). This task adds ~15 CSS lines to ServiceRow and 2 class attributes to index.astro.

- [ ] **Schritt 2: Add `onMount` scroll-reveal to ServiceRow.svelte**

  At the top of the `<script lang="ts">` block in `website/src/components/ServiceRow.svelte`, add the import and observer setup:

  ```typescript
  import { onMount } from 'svelte';

  // ... existing interface Props { ... } and let { ... }: Props = $props(); stay unchanged ...

  let offerEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    if (!offerEl) return;
    offerEl.classList.add('reveal');
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          offerEl!.classList.add('visible');
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(offerEl);
    return () => obs.disconnect();
  });
  ```

- [ ] **Schritt 3: Bind the ref on the root element in ServiceRow.svelte**

  In the template, change the opening `<div class="offer">` to:

  ```svelte
  <div class="offer" bind:this={offerEl}>
  ```

- [ ] **Schritt 4: Upgrade `.offer` hover styles in ServiceRow.svelte**

  Find the `.offer` CSS rule and update the `border-top` and hover to:

  ```css
  .offer {
    display: grid;
    grid-template-columns: 80px 1fr 1.6fr 220px 140px;
    gap: 36px;
    align-items: start;
    padding: 36px 0;
    border-top: 1px solid var(--line);
    transition: border-color 0.25s ease, background 0.25s ease;
    position: relative;
  }

  .offer:hover {
    border-top-color: var(--brass);
    border-top-width: 2px;
    background: linear-gradient(to right, transparent, var(--brass-d) 40%, transparent);
  }
  ```

  Note: `var(--brass-d)` is `oklch(0.80 0.09 75 / 0.14)` — defined in `factory-tokens.css`, no hardcoding needed.

- [ ] **Schritt 5: Add `reveal-stagger` to the offers wrapper in index.astro**

  In `website/src/pages/index.astro`, find the line:

  ```html
  <div class="offers" role="list" aria-label="Angebote">
  ```

  Change to:

  ```html
  <div class="offers reveal-stagger" role="list" aria-label="Angebote">
  ```

  The individual `<div role="listitem">` wrappers do NOT need the `.reveal` class — each `ServiceRow` manages its own `offerEl` ref via `onMount`.

- [ ] **Schritt 6: Verify line counts within S1 limits**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/ServiceRow.svelte
  wc -l /tmp/wt-hifi-redesign/website/src/pages/index.astro
  ```

  Expected: ServiceRow ≤ 300 (limit 500, budget fine), index.astro ≤ 244 (limit 400, fine).

- [ ] **Schritt 7: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/ServiceRow.svelte website/src/pages/index.astro
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): ServiceRow glassmorphism hover + staggered scroll-reveal (T001034)"
  ```

---

## Aufgabe 4: WhyMe.svelte — Brass-Connector zwischen Points + QuoteCard Scroll-Reveal

### Requirement

The numbered points list needs a visual connector: a 2px vertical brass line running through the `.point-num` column, connecting all items. This is achieved with a CSS `::before` pseudo-element on `.points` (the `<ol>`). Additionally, the entire section fades in on scroll via `IntersectionObserver`.

QuoteCard (`QuoteCard.svelte`) gets a subtle entrance animation via a `.reveal`-class added in `onMount` — no changes to `QuoteCard.svelte` itself since it's rendered inside WhyMe.

### Scenario

**GIVEN** a user scrolls to the "Warum ich" section  
**WHEN** the section enters the viewport  
**THEN** the whole section fades up over 0.55s (`.reveal` class)

**GIVEN** a user reads the numbered points on desktop  
**WHEN** the points are visible  
**THEN** a thin brass vertical line runs through the number column connecting items 01, 02, 03

#### Files

- Modify: `website/src/components/WhyMe.svelte`

#### Steps

- [ ] **Schritt 1: Check line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/WhyMe.svelte
  ```

  Expected: 178. Budget: 500 − 178 = **322 lines** available. This task adds ~20 CSS lines and ~15 script lines.

- [ ] **Schritt 2: Add `onMount` scroll-reveal to WhyMe.svelte**

  In the `<script lang="ts">` block, add after the `$props()` destructure:

  ```typescript
  import { onMount } from 'svelte';

  // existing: let { headline, intro, points, quote, quoteName, quoteRole = '' }: Props = $props();

  let sectionEl = $state<HTMLElement | null>(null);

  onMount(() => {
    if (!sectionEl) return;
    sectionEl.classList.add('reveal');
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          sectionEl!.classList.add('visible');
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(sectionEl);
    return () => obs.disconnect();
  });
  ```

- [ ] **Schritt 3: Bind ref on section element**

  Change:

  ```svelte
  <section class="why section" id="ueber" aria-labelledby="why-heading">
  ```

  To:

  ```svelte
  <section class="why section" id="ueber" aria-labelledby="why-heading" bind:this={sectionEl}>
  ```

- [ ] **Schritt 4: Add brass vertical connector line on `.points`**

  In the `<style>` block, update the `.points` rule and add a `::before` pseudo-element:

  ```css
  .points {
    list-style: none;
    padding: 0;
    margin: 40px 0 0;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* Brass vertical connector through number column */
  .points::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 27px; /* center of the 56px number column */
    width: 1px;
    background: linear-gradient(to bottom, var(--brass) 0%, transparent 100%);
    opacity: 0.25;
    pointer-events: none;
  }
  ```

- [ ] **Schritt 5: Elevate `.point-num` z-index so it sits above the line**

  Add `position: relative; z-index: 1; background: var(--ink-850);` to `.point-num` so the number appears on top of the connector line (otherwise the line cuts through the text):

  ```css
  .point-num {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--brass);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding-top: 6px;
    position: relative;
    z-index: 1;
    background: var(--ink-850);
    padding-bottom: 2px;
  }
  ```

- [ ] **Schritt 6: Hide the connector line on mobile (stacked layout)**

  ```css
  @media (max-width: 960px) {
    .points::before {
      display: none;
    }
  }
  ```

  This goes inside the existing `@media (max-width: 960px)` block (or added below it — either works since it's non-conflicting).

- [ ] **Schritt 7: Verify line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/WhyMe.svelte
  ```

  Expected: ≤ 215 (limit 500, fine).

- [ ] **Schritt 8: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/WhyMe.svelte
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): WhyMe brass connector + scroll-reveal (T001034)"
  ```

---

## Aufgabe 5: FAQ.svelte — Smooth-Height-Transition + Chevron-Verbesserung

### Requirement

The current FAQ uses `hidden` attribute which snaps the answer open/closed with no animation. Replace with a CSS `grid-template-rows: 0fr → 1fr` technique (no `hidden` attribute, instead `aria-expanded` drives the grid row height via a CSS class toggle). The chevron already rotates via `.open` class — keep that and add a color transition.

### Scenario

**GIVEN** a user clicks an FAQ question  
**WHEN** the answer expands  
**THEN** the answer panel smoothly grows from height 0 to full height over 0.3s using `grid-template-rows` — no jump, no layout shift

**GIVEN** the same item is clicked again  
**WHEN** it collapses  
**THEN** the panel smoothly shrinks to 0 height

**GIVEN** a user navigates with keyboard only  
**WHEN** they press Enter/Space on a focused FAQ button  
**THEN** the `aria-expanded` attribute updates correctly and the panel expands

#### Files

- Modify: `website/src/components/FAQ.svelte`

#### Steps

- [ ] **Schritt 1: Check line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/FAQ.svelte
  ```

  Expected: 163. Budget: 500 − 163 = **337 lines** available. This task adds ~15 lines and removes 5 (net +10).

- [ ] **Schritt 2: Remove `hidden` attribute, replace with CSS grid animation**

  The current template uses `hidden={openIndex !== i}` on the answer div. This prevents CSS transitions. Replace the answer div markup:

  **Before** (lines ~51–60):
  ```svelte
  <div
    id="faq-answer-{i}"
    role="region"
    aria-label={item.question}
    hidden={openIndex !== i}
    class="faq-answer"
  >
    {item.answer}
  </div>
  ```

  **After:**
  ```svelte
  <div
    id="faq-answer-{i}"
    role="region"
    aria-label={item.question}
    class="faq-answer {openIndex === i ? 'open' : ''}"
  >
    <div class="faq-answer-inner">{item.answer}</div>
  </div>
  ```

  The `aria-expanded` attribute on the `<button>` already handles accessibility — `hidden` is not needed for screen readers when `aria-controls` + `aria-expanded` are set.

- [ ] **Schritt 3: Update `.faq-answer` CSS to use grid-row animation**

  Replace the existing `.faq-answer` rule:

  ```css
  /* BEFORE */
  .faq-answer {
    padding: 0 24px 20px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--mute);
    border-top: 1px solid var(--line);
    padding-top: 16px;
    margin-top: -1px;
  }
  ```

  With:

  ```css
  /* AFTER */
  .faq-answer {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.3s ease;
    overflow: hidden;
  }

  .faq-answer.open {
    grid-template-rows: 1fr;
  }

  .faq-answer-inner {
    min-height: 0; /* required for grid-template-rows trick */
    padding: 0 24px 20px;
    padding-top: 16px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--mute);
    border-top: 1px solid var(--line);
    margin-top: -1px;
  }
  ```

- [ ] **Schritt 4: Add color transition to `.faq-chevron`**

  Find the `.faq-chevron` rule and add `color` to its transition:

  ```css
  .faq-chevron {
    width: 20px;
    height: 20px;
    color: var(--mute);
    flex-shrink: 0;
    transition: transform 0.3s ease, color 0.25s ease;
  }

  .faq-chevron.open {
    transform: rotate(180deg);
    color: var(--brass);
  }
  ```

  Note: changed default color from `var(--brass)` to `var(--mute)`, activating it on open. This creates a clear visual state difference.

- [ ] **Schritt 5: Verify keyboard accessibility — no change needed**

  The `toggle(i)` function and `aria-expanded` on the `<button>` are unchanged. The `onclick` handler still fires on keyboard Enter/Space via native button behavior. No additional step required.

- [ ] **Schritt 6: Verify line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/FAQ.svelte
  ```

  Expected: ≤ 180 (limit 500, fine).

- [ ] **Schritt 7: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/FAQ.svelte
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): FAQ smooth-height accordion + chevron color transition (T001034)"
  ```

---

## Aufgabe 6: CallToAction.svelte — Prominentere Button-Styles + Glow-Intensität

### Requirement

The CTA section needs two improvements: (1) the primary button gets a `box-shadow` glow matching `var(--brass)` on hover for visual prominence, and (2) the radial gradient glow at the bottom of the section (`radial-gradient(ellipse at 50% 100%, oklch(0.80 0.09 75 / .16), ...)`) gets raised from 0.16 to 0.22 opacity and the ellipse radius extended from 60% to 75% — making the CTA feel more inviting. Section fades in via `IntersectionObserver`.

### Scenario

**GIVEN** a user reaches the CTA section by scrolling  
**WHEN** the section enters the viewport  
**THEN** the CTA section fades up over 0.55s

**GIVEN** a user hovers over "Kostenloses Erstgespräch" button  
**WHEN** hovering  
**THEN** a brass-colored box-shadow glow appears around the button over 0.25s

#### Files

- Modify: `website/src/components/CallToAction.svelte`

#### Steps

- [ ] **Schritt 1: Check line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/CallToAction.svelte
  ```

  Expected: 182. Budget: 500 − 182 = **318 lines** available.

- [ ] **Schritt 2: Add `onMount` scroll-reveal to CallToAction.svelte**

  Add import and state at top of `<script>`:

  ```typescript
  import { onMount } from 'svelte';

  // existing $props() destructure stays unchanged

  let sectionEl = $state<HTMLElement | null>(null);

  onMount(() => {
    if (!sectionEl) return;
    sectionEl.classList.add('reveal');
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          sectionEl!.classList.add('visible');
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(sectionEl);
    return () => obs.disconnect();
  });
  ```

- [ ] **Schritt 3: Bind ref on section**

  Change:
  ```svelte
  <section class="cta" id="termin" aria-labelledby="cta-heading">
  ```

  To:
  ```svelte
  <section class="cta" id="termin" aria-labelledby="cta-heading" bind:this={sectionEl}>
  ```

- [ ] **Schritt 4: Intensify the `.glow` radial gradient**

  Find the `.glow` CSS rule and update:

  ```css
  .glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 100%, oklch(0.80 0.09 75 / .22), transparent 75%);
    pointer-events: none;
  }
  ```

  (Changed: opacity `.16` → `.22`, radius `60%` → `75%`.)

- [ ] **Schritt 5: Add box-shadow to `.btn-primary:hover`**

  Find `.btn-primary:hover` and add `box-shadow`:

  ```css
  .btn-primary:hover {
    background: var(--brass-2);
    transform: translateY(-1px);
    box-shadow: 0 0 28px oklch(0.80 0.09 75 / 0.45);
  }
  ```

- [ ] **Schritt 6: Verify line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/CallToAction.svelte
  ```

  Expected: ≤ 205 (limit 500, fine).

- [ ] **Schritt 7: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/CallToAction.svelte
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): CTA glow intensification + primary button box-shadow (T001034)"
  ```

---

## Aufgabe 7: Process.astro — Stärkere Connector-Linie + Brass-Nummerierung verbessert

### Requirement

The horizontal connector line in `.steps-rail::before` has `opacity: 0.4` — increase to `0.6` for better visual presence. The `step-dot` gets a subtle `box-shadow` glow to highlight the brass pip. On mobile (2-column grid), the connector line is already hidden — keep that.

Process.astro is a static Astro component (no JS island), so no `IntersectionObserver`. The section scroll-reveal is not applicable here without converting to Svelte — skip that for this component to avoid unnecessary complexity.

### Scenario

**GIVEN** a user views the Process section on desktop  
**WHEN** the section is visible  
**THEN** the horizontal connector line is clearly visible at 60% opacity, and each step-dot glows with a brass halo

**GIVEN** a user views on mobile**  
**WHEN** viewport ≤ 720px  
**THEN** the connector line is hidden (existing behavior preserved), steps stack in 2-column grid

#### Files

- Modify: `website/src/components/Process.astro`

#### Steps

- [ ] **Schritt 1: Check line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/Process.astro
  ```

  Expected: 189. Budget: 400 − 189 = **211 lines** available.

- [ ] **Schritt 2: Update connector line opacity**

  Find `.steps-rail::before` and change `opacity: 0.4` to `opacity: 0.6`:

  ```css
  .steps-rail::before {
    content: "";
    position: absolute;
    top: 14px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(to right, var(--line), var(--brass) 20%, var(--brass) 80%, var(--line));
    opacity: 0.6;
    pointer-events: none;
  }
  ```

- [ ] **Schritt 3: Add box-shadow glow to `.step-dot`**

  Find `.step-dot` and add `box-shadow`:

  ```css
  .step-dot {
    position: absolute;
    top: 8px;
    left: 0;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ink-900);
    border: 1px solid var(--brass);
    box-shadow: 0 0 8px oklch(0.80 0.09 75 / 0.5);
  }
  ```

- [ ] **Schritt 4: Verify line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/Process.astro
  ```

  Expected: ≤ 196 (limit 400, fine).

- [ ] **Schritt 5: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/Process.astro
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): Process connector visibility + step-dot glow (T001034)"
  ```

---

## Aufgabe 8: StatsStrip.astro — Brass-Akzent-Zahlen + verbesserte Responsiveness

### Requirement

Stats numbers already use `var(--fg)` — change the `.stat-num` color to `var(--brass)` so the numbers themselves are brass-accented (currently only the `<em>` tag inside is brass via the `:global(em)` rule). This makes the stats feel bolder and more on-brand. The inline `<em>` markup in `set:html` becomes redundant for the brass color but stays for semantic reasons.

Also: on mobile (≤720px), the `4-column → 2-column` grid already works. Add `min-width: 0` to `.stat` to prevent number overflow on very narrow screens.

### Scenario

**GIVEN** a user sees the stats strip on any viewport  
**WHEN** looking at the numbers (e.g. "30+", "500+")  
**THEN** all stat numbers are brass-colored, with the special characters (`+`, `KI`) remaining brass via the em rule (consistent, not double-colored)

**GIVEN** a device with 360px width  
**WHEN** viewing stats  
**THEN** numbers do not overflow their cells

#### Files

- Modify: `website/src/components/StatsStrip.astro`

#### Steps

- [ ] **Schritt 1: Check line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/StatsStrip.astro
  ```

  Expected: 136. Budget: 400 − 136 = **264 lines** available.

- [ ] **Schritt 2: Change `.stat-num` color to `var(--brass)`**

  Find `.stat-num` and update color:

  ```css
  .stat-num {
    font-family: var(--serif);
    font-size: 44px;
    line-height: 1;
    color: var(--brass);
    letter-spacing: -0.02em;
    min-width: 0;
    word-break: break-word;
  }
  ```

  (Changed `color: var(--fg)` → `color: var(--brass)`, added `min-width: 0; word-break: break-word`.)

- [ ] **Schritt 3: Adjust em rule — em stays brass but ensure consistency**

  The existing `.stat-num :global(em)` sets `color: var(--brass); font-style: normal;` — now that the parent is also brass, the em rule is visually the same. Keep it unchanged (it's correct and harmless — the `font-style: normal` override is still needed).

- [ ] **Schritt 4: Add `min-width: 0` to `.stat` as well**

  ```css
  .stat {
    padding: 38px 28px;
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  ```

- [ ] **Schritt 5: Verify line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/StatsStrip.astro
  ```

  Expected: ≤ 142 (limit 400, fine).

- [ ] **Schritt 6: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/StatsStrip.astro
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): StatsStrip brass stat numbers + overflow guard (T001034)"
  ```

---

## Aufgabe 9: QuoteCard.svelte — Enhanced visual treatment

### Requirement

QuoteCard needs its `blockquote` font-size bumped from `26px` to `clamp(22px, 2.8vw, 30px)` for better typographic hierarchy on larger screens, and the `.mark-q` opacity raised from `0.4` to `0.6` for stronger decorative presence. Additionally, the card border gets a subtle `box-shadow` using `var(--brass-d)` for depth.

### Scenario

**GIVEN** a user views the WhyMe section with QuoteCard on a 1440px screen  
**WHEN** looking at the quote  
**THEN** the quote text scales comfortably between 22px and 30px using clamp, and the decorative quotation mark is more visible at 60% opacity

**GIVEN** a user views on mobile  
**WHEN** QuoteCard renders below the WhyMe points  
**THEN** the quote text stays legible at minimum 22px with no overflow

#### Files

- Modify: `website/src/components/QuoteCard.svelte`

#### Steps

- [ ] **Schritt 1: Check line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/QuoteCard.svelte
  ```

  Expected: 104. Budget: 500 − 104 = **396 lines** available.

- [ ] **Schritt 2: Update `blockquote` font-size to clamp**

  Find `blockquote` in the `<style>` block and update:

  ```css
  blockquote {
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(22px, 2.8vw, 30px);
    line-height: 1.35;
    color: var(--fg);
    margin: 32px 0 28px;
    font-weight: 350;
    letter-spacing: -0.01em;
    position: relative;
    z-index: 1;
  }
  ```

- [ ] **Schritt 3: Raise `.mark-q` opacity and adjust top position**

  ```css
  .mark-q {
    font-family: var(--serif);
    font-size: 120px;
    line-height: 0.5;
    color: var(--brass);
    opacity: 0.6;
    position: absolute;
    top: 30px;
    left: 30px;
    font-style: italic;
    pointer-events: none;
    user-select: none;
  }
  ```

- [ ] **Schritt 4: Add `box-shadow` to `.quote-card`**

  Find `.quote-card` and add `box-shadow`:

  ```css
  .quote-card {
    position: relative;
    padding: 44px 44px 40px;
    background:
      radial-gradient(circle at 0% 0%, oklch(0.80 0.09 75 / .12), transparent 50%),
      var(--ink-800);
    border: 1px solid var(--line-2);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: 0 8px 40px oklch(0.80 0.09 75 / 0.08);
  }
  ```

- [ ] **Schritt 5: Verify line count**

  ```bash
  wc -l /tmp/wt-hifi-redesign/website/src/components/QuoteCard.svelte
  ```

  Expected: ≤ 112 (limit 500, fine).

- [ ] **Schritt 6: Commit**

  ```bash
  git -C /tmp/wt-hifi-redesign add website/src/components/QuoteCard.svelte
  git -C /tmp/wt-hifi-redesign commit -m "feat(homepage): QuoteCard clamp font-size + mark opacity + card shadow (T001034)"
  ```

---

## Aufgabe 10: Verifikation — CI-Gates, visuelle Kontrolle

### Requirement

Run all CI-equivalent checks locally, verify no S1 regressions, and do a quick visual spot-check in the dev server before pushing.

### Scenario

**GIVEN** all component changes from Aufgaben 1–9 are committed  
**WHEN** `task test:changed` and `task freshness:check` run  
**THEN** all gates pass (S1–S4 ratchet clean, no import cycles, no hardcoded hostnames, no orphan manifests)

**GIVEN** the dev server runs  
**WHEN** the mentolder homepage is opened at `http://localhost:4321`  
**THEN** Hero entrance animation plays, ServiceRows stagger in on scroll, FAQ accordion animates smoothly, stats numbers are brass, CTA glow is prominent

#### Steps

- [ ] **Schritt 0: Smoke-Test vor Implementierung (rot-grün-Verifikation)**

  Vor der eigentlichen Änderung sicherstellen, dass die CI-Gate-Befehle grundsätzlich laufen
  (auch wenn keine Änderungen vorhanden — Baseline-Check). Erwartetes Verhalten: test:changed
  läuft durch, Freshness-Delta erzeugt nichts. Falls ein Test hier unerwartet fehlschlägt,
  ist das expected: FAIL (pre-existing issue), vor der Implementierung dokumentieren und
  als Blocker melden, nicht ignorieren.

  ```bash
  cd /tmp/wt-hifi-redesign
  task test:changed || true   # expected: FAIL wenn pre-existing issues vorhanden
  ```

- [ ] **Schritt 1: Run targeted test suite**

  ```bash
  cd /tmp/wt-hifi-redesign
  task test:changed
  ```

  Expected: all tests pass (Vitest + BATS selection for `website` domain). If a test fails, fix before proceeding.

- [ ] **Schritt 2: TypeScript type-check**

  ```bash
  cd /tmp/wt-hifi-redesign
  pnpm -C website type-check
  ```

  Expected: no errors. Common pitfall: `$state<HTMLElement | null>(null)` requires `HTMLElement` not `Element` — `bind:this` on `<section>` gives `HTMLElement`, on `<div>` gives `HTMLDivElement` (extends `HTMLElement`) — both are fine.

- [ ] **Schritt 3: Regenerate freshness artifacts**

  ```bash
  cd /tmp/wt-hifi-redesign
  task freshness:regenerate
  ```

  Expected: completes without error. This updates `test-inventory.json`, `repo-index.json`, and any other freshness artifacts.

- [ ] **Schritt 4: Run freshness check (CI-equivalent S1–S4 gate)**

  ```bash
  cd /tmp/wt-hifi-redesign
  task freshness:check
  ```

  Expected: all gates green. If S1 fails for a component, go back to that Aufgabe and reduce lines (remove unnecessary comments, consolidate whitespace — do NOT add baseline entries).

- [ ] **Schritt 5: Manual visual check — dev server**

  ```bash
  cd /tmp/wt-hifi-redesign/website
  pnpm dev
  ```

  Open `http://localhost:4321` in a browser (BRAND_ID not set → defaults to `mentolder`). Check:
  - Hero halo and copy fade-in play on load
  - Kicker row text is legible (fg-soft, not muted)
  - ServiceRows stagger in when scrolling to Angebote section
  - FAQ items expand/collapse with smooth height animation
  - FAQ chevron changes color from mute → brass when open
  - Stats numbers are brass-colored
  - CTA glow is more prominent, button glows on hover
  - Process connector line is more visible
  - QuoteCard has shadow depth

  Kill dev server with Ctrl+C when done.

- [ ] **Schritt 6: Verify no Kore regression**

  Set `BRAND_ID=korczewski pnpm dev` and confirm the korczewski homepage renders without any visual change (the `!isKore` branch in `index.astro` is untouched — all components modified here are mentolder-only).

  ```bash
  cd /tmp/wt-hifi-redesign/website
  BRAND_ID=korczewski pnpm dev
  ```

  Open `http://localhost:4321` — should show the KoreHomepage component, not the mentolder layout.

- [ ] **Schritt 7: Validate openspec change directory**

  ```bash
  cd /tmp/wt-hifi-redesign && bash scripts/openspec.sh validate 2>&1 | tail -10
  ```

  Expected: `openspec validate: OK`

- [ ] **Schritt 8: Final commit of freshness artifacts if changed**

  ```bash
  cd /tmp/wt-hifi-redesign
  git status
  ```

  If `freshness:regenerate` produced changes (e.g. updated `docs/code-quality/repo-index.json`):

  ```bash
  git add docs/code-quality/repo-index.json website/src/data/test-inventory.json
  git commit -m "chore: regenerate freshness artifacts after homepage hifi-redesign (T001034)"
  ```

  If nothing changed, skip this step.
