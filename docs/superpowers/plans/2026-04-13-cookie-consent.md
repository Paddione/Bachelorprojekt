# Cookie Consent Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DSGVO-compliant cookie consent banner with self-hosted fonts to web.mentolder.de and web.korczewski.de.

**Architecture:** A `CookieConsent.svelte` component mounts in `Layout.astro` (rendered on every page), shows a fixed bottom banner with "Alle akzeptieren" / "Nur notwendige" buttons and an expandable detail panel. Consent is stored in `localStorage` under `cookie_consent_v1`. Google Fonts CDN links are removed and replaced with `@fontsource` npm packages imported directly in `global.css`.

**Tech Stack:** Astro 5, Svelte 5, Tailwind CSS 4, @fontsource/inter, @fontsource/merriweather

---

## File Map

| File | Action |
|------|--------|
| `website/package.json` | Add `@fontsource/inter`, `@fontsource/merriweather` |
| `website/src/styles/global.css` | Add `@import` for fontsource CSS files |
| `website/src/layouts/Layout.astro` | Remove Google Fonts `<link>` tags; add `<CookieConsent>`; add footer link |
| `website/src/components/CookieConsent.svelte` | New component |
| `website/src/pages/datenschutz.astro` | Add cookie table section |

---

## Task 1: Self-host fonts

**Files:**
- Modify: `website/package.json`
- Modify: `website/src/styles/global.css`
- Modify: `website/src/layouts/Layout.astro`

- [ ] **Step 1: Install fontsource packages**

```bash
cd website && npm install @fontsource/inter @fontsource/merriweather
```

Expected output: packages added to `node_modules/`, `package.json` updated with two new entries under `dependencies`.

- [ ] **Step 2: Add font imports to global.css**

In `website/src/styles/global.css`, add these lines at the very top (before the `@import "tailwindcss"` line):

```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
@import '@fontsource/merriweather/400.css';
@import '@fontsource/merriweather/700.css';
@import "tailwindcss";
```

- [ ] **Step 3: Remove Google Fonts links from Layout.astro**

