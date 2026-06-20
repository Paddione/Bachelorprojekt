# Design Intent — Coaching-Sessions Service (T001002)

## Scope (user-confirmed 2026-06-20)

**In scope (this plan):**
1. **MVP Coaching Studio** — a dedicated authenticated app for the coach (Gerald) to run KI-supported coaching sessions. Core screens only: Dashboard, Kundenakte, KI-Profil-Editor, 10-Ebenen-Session-Workspace, Admin. Deployed as an **own service/container** (arena-server-style), not inside the marketing website.
2. **Homepage Redesign** — apply the hi-fi redesign of the Mentolder marketing homepage inside the existing Astro+Svelte website (`src/pages/index.astro` + components).

**Out of scope (follow-up tickets):** Systembrett (figure placement tool), Coaching Vertrag (contract generation), full Art-Library ingestion pipeline, Avatare & Sidekick widget productionisation. Their assets are co-located for reference but not implemented in this plan.

> **Autoritative funktionale Spec:** `assets/requirements.md` — die vom User bereinigte Anforderungsliste. Sie geht dem Prototyp-Intent vor, wo sie Details präzisiert.

## Architecture decision (user-confirmed)

The Coaching Studio is an **eigener Service** — a separate container with its own API, analogous to `arena-server`. It reuses existing cluster infrastructure (Keycloak OIDC, shared Postgres, LiveKit, faster-whisper, LLM gateway) but ships as its own deployable. The Homepage Redesign is a separate workstream inside the existing `website/` Astro app.

## Design-system source of truth

`assets/new/colors_and_type.css` — Brass/Ink/Sage token system (single source of truth). Mirrors `src/styles/global.css` in the production website. Tokens are ALREADY production CSS in the website; the Studio service must adopt the same token vocabulary so both surfaces share the brand language.

- Ink palette: `--ink-900 #0b111c` (base), `--ink-850 #101826`, `--ink-800 #17202e`, `--ink-750 #1d2736`
- Brass accent: `--brass oklch(0.80 0.09 75)`, `--brass-2` (hover/italic em), `--brass-d` (tinted fills)
- Sage accent: `--sage oklch(0.80 0.06 160)` (availability/live/ok)
- Type: Newsreader (display/serif), Geist (sans/UI), Geist Mono (mono labels, eyebrows, captions)
- Italic in Newsreader is the ONLY emphasis — colour (`--brass-2`) reinforces it. No bold italic, no underline.
- Film grain: fixed full-viewport SVG fractalNoise overlay, opacity .55, mix-blend-mode overlay.

---

## Workstream A — Coaching Studio MVP (separate service)

### Design reference
`assets/new/coaching_studio/` — a complete React 18 prototype (Babel-standalone, single-file HTML launchers). It is a **design reference, not production code**. The prototype files:

| File | Role |
|------|------|
| `coaching_studio/app.jsx` | App-shell: TopBar, navigation, screen routing (dashboard/admin), RTL toggle, Präsentation + Session CTAs |
| `coaching_studio/workspace.jsx` | **Herzstück** — 10-level session workspace: per-level prompt editor + reset switch, clipboard (empties on send + level switch), input + mic states (idle→recording→review), transcription review, KI answer per level, translation panel (DE ∥ target lang, RTL + TTS) |
| `coaching_studio/data.jsx` | Data + shared blocks: Icons (inline-SVG, currentColor), BrandMark, LOREM, the 10 LEVELS (systemic coaching arc), PROFILE_FIELDS, CUSTOMERS, SOURCE_DE, TARGET_LANGS (Farsi/Arabisch/Türkisch/EN/FR) |
| `coaching_studio/screens_core.jsx` | Dashboard (Kundenliste + stats + search), Kundenakte (Stammdaten + KI-Profil pin + sessions list), ProfileEditor (checkbox-active fields, only active flow into KI request) |
| `coaching_studio/screens_more.jsx` | CompareView (alt vs neu split, diff highlighting), AdminArea (edit 10-level standard prompts + standard profile questions: type/required/active) |
| `coaching_studio/app.css` | Full hi-fi styling (30KB) — brass/ink/sage, the workspace layout, mic states, translation panel |
| `coaching_studio/Praesentation.html` | Presentation window (second monitor) |
| `coaching_studio/Export.html` | Export / print window |

