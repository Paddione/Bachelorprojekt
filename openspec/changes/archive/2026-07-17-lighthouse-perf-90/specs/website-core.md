## ADDED Requirements

### Requirement: Edge Compression for Website Responses

The website delivery chain SHALL compress text-based responses (HTML, JS, CSS, JSON)
at the Traefik edge via a `website-compress` Middleware, so that clients receive
gzip/brotli-encoded payloads instead of the uncompressed origin bytes.

The compress Middleware SHALL be bound to every router that serves the public
website host, across both delivery mechanisms used in production (the base
`IngressRoute` and the per-brand overlay wiring), so both brands are covered.

#### Scenario: Text responses are served compressed

- **GIVEN** the website is deployed with the `website-compress` Middleware bound to its router
- **WHEN** a client requests an HTML or JS document with `Accept-Encoding: gzip, br`
- **THEN** the response carries a `Content-Encoding` header and a reduced transfer size

#### Scenario: Server-Sent-Event streams remain uncompressed

- **GIVEN** the `website-compress` Middleware uses Traefik's default excluded content types
- **WHEN** a client subscribes to a `text/event-stream` endpoint
- **THEN** the stream is delivered without compression and continues to function

### Requirement: Immutable Caching for Content-Hashed Assets

The website SHALL send `Cache-Control: public, max-age=31536000, immutable` for the
content-hashed build assets served under the `/_astro/` path prefix, via a
`website-static-cache` Middleware scoped to that prefix only. Non-hashed responses
(HTML and API routes) SHALL NOT receive the immutable long-lived cache directive.

#### Scenario: Hashed asset carries an immutable long-lived cache header

- **GIVEN** the `website-static-cache` Middleware is bound to the `/_astro/` route
- **WHEN** a client requests a content-hashed asset under `/_astro/`
- **THEN** the response includes a one-year `immutable` `Cache-Control` header

#### Scenario: HTML documents are not marked immutable

- **GIVEN** the immutable cache Middleware is scoped to the `/_astro/` prefix
- **WHEN** a client requests an HTML document at any other path
- **THEN** the response does not carry the immutable long-lived cache directive

### Requirement: Optimized Hero LCP Image

The hero portrait, which is the Largest Contentful Paint element above the fold,
SHALL be delivered as the pre-built WebP asset and SHALL be loaded eagerly with a
high fetch priority and explicit intrinsic dimensions, so the browser prioritizes
it and reserves layout space without shifting.

#### Scenario: Hero portrait loads eagerly as WebP

- **GIVEN** the brand configuration points the portrait avatar at the WebP asset
- **WHEN** the homepage renders the hero portrait image
- **THEN** the `<img>` requests the WebP file with `loading="eager"`, `fetchpriority="high"`, and explicit `width`/`height` attributes

### Requirement: Single Font Delivery Path

The website SHALL load its web fonts through exactly one request chain. The
duplicate stylesheet `@import` in the global CSS SHALL be removed, leaving the
document `<link>` in the layout head as the single font source.

#### Scenario: Fonts are requested only once

- **GIVEN** the global stylesheet no longer contains a font-provider `@import`
- **WHEN** the browser parses the page
- **THEN** the web fonts are fetched only via the layout `<link>` and not a second time from CSS

### Requirement: Deferred Hydration for Non-Critical Islands

Non-render-critical client islands (the cookie-consent banner and the portal
sidekick) SHALL hydrate with `client:idle` rather than `client:load`, so they no
longer compete with above-the-fold interactivity for main-thread time.

#### Scenario: Non-critical islands hydrate when idle

- **GIVEN** the cookie-consent and portal-sidekick islands are declared `client:idle`
- **WHEN** the page loads
- **THEN** those islands hydrate during browser idle time while render-critical islands still hydrate on load

### Requirement: Public Website Lighthouse Performance Budget

The public website SHALL meet a Lighthouse performance budget of a score of at
least 0.9 (90/100) on the homepage, verified by LHCI after production deploy.

#### Scenario: Homepage meets the performance budget after deploy

- **GIVEN** the compression, caching, image, font, and hydration changes are live in production
- **WHEN** LHCI runs its assertion pass against the homepage
- **THEN** the reported performance score is at least 0.9