In `website/src/layouts/Layout.astro`, remove these three lines from `<head>`:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@400;700&display=swap" rel="stylesheet" />
```

The `global.css` import already present in `<head>` (`import '../styles/global.css'` in the frontmatter) handles font loading now — no replacement link tag needed.

- [ ] **Step 4: Verify build passes**

```bash
cd website && npm run build
```

Expected: build completes without errors. The fonts are bundled into `dist/`. No `fonts.googleapis.com` requests.

- [ ] **Step 5: Commit**

```bash
cd website && git add package.json package-lock.json src/styles/global.css src/layouts/Layout.astro
git commit -m "feat(website): self-host Inter and Merriweather fonts via fontsource"
```

---

## Task 2: Create CookieConsent component

**Files:**
- Create: `website/src/components/CookieConsent.svelte`

- [ ] **Step 1: Create the component**

Create `website/src/components/CookieConsent.svelte` with this content:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  const CONSENT_KEY = 'cookie_consent_v1';

  let visible = $state(false);
  let detailsOpen = $state(false);

  onMount(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      visible = true;
    }
  });

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    visible = false;
  }

  // Exported so the footer link can call it
  export function reopen() {
    localStorage.removeItem(CONSENT_KEY);
    visible = true;
  }
</script>

{#if visible}
  <div
    class="fixed bottom-0 left-0 right-0 z-50 border-t border-dark-lighter bg-dark-light shadow-lg"
    role="dialog"
    aria-label="Cookie-Einstellungen"
    aria-modal="false"
  >
    <div class="max-w-6xl mx-auto px-6 py-4">
      <!-- Main row -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1 text-sm text-muted">
          <span class="font-semibold text-gold">Cookies</span> — Diese Website verwendet ausschließlich technisch notwendige Cookies, die für den Betrieb der Website erforderlich sind.
        </div>
        <div class="flex flex-wrap gap-3 items-center shrink-0">
          <button
            onclick={() => (detailsOpen = !detailsOpen)}
            class="text-xs text-muted hover:text-gold transition-colors underline underline-offset-2"
          >
            {detailsOpen ? 'Details ausblenden' : 'Details anzeigen'}
          </button>
          <button
            onclick={accept}
            class="px-4 py-2 rounded text-sm font-semibold border border-gold text-gold hover:bg-gold hover:text-dark transition-colors"
          >
            Nur notwendige
          </button>
          <button
            onclick={accept}
            class="px-4 py-2 rounded text-sm font-semibold bg-gold text-dark hover:bg-gold-light transition-colors"
          >
            Alle akzeptieren
          </button>
        </div>
      </div>

      <!-- Detail panel -->
      {#if detailsOpen}
        <div class="mt-4 pt-4 border-t border-dark-lighter">
          <h3 class="text-sm font-semibold text-gold mb-3">Notwendige Cookies</h3>
          <p class="text-xs text-muted mb-3">
            Diese Cookies sind für die Grundfunktionen der Website zwingend erforderlich und können nicht deaktiviert werden.
          </p>
          <table class="w-full text-xs text-muted border-collapse">
            <thead>
              <tr class="border-b border-dark-lighter">
                <th class="text-left py-2 pr-4 font-semibold text-light">Name</th>
                <th class="text-left py-2 pr-4 font-semibold text-light">Zweck</th>
                <th class="text-left py-2 font-semibold text-light">Dauer</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-dark-lighter">
                <td class="py-2 pr-4 font-mono">session</td>
                <td class="py-2 pr-4">Authentifizierung / Login-Sitzung</td>
                <td class="py-2">Sitzung</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono">KEYCLOAK_*</td>
                <td class="py-2 pr-4">SSO-Session (Keycloak OIDC)</td>
                <td class="py-2">Sitzung</td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Verify the component compiles**

```bash
cd website && npm run build
```

Expected: build completes without errors referencing `CookieConsent.svelte`.

- [ ] **Step 3: Commit**

```bash
cd website && git add src/components/CookieConsent.svelte
git commit -m "feat(website): add CookieConsent component with expandable detail panel"
```

---

## Task 3: Wire CookieConsent into Layout.astro and footer

**Files:**
- Modify: `website/src/layouts/Layout.astro`

The goal is to:
1. Import and mount `CookieConsent` (with `client:load` so Svelte runs in the browser)
2. Add a "Cookie-Einstellungen" link in the footer that resets consent and re-shows the banner

Because the footer link needs to call `reopen()` on the component instance, we use a small inline script alongside a `bind:this` — but Astro doesn't support `bind:this` across the Astro/Svelte boundary. Instead, the footer link dispatches a custom DOM event that the component listens for. This keeps everything self-contained.

- [ ] **Step 1: Update CookieConsent.svelte to listen for the reopen event**

Add an `onMount` event listener inside the existing `onMount` in `CookieConsent.svelte`. Replace the existing `onMount` block:

```svelte
  onMount(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      visible = true;
    }

    const handler = () => {
      localStorage.removeItem(CONSENT_KEY);
      visible = true;
      detailsOpen = false;
    };
    window.addEventListener('cookie-consent-reopen', handler);
    return () => window.removeEventListener('cookie-consent-reopen', handler);
  });
```

Also remove the `export function reopen()` since it's no longer needed:

```svelte
  // Remove these lines:
  // Exported so the footer link can call it
  export function reopen() {
    localStorage.removeItem(CONSENT_KEY);
    visible = true;
  }
```

- [ ] **Step 2: Add CookieConsent to Layout.astro**

In `website/src/layouts/Layout.astro`, add the import in the frontmatter:

```astro
---
import Navigation from '../components/Navigation.svelte';
import CookieConsent from '../components/CookieConsent.svelte';
import '../styles/global.css';
import { config } from '../config/index';
```

Add the component just before the closing `</body>` tag:

```astro
    <CookieConsent client:load />
  </body>
