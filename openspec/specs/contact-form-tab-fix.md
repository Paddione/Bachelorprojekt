## Purpose

Stellt sicher, dass der Kontaktformular-Tab "Nachricht" von Playwright-E2E-Tests
zuverlässig gefunden und angeklickt werden kann, unabhängig von der berechneten
Accessible-Name-Textzusammensetzung.

## Requirements

### Requirement: Contact Form Tab Selection — "Nachricht" reliably clickable

The contact form tab "Nachricht" (`02 — Nachricht`) MUST be reliably clickable
by Playwright E2E tests when running against the production website.

**Previous behavior (flaky):** The tab button's accessible name was computed from
nested `<span>` text content ("02 — Nachricht Eine Frage stellen. ..."), which could
be ambiguous or slow to compute in headless CI runners.

**Fixed behavior (robust):** The tab button carries an explicit `aria-label="02 – Nachricht senden"`
that makes the accessible name deterministic regardless of text content computation.
Additionally, a `data-testid="tab-nachricht"` attribute provides a stable selector
for future test improvements.

#### Scenario: Tab "Nachricht" is clickable via accessible name
- **GIVEN** the kontakt page is loaded and all Astro islands are hydrated
- **WHEN** Playwright looks for a role `tab` with name matching `/Nachricht/i`
- **THEN** the tab button with aria-label `02 – Nachricht senden` is found
- **AND** clicking it switches the contact form to message mode

#### Scenario: Tab "Nachricht" is clickable via data-testid
- **GIVEN** the kontakt page is loaded
- **WHEN** Playwright uses `[data-testid="tab-nachricht"]`
- **THEN** the tab button for message mode is found and clickable

<!-- merged from change delta contact-form-tab-fix.md (406cb1f32184) -->