### The 10-level systemic coaching arc (from data.jsx)
01 Ankommen & Rahmen → 02 Anliegen klären → 03 Ist-Situation → 04 Ressourcen & Stärken → 05 Zielbild → 06 Hindernisse & Muster → 07 Perspektivwechsel → 08 Optionen & Wege → 09 Vereinbarungen → 10 Abschluss & Transfer. Each level has a name, a goal, and a default system prompt (editable per session, resettable to standard).

### Screens to build (MVP)
1. **TopBar** — brand mark + "Coaching Studio", nav (Übersicht / Admin), RTL toggle, Präsentation + Neue Session CTAs.
2. **Dashboard** — client grid with stats (aktiv/pausiert/fertig), search by name/category, Admin button, Neue Session CTA.
3. **Kundenakte** — aside: Stammdaten card + KI-Profil pin (exactly 1, shows active/inactive fields, "X von Y aktiv"); main: sessions list with status pills, Ebene X/10, lang, updated, Fortsetzen/Vorlage/Export actions.
4. **KI-Profil-Editor** — per-client profile fields with active/inactive checkboxes; only active fields flow into KI request; admin-extensible; add-field + save.
5. **Workspace (Herzstück)** — left 10-level rail (keyboard nav ArrowUp/Down, done checkmarks); main: per-level prompt editor + Standard/Reset switch, input dock with mic (idle/recording/review) + waveform, transcription review (play/replace/delete + accept-into-input), KI answer (with "In Zwischenablage"); right aside: clipboard panel + translation panel (DE ∥ target lang, RTL layout, TTS play states).
6. **CompareView** — split alt vs neu, diff highlighting per level, export.
7. **AdminArea** — tabs: "10 Ebenen · Standard-Prompts" (edit name/goal/prompt, grip, add/remove) and "Standard-Profilfragen" (edit label/value/type/required/active, add/remove).
8. **Präsentation** + **Export** windows.

