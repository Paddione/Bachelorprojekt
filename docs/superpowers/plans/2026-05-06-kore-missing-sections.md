---
title: Kore Homepage — Missing Sections Implementation Plan
domains: [website]
status: completed
pr_number: null
---

# Kore Homepage — Missing Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 missing sections (Services, WhyMe, Process, FAQ) to the Kore homepage in the dark Kore-native style, fix a broken nav anchor, and update section numbering.

**Architecture:** Data for Services, WhyMe, and FAQ is already fetched at the top of `index.astro`; the new components accept it as props to avoid double fetches. `KoreProcess` is static (no data). All components follow the `w-section` / `.head` / `.num` / `.hint` pattern from `kore-website.css`.

**Tech Stack:** Astro 4, Svelte 5 (runes), TypeScript, Kore CSS (`website/src/styles/kore-website.css`)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `website/src/components/kore/KoreServices.astro` | Professional services list |
| Create | `website/src/components/kore/KoreWhyMe.astro` | Value proposition + quote |
| Create | `website/src/components/kore/KoreProcess.astro` | 4-step workflow (static) |
| Create | `website/src/components/kore/KoreFaq.astro` | FAQ accordion (`<details>`) |
| Modify | `website/src/components/kore/KoreSubNav.astro` | Fix `#notes` → `#timeline` nav anchor |
| Modify | `website/src/components/kore/KorePillars.astro` | `id="services"` → `id="work"`, renumber |
| Modify | `website/src/components/kore/KoreTimeline.svelte` | Renumber `02/04` → `05/07` |
| Modify | `website/src/components/kore/KoreBugs.astro` | Renumber `03/04` → `06/07` |
| Modify | `website/src/components/kore/KoreTeam.astro` | Renumber `04/04` → `07/07` |
| Modify | `website/src/components/kore/KoreContact.astro` | Renumber `— / 04` → `— / 07` |
| Modify | `website/src/pages/index.astro` | Import + place 4 new components in korczewski branch |

---

## Task 1: Nav fix + KorePillars id + renumber existing sections

**Files:**
- Modify: `website/src/components/kore/KoreSubNav.astro`
- Modify: `website/src/components/kore/KorePillars.astro`
- Modify: `website/src/components/kore/KoreTimeline.svelte`
- Modify: `website/src/components/kore/KoreBugs.astro`
- Modify: `website/src/components/kore/KoreTeam.astro`
- Modify: `website/src/components/kore/KoreContact.astro`

- [ ] **Step 1.1: Fix KoreSubNav — `#notes` → `#timeline`**

In `website/src/components/kore/KoreSubNav.astro`, find the links array and change the `notes` entry id so the generated href becomes `#timeline`:

```astro
const links = [
  { id: 'work',     label: 'Cluster' },
  { id: 'services', label: 'Leistungen' },
  { id: 'team',     label: 'Über mich' },
  { id: 'timeline', label: 'Notizen' },
  { id: 'contact',  label: 'Kontakt' },
];
```

(Was `{ id: 'notes', label: 'Notizen' }` — KoreTimeline uses `id="timeline"`, not `id="notes"`.)

- [ ] **Step 1.2: Fix KorePillars — id + renumber**

In `website/src/components/kore/KorePillars.astro` line 37:

```astro
<section class="w-section" id="work">
  <div class="head">
    <span class="num">04 / 07</span>
```

(Was `id="services"` and `01 / 04`.)

- [ ] **Step 1.3: Renumber KoreTimeline**

In `website/src/components/kore/KoreTimeline.svelte` line 40:

```svelte
    <span class="num">05 / 07</span>
```

(Was `02 / 04`.)

- [ ] **Step 1.4: Renumber KoreBugs**

In `website/src/components/kore/KoreBugs.astro` line 22:

```astro
    <span class="num">06 / 07</span>
```

(Was `03 / 04`.)

- [ ] **Step 1.5: Renumber KoreTeam**

In `website/src/components/kore/KoreTeam.astro` line 13:

```astro
    <span class="num">07 / 07</span>
```

(Was `04 / 04`.)

- [ ] **Step 1.6: Renumber KoreContact**

In `website/src/components/kore/KoreContact.astro` line 36:

```astro
    <span class="num">— / 07</span>
```

(Was `— / 04`.)

- [ ] **Step 1.7: Commit**

```bash
git add website/src/components/kore/KoreSubNav.astro \
        website/src/components/kore/KorePillars.astro \
        website/src/components/kore/KoreTimeline.svelte \
        website/src/components/kore/KoreBugs.astro \
        website/src/components/kore/KoreTeam.astro \
        website/src/components/kore/KoreContact.astro
git commit -m "fix(kore): fix nav anchor + pillar id + renumber sections 01-07"
```

