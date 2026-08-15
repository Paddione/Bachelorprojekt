// Curated mentolder design-system surface (Brand + UI). .astro excluded (server-only).
// group = DS pane grouping; file = svelte source relative to website root.
export const COMPONENTS = [
  // Marketing / brand surface
  { name: 'Hero', group: 'Marketing', file: 'src/components/Hero.svelte' },
  { name: 'CallToAction', group: 'Marketing', file: 'src/components/CallToAction.svelte' },
  { name: 'ServiceCard', group: 'Marketing', file: 'src/components/ServiceCard.svelte' },
  { name: 'ServiceRow', group: 'Marketing', file: 'src/components/ServiceRow.svelte', card: { cardMode: 'column' } },
  { name: 'QuoteCard', group: 'Marketing', file: 'src/components/QuoteCard.svelte' },
  { name: 'WhyMe', group: 'Marketing', file: 'src/components/WhyMe.svelte', card: { cardMode: 'column' } },
  { name: 'FAQ', group: 'Marketing', file: 'src/components/FAQ.svelte' },
  { name: 'Portrait', group: 'Marketing', file: 'src/components/Portrait.svelte' },
  { name: 'Avatar', group: 'Marketing', file: 'src/components/Avatar.svelte' },
  // Navigation
  { name: 'Navigation', group: 'Navigation', file: 'src/components/Navigation.svelte', card: { cardMode: 'column' } },
  { name: 'LanguageSwitcher', group: 'Navigation', file: 'src/components/LanguageSwitcher.svelte' },
  // Forms
  { name: 'ContactForm', group: 'Forms', file: 'src/components/ContactForm.svelte' },
  { name: 'BookingForm', group: 'Forms', file: 'src/components/BookingForm.svelte' },
  { name: 'RegistrationForm', group: 'Forms', file: 'src/components/RegistrationForm.svelte' },
  { name: 'NewsletterSignup', group: 'Forms', file: 'src/components/NewsletterSignup.svelte' },
  // Feedback / data
  { name: 'CookieConsent', group: 'Feedback', file: 'src/components/CookieConsent.svelte' },
  { name: 'Timeline', group: 'Feedback', file: 'src/components/Timeline.svelte' },
  // UI primitives
  { name: 'SegmentDots', group: 'UI', file: 'src/components/ui/SegmentDots.svelte' },
  { name: 'Stepper', group: 'UI', file: 'src/components/ui/Stepper.svelte' },
  { name: 'ToggleSwitch', group: 'UI', file: 'src/components/ui/ToggleSwitch.svelte' },
];