### MVP functional requirements (from the prototype)
- Per-level prompt editor with Standard/Reset switch; standard prompts loaded from Admin defaults.
- Clipboard that empties on send AND on level switch.
- Mic states: idle → recording (waveform) → review (transcription editable) → accept into input; send disabled while recording.
- KI answer per level (placeholder in prototype; real LLM call in production via the cluster's LLM gateway — TEI embed + LM Studio chat).
- Translation panel: DE original ∥ target language (Farsi default RTL, Arabisch RTL, Türkisch, EN, FR), with TTS "Vorlesen" play states.
- RTL document direction toggle (Farsi/Arabisch).
- KI-Profil: exactly one per client; checkbox-gated fields; only active fields flow into KI request.
- Admin: edit 10-level standards + standard profile questions; persisted.
- Compare alt-vs-neu with per-level diff.
- Presentation window (second monitor) + export/print.

### Reuse from existing cluster (per codebase exploration + user requirements)
- **Keycloak OIDC** — `src/lib/auth.ts` pattern; the service needs its own Keycloak client/audience (`studio`) and session handling (or shares the `website` client).
- **Postgres** — shared-db; one central DB (user requirement §2). New `studio.*` schema (mirror `coaching.*`/`sessions.*` pattern) OR extend existing `coaching.*` schema (an admin coaching subsystem + `coaching.sessions` already exists — investigate reuse vs. new schema in the plan).
- **LLM gateway** — TEI (embed) + LM Studio (chat); `openai`/`anthropic`/`mistral` SDKs already in website. Drives KI-Antwort per Ebene + Übersetzung.
- **faster-whisper** — transcription service already deployed; mic→whisper pipeline exists (`api/meeting/transcribe.ts`). **Coach-Mic only** (user requirement §7) — transcribes coach's own notes/prompts/summarized client statements, NOT the client audio.
- **Nextcloud Talk** — (user requirement §6/§7) the external audio/video channel to the remote client runs via Nextcloud Talk, NOT via the Studio service. The Studio needs NO audio connection to the client. TTS playback is routed to the client over the Nextcloud Talk audio channel. **Kein LiveKit für MVP** — massiv vereinfacht.
- **Translation/TTS** — Übersetzung via LLM gateway; TTS via browser SpeechSynthesis or a cluster TTS service (confirm in plan). Zielsprachen min.: Farsi, Arabisch, Türkisch, EN, FR (§8).

### Speicher-Highlighting (user requirement §5 — NEU, nicht prominent im Prototyp)
Ebenen mit persistenten Speicherzuständen werden visuell hervorgehoben:
- **Ebene 05 — Zielbild** → "Zielsetzungen"
- **Ebene 09 — Vereinbarungen** → "Vereinbarungen"
Der Session-Export am Ende muss den gesamten Verlauf **inklusive der hervorgehobenen Zielsetzungen und Vereinbarungen** enthalten.

---

## Workstream B — Homepage Redesign (inside website/)

### Design reference
`assets/new/homepage_redesign/Homepage Redesign.html` + `assets/new/homepage_redesign/README.md` (authoritative handoff spec, 255 lines) + `assets/new/homepage_redesign/assets/gerald.jpg` (portrait).

### Intent (from the handoff README)
A polished hi-fi redesign of `src/pages/index.astro`, evolving the dark-navy + gold system toward a calmer, warmer, more editorial execution. **Brand-agnostic shared system** — also applies to `korczewski.de` (only copy + config differ). Hi-fidelity: match pixel-perfectly; deviations must be conscious.

### Sections (top → bottom)
0. **Sticky Top Bar** — `Navigation.svelte` refactor: 72px sticky, blur backdrop, brand mark (radial brass square + carved M), nav links, meta pill, primary CTA. Mobile hamburger (reuse existing pattern).
1. **Hero** — `Hero.svelte` refactor: two-col grid, mono kicker row, H1 (Newsreader, italic brass accent), lede, CTA row (primary + ghost pill), reusable `<Portrait>` component (halos, duotone wash, brass hairline, tag plate, caption plate) on `gerald.jpg`.
2. **Stats + Availability Strip** — 4 stats (Newsreader numerals, brass `+`/`KI` em) + availability widget (sage pulsing dot, next-free line, slot pills from `getAvailableSlots()`). Reuse/reskin `SlotWidget.astro`.
3. **Offers** — replace `ServiceCard.svelte` with new `ServiceRow.svelte` (numbered rows, brass dot bullets, price block, circle "Mehr" icon). Data from `homepage.services`/brand config.
4. **Why Me + Quote** — `WhyMe.svelte` + `QuoteCard.svelte` (brass radial quote card, decorative italic glyph, byline avatar). Data from `homepage.whyMePoints`/`homepage.quote`.
5. **Process** — new `Process.astro` (4-step rail with brass line + dots). Not in current site.
6. **CTA** — `CallToAction.svelte` restyle (centered, brass glow, italic accent H2).
7. **Footer** — `Layout.astro` footer block (4-col grid, mono section heads, brass hover).

### Token + mapping notes
- Tokens already in `src/styles/global.css` `@theme` block — verify they match `colors_and_type.css` and expose to Tailwind (`bg-ink-900`, `text-brass`, etc.).
- Data helpers unchanged: `getEffectiveHomepage()`, `getEffectiveServices()`, `getEffectiveFaq()`, `getAvailableSlots()`.
- `gerald.jpg` → `public/gerald.jpg` (referenced by `homepage.avatarSrc` in `mentolder.ts`).
- Reuse existing `ChatWidget`, `CookieConsent`, `Navigation` mobile menu, CalDAV slot widget.

### Shared-system (both brands)
For `korczewski.de`: swap copy via `korczewski.ts`; `avatarType: 'initials'` uses brass-gradient circle pattern scaled to 260×260. No structural changes.

---

## Supporting assets (reference only — out of MVP scope)

- `assets/new/art_library/` — Art Library handoff (archetypes, icons, surfaces, logos, PortraitFrame, QuoteCard, StatsStrip, ProcessSteps). The Homepage Redesign reuses PortraitFrame/QuoteCard/StatsStrip/ProcessSteps concepts — reference this for component fidelity, but the homepage handoff README is authoritative for the homepage.
- `assets/new/avatars.jsx` + `assets/new/sidekick.jsx` — Avatar (2-letter initials, 6 styles) + Sidekick widget (3 redesigns). Studio dashboard/akte uses an `avatar` initials pattern — reference for the studio avatar styling.

## Guardrails (T000756)
- Use `currentColor` (not embedded `<img>`), no stray hex values, no root `width/height` on SVGs.
- Brand-domain literals must not be hardcoded in code (S3) — use `k3d/configmap-domains.yaml`.
- Italic em is the only emphasis; no bold-italic, no underline, no emoji/Unicode icons.
- "mentolder." always ends in a brass period — treat as part of the mark.
