# design-sync NOTES — mentolder Website Components

Off-script sync: the website is **Astro + Svelte 5**, not a React package. The stock
converter (`package-build.mjs`) does not apply. The build pipeline is bespoke under
`.ds-sync/` and produces the standard `ds-bundle/` upload layout.

## How it works
- `.ds-sync/gen.mjs` — generator. Run from website root: `node .ds-sync/gen.mjs`.
  1. Wraps each curated Svelte component in a React mount-wrapper (`mount()`/`unmount()` in `useEffect`).
  2. esbuild → IIFE `window.MentolderDS` (Svelte runtime inlined; `react`→`window.React` via reactShim).
  3. Tailwind v4 (`@tailwindcss/node`) compiles `.ds-sync/theme-input.css` + scanned classes → `_ds_bundle.css`.
  4. Emits per-component `.jsx`/`.d.ts`/`.prompt.md`/`.html` cards + `_preview/<Name>.js`, `_ds_sync.json`, README, `.review.html`.
- `.ds-sync/svelte-plugin.mjs` — esbuild Svelte 5 plugin (TS-strip + compile, `css:'injected'`).
- `.ds-sync/contract.mjs` — faithful replication of the design-sync card/header/vendor contract.
- `.ds-sync/render-check.mjs` — headless render gate + per-component screenshots (`ds-bundle/_screenshots/`).
- `.design-sync/previews/<Name>.tsx` — authored preview compositions (read `window.MentolderDS` lazily at render).

## Gotchas learned
- **Isolated TS-strip elides markup-only imports.** Preprocessing the `<script>` block alone makes
  esbuild drop imports used only in the template (`t`, child components) → "X is not defined" at runtime.
  Fix: `verbatimModuleSyntax: true` in the TS transform (never elide value imports). All curated
  components annotate type-only imports with `type`, so this is safe.
- **Dark-brand DS.** mentolder renders on `--color-ink-900`; light component text (`--color-fg`)
  is invisible on a white card. The preview card body is set to the brand ink (contract.mjs).
- **Svelte compiler `state_referenced_locally` warnings** on the wrapper imports are benign.
- **Chromium version mismatch**: cached `chromium-1223` vs playwright 1.61 wanting 1228 →
  render-check launches system Chrome via `channel: 'chrome'`.
- `.ds-pilot/` (early proof) vanished mid-run — likely a parallel session's cleanup. The `.ds-sync/`
  scripts are self-contained; recreate any missing file from this repo if it happens again.

## Re-sync risks
- Curated scope is hand-listed in `.ds-sync/components.mjs` (Brand + UI ~20). `.astro` is excluded
  (server-only, not client-mountable). New components must be added there.
- Fonts load via the Google Fonts CDN `@import` in `styles.css` (`[FONT_REMOTE]`, informational —
  no local font files shipped).
- `_ds_sync.json` is a best-effort anchor; if its schema drifts from the official converter, a
  re-sync simply re-verifies everything.
- The `.d.ts` props bodies are lifted verbatim from each component's `interface Props` + a small set
  of referenced types (WhyMePoint/FAQItem/NavigationLink) + `type Locale`. New referenced types need
  adding to `extraTypes()` in gen.mjs.
