# Slot Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the next available booking day and all its slots on the homepage; clicking any slot pre-fills the `/termin` booking form.

**Architecture:** Astro SSR fetches CalDAV slots server-side at request time and renders them as static HTML in `SlotWidget.astro`. `termin.astro` reads `?date`, `?start`, `?end` URL params server-side and passes them as props into `BookingForm.svelte`, which sets its initial state from those props instead of defaulting to day 0.

**Tech Stack:** Astro SSR, Svelte 5 (`$props()`), `lib/caldav.ts` (`getAvailableSlots`, `DaySlots`, `TimeSlot`)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/components/SlotWidget.astro` | Create | Renders next-available-day pill buttons |
| `src/pages/index.astro` | Modify | Import + render SlotWidget between hero and services |
| `src/pages/termin.astro` | Modify | Read URL params, pass as props to BookingForm |
| `src/components/BookingForm.svelte` | Modify | Accept `initialDate`, `initialStart`, `initialEnd` props |
| `tests/e2e/specs/fa-slot-widget.spec.ts` | Create | Playwright E2E test |

---

### Task 1: Write the failing Playwright test

**Files:**
- Create: `tests/e2e/specs/fa-slot-widget.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

test.describe('Slot Widget', () => {
  test('T1 – homepage shows next available day section', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('[data-testid="slot-widget"]')).toBeVisible();
    await expect(page.locator('[data-testid="slot-widget-heading"]')).toContainText('freier Termin');
  });

  test('T2 – slot pills link to /termin with params', async ({ page }) => {
    await page.goto(BASE);
    const firstPill = page.locator('[data-testid="slot-pill"]').first();
    await expect(firstPill).toBeVisible();
    const href = await firstPill.getAttribute('href');
    expect(href).toMatch(/\/termin\?date=\d{4}-\d{2}-\d{2}&start=\d{2}:\d{2}&end=\d{2}:\d{2}/);
  });

  test('T3 – clicking slot pill pre-fills booking form', async ({ page }) => {
    await page.goto(BASE);
    const firstPill = page.locator('[data-testid="slot-pill"]').first();
    const href = await firstPill.getAttribute('href');
    await page.goto(`${BASE}${href}`);
    // BookingForm should show the pre-selected slot highlighted
    await expect(page.locator('[data-testid="selected-slot-display"]')).toBeVisible();
  });
});
```

- [ ] **Step 2: Confirm test fails**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-slot-widget.spec.ts --reporter=line
```

Expected: 3 failures — `slot-widget` data-testid does not exist.

---

### Task 2: Create `SlotWidget.astro`

**Files:**
- Create: `src/components/SlotWidget.astro`

- [ ] **Step 1: Create component**

```astro
---
import type { DaySlots } from '../lib/caldav';

interface Props {
  day: DaySlots;
}

const { day } = Astro.props;

const dateFormatted = new Date(day.date + 'T00:00:00').toLocaleDateString('de-DE', {
  weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
});
---

<section class="py-10 bg-dark-light border-y border-dark-lighter" data-testid="slot-widget">
  <div class="max-w-6xl mx-auto px-6">
    <div class="flex flex-col md:flex-row md:items-center gap-6">
      <div class="flex-shrink-0">
        <p class="text-sm text-muted uppercase tracking-widest mb-1">Nächster freier Termin</p>
        <h2 class="text-xl font-semibold text-light" data-testid="slot-widget-heading">
          {dateFormatted}
        </h2>
      </div>
      <div class="flex flex-wrap gap-3">
        {day.slots.map((slot) => {
          const [startHH, startMM] = slot.display.split(' - ')[0].split(':');
          const [endHH, endMM] = slot.display.split(' - ')[1].split(':');
          const href = `/termin?date=${day.date}&start=${startHH}:${startMM}&end=${endHH}:${endMM}`;
          return (
            <a
              href={href}
              data-testid="slot-pill"
              class="px-4 py-2 rounded-full border border-gold/40 text-gold hover:bg-gold hover:text-dark font-medium text-sm transition-colors"
            >
              {slot.display}
            </a>
          );
        })}
      </div>
      <div class="md:ml-auto flex-shrink-0">
        <a href="/termin" class="text-muted hover:text-gold text-sm underline underline-offset-4 transition-colors">
          Alle Termine anzeigen →
        </a>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Commit skeleton**

```bash
git add src/components/SlotWidget.astro
git commit -m "feat: add SlotWidget component (no data yet)"
```

---

### Task 3: Wire `SlotWidget` into `index.astro`

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Read current `index.astro`**

```bash
cat src/pages/index.astro
```

- [ ] **Step 2: Add SSR slot fetch and SlotWidget**

At the top of the frontmatter (inside `---`), add:

```typescript
import SlotWidget from '../components/SlotWidget.astro';
import { getAvailableSlots } from '../lib/caldav';