---

## Task 2: Create KoreServices.astro

**Files:**
- Create: `website/src/components/kore/KoreServices.astro`

- [ ] **Step 2.1: Create the component**

Create `website/src/components/kore/KoreServices.astro` with this content:

```astro
---
import type { HomepageService } from '../../config/types';

type Props = {
  services: (HomepageService & { hidden?: boolean })[];
};

const { services } = Astro.props;

const serviceMeta: Record<string, string> = {
  'digital-cafe':   'Einzeln · Gruppe · Pakete',
  'coaching':       'Sparring auf Augenhöhe',
  'beratung':       'Mittelstand · Verwaltung',
  'ki-transition':  'Unlearning · Neuorientierung · Strategie',
  'ki-beratung':    'Strategie · Tool-Auswahl · Compliance',
  'software-dev':   'Architektur · Review · Umsetzung',
  'deployment':     'K8s · GitOps · Self-Hosted',
};
---

{services.length > 0 && (
  <section class="w-section" id="services">
    <div class="head">
      <span class="num">01 / 07</span>
      <h2>Was ich <em class="em">anbiete.</em></h2>
      <span class="hint">direkt · kein Funnel</span>
    </div>
    <div class="svc-rows">
      {services.map((svc, i) => (
        <article class="svc-row">
          <span class="svc-num">{String(i + 1).padStart(2, '0')}</span>
          <div class="svc-body">
            <h3>{svc.title}</h3>
            {serviceMeta[svc.slug] && <p class="svc-meta">{serviceMeta[svc.slug]}</p>}
            <p class="svc-desc">{svc.description}</p>
          </div>
          <div class="svc-right">
            <span class="svc-price">{svc.price}</span>
            <a href="#contact" class="svc-cta">Anfragen →</a>
          </div>
        </article>
      ))}
    </div>
  </section>
)}

<style>
  .svc-rows {
    display: flex;
    flex-direction: column;
  }

  .svc-row {
    display: grid;
    grid-template-columns: 48px 1fr auto;
    gap: 24px;
    align-items: start;
    padding: 28px 0;
    border-bottom: 1px solid var(--line);
    transition: background 200ms var(--ease);
  }

  .svc-row:first-child { border-top: 1px solid var(--line); }

  .svc-num {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--mute);
    padding-top: 4px;
  }

  .svc-body h3 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 22px;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0 0 6px;
  }

  .svc-meta {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--copper);
    margin: 0 0 10px;
  }

  .svc-desc {
    font-family: var(--sans);
    font-size: 14.5px;
    line-height: 1.55;
    color: var(--fg-soft);
    margin: 0;
    max-width: 52ch;
  }

  .svc-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    padding-top: 4px;
    min-width: 120px;
  }

  .svc-price {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--fg-soft);
    white-space: nowrap;
  }

  .svc-cta {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--copper);
    text-decoration: none;
    white-space: nowrap;
  }

  .svc-cta:hover { text-decoration: underline; text-underline-offset: 3px; }

  @media (max-width: 768px) {
    .svc-row { grid-template-columns: 36px 1fr; }
    .svc-right { grid-column: 2; flex-direction: row; align-items: center; padding-top: 0; }
  }
</style>
```

- [ ] **Step 2.2: Commit**

```bash
git add website/src/components/kore/KoreServices.astro
git commit -m "feat(kore): add KoreServices section — professional offerings list"
```

---

## Task 3: Create KoreWhyMe.astro

**Files:**
- Create: `website/src/components/kore/KoreWhyMe.astro`

- [ ] **Step 3.1: Create the component**

Create `website/src/components/kore/KoreWhyMe.astro`:

```astro
---
import type { HomepageContent } from '../../lib/website-db';

type Props = { homepage: HomepageContent };
const { homepage } = Astro.props;

const { whyMeHeadline, whyMeIntro, whyMePoints, quote, quoteName } = homepage;
---

<section class="w-section" id="why">
  <div class="head">
    <span class="num">02 / 07</span>
    <h2>Warum <em class="em">ich.</em></h2>
    <span class="hint">{whyMePoints.length} Gründe</span>
  </div>

  <div class="why-grid">
    <div class="why-left">
      <p class="why-intro">{whyMeIntro}</p>
      <ul class="why-points">
        {whyMePoints.map((pt) => (
          <li>
            <span class="pt-title">{pt.title}</span>
            <span class="pt-text">{pt.text}</span>
          </li>
        ))}
      </ul>
    </div>
    <blockquote class="why-quote">
      <p>"{quote}"</p>
      <cite>{quoteName}</cite>
    </blockquote>
  </div>
</section>

<style>
  .why-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
    align-items: start;
  }

  .why-intro {
    font-family: var(--sans);
    font-size: 17px;
    line-height: 1.65;
    color: var(--fg-soft);
    margin: 0 0 32px;
    max-width: 48ch;
  }

  .why-points {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .why-points li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 18px 0;
    border-top: 1px solid var(--line);
  }

  .why-points li:last-child { border-bottom: 1px solid var(--line); }

  .pt-title {
    font-family: var(--serif);
    font-size: 17px;
    color: var(--fg);
    letter-spacing: -0.01em;
  }

  .pt-text {
    font-family: var(--sans);
    font-size: 13.5px;
    color: var(--fg-soft);
    line-height: 1.55;
  }

  .why-quote {
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 40px;
    background: var(--ink-850);
    position: relative;
    overflow: hidden;
    margin: 0;
  }

  .why-quote::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(70% 60% at 100% 0%, rgba(200,247,106,.07), transparent 60%);
  }

  .why-quote p {
    font-family: var(--serif);
    font-size: 22px;
    font-style: italic;
    line-height: 1.5;
    color: var(--fg-soft);
    margin: 0 0 24px;
    position: relative;
  }

  .why-quote cite {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--copper);
    font-style: normal;
    position: relative;
  }

  @media (max-width: 980px) {
    .why-grid { grid-template-columns: 1fr; }
  }
</style>
```

- [ ] **Step 3.2: Commit**

```bash
git add website/src/components/kore/KoreWhyMe.astro
git commit -m "feat(kore): add KoreWhyMe section — value proposition + quote"
```

---

## Task 4: Create KoreProcess.astro

**Files:**
- Create: `website/src/components/kore/KoreProcess.astro`

- [ ] **Step 4.1: Create the component**

Create `website/src/components/kore/KoreProcess.astro`:

```astro
---
const steps = [
  { num: '01', heading: 'Erstgespräch', description: '30 Minuten, kostenlos. Wir klären Ihre Situation und Ihre Herausforderung.' },
  { num: '02', heading: 'Klarheit', description: 'Gemeinsam entscheiden wir: Was ist das richtige Format, was der richtige Rahmen?' },
  { num: '03', heading: 'Arbeitsphase', description: 'Individuelle Sessions in Ihrem Tempo — remote oder vor Ort in Lüneburg und Umgebung.' },
  { num: '04', heading: 'Nachhaltigkeit', description: 'Was Sie hier lernen, bleibt bei Ihnen. Nicht als Wissen, sondern als Haltung.' },
];
---

<section class="w-section" id="process">
  <div class="head">
    <span class="num">03 / 07</span>
    <h2>Wie wir <em class="em">zusammenarbeiten.</em></h2>
    <span class="hint">4 Schritte</span>
  </div>

  <div class="process-grid">
    {steps.map((step) => (
      <div class="process-step">
        <span class="step-num">{step.num}</span>
        <h3>{step.heading}</h3>
        <p>{step.description}</p>
      </div>
    ))}
  </div>
</section>

<style>
  .process-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  .process-step {
    padding: 32px 28px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--ink-850);
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: border-color 200ms var(--ease);
  }

  .process-step:hover { border-color: var(--line-2); }

  .step-num {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--copper);
    text-transform: uppercase;
  }

  .process-step h3 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 22px;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
  }

  .process-step p {
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.6;
    color: var(--fg-soft);
    margin: 0;
  }

  @media (max-width: 980px) {
    .process-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 640px) {
    .process-grid { grid-template-columns: 1fr; }
  }
</style>
```

- [ ] **Step 4.2: Commit**

```bash
git add website/src/components/kore/KoreProcess.astro
git commit -m "feat(kore): add KoreProcess section — 4-step workflow"
```

---

## Task 5: Create KoreFaq.astro

**Files:**
- Create: `website/src/components/kore/KoreFaq.astro`

- [ ] **Step 5.1: Create the component**

Create `website/src/components/kore/KoreFaq.astro`:

