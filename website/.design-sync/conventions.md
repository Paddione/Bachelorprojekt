# Building with the mentolder design system

mentolder is a **dark-brand** German digital-coaching / leadership-mentoring site.
Every screen sits on a deep navy ink ground with a warm brass accent and an editorial
serif display face. Import components from `window.MentolderDS` (e.g. `MentolderDS.Hero`,
`MentolderDS.ServiceCard`) and compose them as React elements.

## Wrapping & setup (read first)

- **Put everything on the brand ground.** The page/root MUST set
  `background: var(--color-ink-900)` (`#0b111c`) and `color: var(--color-fg)` (`#eef1f3`).
  Component text is light by design — on a white background it disappears. There is no
  ThemeProvider; the tokens live in `:root` (shipped via `styles.css` → `_ds_bundle.css`),
  so just load `styles.css` and set the dark ground.
- Components are self-styling: each carries its own scoped CSS (injected on mount) plus the
  brand tokens. You only supply props and your own layout glue.

## The styling idiom — two coexisting layers, real names

1. **CSS custom properties** (the source of truth). Colors: `--color-ink-900/-850/-800/-750`
   (surfaces), `--color-fg` / `--color-fg-soft` / `--color-mute` (text), `--color-brass` /
   `--color-brass-2` (primary accent, hover), `--color-sage` (healthy/ready), `--color-line` /
   `--color-line-2` (hairlines). Type: `--font-serif` (Newsreader — display/headlines),
   `--font-sans` (Geist — body/UI), `--font-mono` (Geist Mono — eyebrows, meta, labels).
   Use them in your own layout CSS: `style={{ background: 'var(--color-ink-850)' }}`.
2. **Tailwind v4 utilities** derived from those tokens (already compiled into the bundle).
   Use them for your glue markup: surfaces `bg-dark-light` / `bg-dark-lighter`; text
   `text-light` / `text-muted` / `text-gold`; accent fills `bg-gold` / `hover:bg-gold-light`;
   plus standard Tailwind (`rounded-2xl`, `p-8`, `flex`, `gap-3`, `font-serif`). Headlines use
   `font-serif`; eyebrows/labels use `font-mono` + uppercase + letter-spacing.

Brass is for ONE primary action per view — CTAs, active states, eyebrow ticks. Body copy is
`--color-fg-soft`; never pure white. Generous vertical rhythm (sections breathe at 80–130px).

## Where the truth lives

- `styles.css` and its `@import "./_ds_bundle.css"` closure — all tokens + utilities.
- Per component: `<Name>.d.ts` (the prop contract you code against) and `<Name>.prompt.md`
  (usage). Read these before composing a component.

## Idiomatic snippet

```jsx
const { Hero, ServiceCard } = window.MentolderDS;
<main style={{ background: 'var(--color-ink-900)', color: 'var(--color-fg)' }}>
  <Hero
    tagline="Digital Coach & Führungskräfte-Mentor"
    title="Menschen, Prozesse und Technik —"
    titleEmphasis="wieder in Einklang gebracht."
  />
  <section className="flex gap-6 p-8">
    <ServiceCard icon="🧭" title="Digital Coaching"
      description="Persönliche Begleitung für Führungskräfte."
      features={['1:1 Sessions', 'Praxisnah', 'Erreichbar']}
      href="/leistungen/coaching" price="ab 180 € / Session" />
  </section>
</main>
```

Brand: "mentolder" is always lowercase. Location: Lüneburg, Hamburg und Umgebung.