```

- [ ] **Step 3: Add "Cookie-Einstellungen" link to the footer**

In `website/src/layouts/Layout.astro`, find the "Rechtliches" footer section:

```astro
          <div>
            <h3 class="text-lg font-semibold text-gold mb-4">Rechtliches</h3>
            <ul class="space-y-2 text-muted">
              <li><a href="/impressum" class="hover:text-gold transition-colors">Impressum</a></li>
              <li><a href="/datenschutz" class="hover:text-gold transition-colors">Datenschutz</a></li>
            </ul>
          </div>
```

Replace it with:

```astro
          <div>
            <h3 class="text-lg font-semibold text-gold mb-4">Rechtliches</h3>
            <ul class="space-y-2 text-muted">
              <li><a href="/impressum" class="hover:text-gold transition-colors">Impressum</a></li>
              <li><a href="/datenschutz" class="hover:text-gold transition-colors">Datenschutz</a></li>
              <li>
                <button
                  onclick="window.dispatchEvent(new Event('cookie-consent-reopen'))"
                  class="hover:text-gold transition-colors cursor-pointer bg-transparent border-none p-0 text-inherit text-sm"
                >
                  Cookie-Einstellungen
                </button>
              </li>
            </ul>
          </div>
```

- [ ] **Step 4: Verify build passes**

```bash
cd website && npm run build
```

Expected: build completes without TypeScript or Astro errors.

- [ ] **Step 5: Commit**

```bash
cd website && git add src/layouts/Layout.astro src/components/CookieConsent.svelte
git commit -m "feat(website): wire CookieConsent into layout with footer reset link"
```

---

## Task 4: Update Datenschutz page with cookie table

**Files:**
- Modify: `website/src/pages/datenschutz.astro`

The privacy policy should document cookies used on the site.

- [ ] **Step 1: Add cookie section to datenschutz.astro**

In `website/src/pages/datenschutz.astro`, find the closing `</div>` of the prose section (just before `</section>`) and insert a new section before the existing disclaimer paragraph at the bottom. The full updated file:

```astro
---
import Layout from '../layouts/Layout.astro';
---

