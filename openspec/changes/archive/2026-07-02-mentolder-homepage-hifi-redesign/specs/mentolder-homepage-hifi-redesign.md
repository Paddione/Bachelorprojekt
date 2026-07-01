## ADDED Requirements

### Requirement: Homepage Entrance Animation

The mentolder homepage SHALL play a `halo-in` (0.6s) entrance animation on the Hero background halo and a `fade-up` (0.5s, 0.1s delay) entrance animation on the Hero copy block when the page loads.

#### Scenario: Hero Entrance on Desktop

- **GIVEN** a user opens the mentolder homepage in a desktop browser
- **WHEN** the page finishes initial load
- **THEN** the Hero halo background fades in with a scale animation over 0.6s and the copy block fades upward over 0.5s starting after 0.1s

#### Scenario: Reduced Motion

- **GIVEN** a user has `prefers-reduced-motion: reduce` set
- **WHEN** the homepage loads
- **THEN** all entrance animations are disabled (no opacity/transform transitions play)

### Requirement: ServiceRow Staggered Scroll-Reveal

The three ServiceRow cards on the mentolder homepage SHALL fade in with a staggered 100ms delay between each card when the Angebote section scrolls into the viewport.

#### Scenario: Staggered Reveal on Scroll

- **GIVEN** a user scrolls to the Angebote section
- **WHEN** the ServiceRow elements enter the viewport
- **THEN** each row fades up sequentially with 100ms additional delay per row (first at 0ms, second at 100ms, third at 200ms)

### Requirement: FAQ Smooth Height Transition

The FAQ accordion SHALL animate answer panels open and closed using CSS `grid-template-rows: 0fr to 1fr` transitions, replacing the abrupt `hidden` attribute toggle.

#### Scenario: Accordion Open

- **GIVEN** a user clicks an FAQ question
- **WHEN** the answer expands
- **THEN** the answer panel smoothly grows in height over 0.3s with no layout shift

#### Scenario: Korczewski Brand Unaffected

- **GIVEN** the site is deployed with `BRAND_ID=korczewski`
- **WHEN** the homepage loads
- **THEN** the KoreHomepage component renders without any visual changes from this ticket
