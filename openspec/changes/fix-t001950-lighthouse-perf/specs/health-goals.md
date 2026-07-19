## ADDED Requirements

### Requirement: the website SHALL self-host its webfonts instead of loading them from Google Fonts

The website SHALL serve its Inter/font-display fonts from `website/public/fonts/` via local `@font-face`
declarations with `font-display: swap`, instead of a Google Fonts `<link>`, to remove the external DNS
lookup and render-blocking request that costs Lighthouse Performance points.

#### Scenario: no external Google Fonts request on page load

- **GIVEN** the website's rendered HTML
- **WHEN** the network requests during a Lighthouse run are inspected
- **THEN** no request to `fonts.googleapis.com` or `fonts.gstatic.com` occurs

### Requirement: the G-FE05 Lighthouse Performance score SHALL reach its target of ≥90

After self-hosting fonts, deferring `sidekick-panels.css` out of the critical rendering path, and
removing unused JS, the G-FE05 Lighthouse Performance score in `.claude/lib/goals.md` SHALL be
re-measured and reach its target of ≥90.

#### Scenario: G-FE05 reaches target after the optimization pass

- **GIVEN** the three optimizations (self-hosted fonts, deferred CSS, reduced JS) are applied
- **WHEN** a Lighthouse run against the live site completes
- **THEN** the reported Performance score is ≥90