<Layout title="Datenschutz">
  <section class="pt-28 pb-20">
    <div class="max-w-3xl mx-auto px-6 prose prose-lg prose-slate">
      <h1>Datenschutzerklärung</h1>

      <h2>1. Datenschutz auf einen Blick</h2>
      <h3>Allgemeine Hinweise</h3>
      <p>
        Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren
        personenbezogenen Daten passiert, wenn Sie diese Website besuchen.
      </p>

      <h3>Datenerfassung auf dieser Website</h3>
      <p>
        <strong>Wer ist verantwortlich für die Datenerfassung auf dieser Website?</strong><br />
        Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber.
        Dessen Kontaktdaten können Sie dem Impressum entnehmen.
      </p>

      <h2>2. Allgemeine Hinweise und Pflichtinformationen</h2>
      <h3>Datenschutz</h3>
      <p>
        Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst.
        Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend den
        gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklärung.
      </p>

      <h2>3. Datenerfassung auf dieser Website</h2>
      <h3>Cookies</h3>
      <p>
        Diese Website verwendet ausschließlich technisch notwendige Cookies. Diese Cookies
        sind für den Betrieb der Website zwingend erforderlich und können in Ihrem Browser
        nicht deaktiviert werden. Sie speichern keine personenbezogenen Daten und werden
        nicht für Tracking- oder Werbezwecke eingesetzt.
      </p>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren
        und funktionsfähigen Betrieb der Website).
      </p>

      <table>
        <thead>
          <tr>
            <th>Cookie-Name</th>
            <th>Zweck</th>
            <th>Speicherdauer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>session</code></td>
            <td>Authentifizierung und Login-Sitzungsverwaltung</td>
            <td>Sitzungsende (beim Schließen des Browsers)</td>
          </tr>
          <tr>
            <td><code>KEYCLOAK_*</code></td>
            <td>Single Sign-On Session (Keycloak OIDC)</td>
            <td>Sitzungsende (beim Schließen des Browsers)</td>
          </tr>
          <tr>
            <td><code>cookie_consent_v1</code></td>
            <td>Speichert Ihre Cookie-Einwilligung (localStorage)</td>
            <td>Dauerhaft (bis zur manuellen Löschung)</td>
          </tr>
        </tbody>
      </table>

      <h3>Kontaktformular</h3>
      <p>
        Wenn Sie uns per Kontaktformular Anfragen zukommen lassen, werden Ihre Angaben
        aus dem Anfrageformular inklusive der von Ihnen dort angegebenen Kontaktdaten
        zwecks Bearbeitung der Anfrage und für den Fall von Anschlussfragen bei uns
        gespeichert. Diese Daten geben wir nicht ohne Ihre Einwilligung weiter.
      </p>
      <p>
        Die Verarbeitung dieser Daten erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO,
        sofern Ihre Anfrage mit der Erfüllung eines Vertrags zusammenhängt oder zur
        Durchführung vorvertraglicher Maßnahmen erforderlich ist.
      </p>

      <h3>Server-Log-Dateien</h3>
      <p>
        Der Provider der Seiten erhebt und speichert automatisch Informationen in
        sogenannten Server-Log-Dateien, die Ihr Browser automatisch an uns übermittelt.
        Diese Daten sind nicht bestimmten Personen zuordenbar.
      </p>

      <h2>4. Ihre Rechte</h2>
      <p>
        Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger
        und Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben
        außerdem ein Recht, die Berichtigung oder Löschung dieser Daten zu verlangen.
      </p>
      <p>
        Wenn Sie eine Einwilligung zur Datenverarbeitung erteilt haben, können Sie diese
        jederzeit für die Zukunft widerrufen. Hierzu sowie zu weiteren Fragen zum Thema
        Datenschutz können Sie sich jederzeit an uns wenden.
      </p>

      <p class="text-sm text-slate-500 mt-12">
        Hinweis: Diese Datenschutzerklärung ist ein Platzhalter und muss von einem
        Rechtsanwalt oder Datenschutzbeauftragten für Ihren spezifischen Anwendungsfall
        angepasst werden.
      </p>
    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Verify build passes**

```bash
cd website && npm run build
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
cd website && git add src/pages/datenschutz.astro
git commit -m "feat(website): add cookie table to Datenschutz page"
```

---

## Task 5: Manual verification checklist

No automated component tests exist in this codebase. Verify manually after running `task website:dev` or deploying.

- [ ] **Step 1: Start dev server**

```bash
cd website && npm run dev
```

Open `http://localhost:4321` in a browser.

- [ ] **Step 2: Verify banner shows on first visit**

Open DevTools → Application → Local Storage. Confirm `cookie_consent_v1` is absent. The banner should be visible at the bottom of the page.

- [ ] **Step 3: Verify detail panel toggle**

Click "Details anzeigen" — the cookie table should expand. Click "Details ausblenden" — it should collapse.

- [ ] **Step 4: Verify acceptance**

Click "Alle akzeptieren". The banner should disappear. In DevTools → Local Storage confirm `cookie_consent_v1 = "accepted"`. Reload the page — banner must not reappear.

Repeat with "Nur notwendige" after clearing storage (DevTools → Application → Local Storage → right-click → Clear).

- [ ] **Step 5: Verify footer link reopens banner**

Scroll to footer → click "Cookie-Einstellungen". Banner should reappear. `cookie_consent_v1` should be removed from Local Storage.

- [ ] **Step 6: Verify no external font requests**

In DevTools → Network tab → filter by "font" or "google". Reload the page. Confirm zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`. Font files should load from `/` (self-hosted).

- [ ] **Step 7: Verify both brands**

Set `BRAND=korczewski` (or however brand switching is done locally) and repeat steps 2-6. Both brands share the same Layout so the component is identical — this is a smoke check.