let nextDay = null;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const slots = await getAvailableSlots();
  clearTimeout(timer);
  nextDay = slots.length > 0 ? slots[0] : null;
} catch {
  // CalDAV unreachable — widget hidden gracefully
}
```

In the HTML, after the hero `<section>` closing tag and before the services grid section, add:

```astro
{nextDay && <SlotWidget day={nextDay} />}
```

- [ ] **Step 3: Run T1 and T2 tests**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-slot-widget.spec.ts -k "T1\|T2" --reporter=line
```

Expected: T1 and T2 pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: render SlotWidget on homepage with SSR CalDAV fetch"
```

---

### Task 4: Add URL-param pre-fill to `termin.astro` + `BookingForm.svelte`

**Files:**
- Modify: `src/pages/termin.astro`
- Modify: `src/components/BookingForm.svelte`

- [ ] **Step 1: Update `termin.astro` to read and forward URL params**

Replace the contents of `src/pages/termin.astro` with:

```astro
---
import Layout from '../layouts/Layout.astro';
import BookingForm from '../components/BookingForm.svelte';

const initialDate = Astro.url.searchParams.get('date') ?? '';
const initialStart = Astro.url.searchParams.get('start') ?? '';
const initialEnd = Astro.url.searchParams.get('end') ?? '';
---

<Layout title="Termin buchen">
  <section class="pt-28 pb-20 bg-dark">
    <div class="max-w-3xl mx-auto px-6">
      <div class="text-center mb-12">
        <h1 class="text-4xl md:text-5xl font-bold text-light mb-4 font-serif">Termin buchen</h1>
        <p class="text-xl text-muted max-w-2xl mx-auto">
          Wählen Sie einen Termin und hinterlassen Sie Ihre Kontaktdaten.
          Wir bestätigen Ihren Termin in Kürze.
        </p>
      </div>
      <div class="bg-dark-light rounded-2xl border border-dark-lighter p-8">
        <BookingForm
          client:load
          initialDate={initialDate}
          initialStart={initialStart}
          initialEnd={initialEnd}
        />
      </div>
      <div class="mt-8 text-center">
        <p class="text-muted">
          Lieber persönlich sprechen?
          <a href="/kontakt" class="text-gold hover:underline font-medium">Kontakt aufnehmen</a>
        </p>
      </div>
    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Add props and pre-fill logic to `BookingForm.svelte`**

At the very top of the `<script lang="ts">` block, before the existing `let name = $state('')` lines, add:

```typescript
  interface Props {
    initialDate?: string;
    initialStart?: string;
    initialEnd?: string;
  }
  let { initialDate = '', initialStart = '', initialEnd = '' } = $props<Props>();
```

Change the `selectedDate` initialisation from:

```typescript
  let selectedDate = $state('');
```

to:

```typescript
  let selectedDate = $state(initialDate);
```

Change the `selectedSlot` initialisation from:

```typescript
  let selectedSlot = $state<TimeSlot | null>(null);
```

to:

```typescript
  let selectedSlot = $state<TimeSlot | null>(
    initialStart && initialEnd
      ? { start: initialStart, end: initialEnd, display: `${initialStart} - ${initialEnd}` }
      : null
  );
```

In the fetch callback, change the default-date assignment:

```typescript
  // Fetch available slots on mount
  if (typeof window !== 'undefined') {
    fetch('/api/calendar/slots')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          days = data;
          // Only set default date if no pre-fill from URL
          if (!initialDate && data.length > 0) selectedDate = data[0].date;
        }
        loading = false;
      })
      .catch(() => { loading = false; });
  }
```

Find where the selected slot is displayed in the template (the `{#if selectedSlot}` block) and add `data-testid="selected-slot-display"` to its outermost element. For example:

```svelte
{#if selectedSlot}
  <div data-testid="selected-slot-display" class="...existing classes...">
    <!-- existing content -->
  </div>
{/if}
```

- [ ] **Step 3: Run all 3 tests**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-slot-widget.spec.ts --reporter=line
```

Expected: all 3 pass.

- [ ] **Step 4: Build to confirm no TypeScript errors**

```bash
cd /home/patrick/Bachelorprojekt/website
npm run build 2>&1 | tail -10
```

Expected: `[build] Complete!`

- [ ] **Step 5: Commit**

```bash
git add src/pages/termin.astro src/components/BookingForm.svelte
git commit -m "feat: pre-fill booking form from URL params (slot widget integration)"
```