```astro
---
import type { FaqItem } from '../../lib/website-db';

type Props = { items: FaqItem[] };
const { items } = Astro.props;
---

{items.length > 0 && (
  <section class="w-section" id="faq">
    <div class="head">
      <span class="num">—</span>
      <h2>Häufige <em class="em">Fragen.</em></h2>
      <span class="hint">{items.length} Einträge</span>
    </div>
    <div class="faq-list">
      {items.map((item) => (
        <details class="faq-item">
          <summary class="faq-q">
            <span>{item.question}</span>
            <span class="chevron" aria-hidden="true">›</span>
          </summary>
          <div class="faq-a">{item.answer}</div>
        </details>
      ))}
    </div>
  </section>
)}

<style>
  .faq-list {
    display: flex;
    flex-direction: column;
  }

  .faq-item {
    border-bottom: 1px solid var(--line);
  }

  .faq-item:first-child { border-top: 1px solid var(--line); }

  .faq-q {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 22px 0;
    cursor: pointer;
    list-style: none;
    font-family: var(--serif);
    font-size: 18px;
    font-weight: 400;
    color: var(--fg);
    letter-spacing: -0.01em;
    user-select: none;
  }

  .faq-q::-webkit-details-marker { display: none; }

  .faq-q:hover { color: var(--copper); }

  .chevron {
    font-family: var(--mono);
    font-size: 18px;
    color: var(--mute);
    transition: transform 200ms var(--ease);
    flex-shrink: 0;
  }

  details[open] .chevron {
    transform: rotate(90deg);
  }

  .faq-a {
    padding: 0 0 22px;
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.7;
    color: var(--fg-soft);
    max-width: 64ch;
  }
</style>
```

- [ ] **Step 5.2: Commit**

```bash
git add website/src/components/kore/KoreFaq.astro
git commit -m "feat(kore): add KoreFaq section — collapsible FAQ"
```

---

## Task 6: Wire into index.astro

**Files:**
- Modify: `website/src/pages/index.astro`

- [ ] **Step 6.1: Add imports at the top**

In `website/src/pages/index.astro`, add to the existing Kore import block (around line 14-22):

```ts
import KoreServices from '../components/kore/KoreServices.astro';
import KoreWhyMe    from '../components/kore/KoreWhyMe.astro';
import KoreProcess  from '../components/kore/KoreProcess.astro';
import KoreFaq      from '../components/kore/KoreFaq.astro';
```

- [ ] **Step 6.2: Update the korczewski branch**

Find the korczewski render block (around line 79) and replace it with:

```astro
{BRAND_ID === 'korczewski' ? (
  <Layout title="Kore. — Self-hosted, vor Ihren Augen." brand="korczewski-kore">
    <KoreSubNav />
    <KoreHero client:load />
    <KoreServices services={services} />
    <KoreWhyMe homepage={homepage} />
    <KoreProcess />
    <KorePillars />
    <KoreTimeline client:load initialRows={initialTimeline} />
    <KoreBugs />
    <KoreTeam />
    <KoreFaq items={faq} />
    <KoreContact />
    <KoreFooter />
  </Layout>
) : (
```

Note: `services`, `homepage`, and `faq` are already fetched at the top of `index.astro` (lines ~32–33 and ~25–27). They are the same variables used in the mentolder branch.

- [ ] **Step 6.3: Verify existing fetches are in place**

Confirm these lines exist in the `index.astro` frontmatter (they already do — no change needed):

```ts
const homepage = await getEffectiveHomepage();
const faq = await getEffectiveFaq();
const allServices = await getEffectiveServices();
const services = allServices.filter((s) => !s.hidden);
```

If `homepage` or `faq` are missing from the top-level fetches (only inside the mentolder branch), move them above the brand check.

- [ ] **Step 6.4: Commit**

```bash
git add website/src/pages/index.astro
git commit -m "feat(kore): wire KoreServices, KoreWhyMe, KoreProcess, KoreFaq into homepage"
```

---

## Task 7: Deploy and verify

- [ ] **Step 7.1: Build locally first**

```bash
cd website && BRAND=korczewski npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors. If there are type errors in the new components, fix them before deploying.

- [ ] **Step 7.2: Deploy to both clusters**

```bash
task feature:website
```

Expected: deploys `mentolder-website` and `korczewski-website` images, rolls out both pods. Watch for errors:

```bash
task workspace:logs ENV=mentolder -- website
task workspace:logs ENV=korczewski -- website
```

- [ ] **Step 7.3: Verify Kore homepage**

Open `https://web.korczewski.de` and check:

1. **Nav:** "Cluster" → scrolls to KorePillars (cluster feature tiles), "Leistungen" → scrolls to the new services list, "Notizen" → scrolls to the PR timeline
2. **Services section:** Shows at least one service row with title, meta tagline, price, "Anfragen →" link pointing to `#contact`
3. **WhyMe section:** Shows intro text, bullet points list, quote block on the right
4. **Process section:** Shows 4 tiles (Erstgespräch, Klarheit, Arbeitsphase, Nachhaltigkeit)
5. **KorePillars:** Still shows cluster feature tiles (SSO, Dateien, Vault, Stream)
6. **FAQ section:** Shows FAQ items above KoreContact; clicking a question expands the answer
7. **Section numbers:** 01/07 through 07/07 on numbered sections

- [ ] **Step 7.4: Verify mentolder homepage is unchanged**

Open `https://web.mentolder.de` — should be identical to before. The mentolder branch in `index.astro` is untouched.
