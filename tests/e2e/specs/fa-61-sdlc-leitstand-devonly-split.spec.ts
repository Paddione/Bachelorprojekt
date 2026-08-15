import { test, expect } from '@playwright/test';

// FA-61: SDLC-Leitstand E1+E2 (T007559) — Development-only-Split bewachen.
//
// Kontext: Der Leitstand-Showcase (/sdlc/design-system, Astro-Route
// components/website/src/pages/sdlc/design-system.astro) ist eine
// SDLC-Oberfläche und damit Development-only — der Build-Target-Split
// (T002624, PR #3762) hält SDLC-Oberflächen aus dem Produktions-Build
// (BUILD_TARGET=prod) heraus. Ein 404 auf Prod ist der SOLL-Zustand,
// kein Defekt. Dieser Test fällt genau dann, wenn jemand den Split
// aufhebt oder die Route versehentlich in den Prod-Build aufnimmt.
//
// Positiv-Anker (T1): /api/health liegt in der Allowlist
// (INFRA_ROUTE_SUBSTRINGS) und MUSS im Prod-Build erreichbar sein —
// er belegt zugleich, dass der Test die Live-Site wirklich erreicht.
//
// WENN eine spätere Etappe den Leitstand prod-sichtbar macht, MUSS
// dieser Test angepasst werden (dann 200 statt 404) — nicht umgekehrt
// die Prod-Erreichbarkeit „reparieren".
const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

test.describe('FA-61: SDLC-Leitstand bleibt Development-only', { tag: ['@website'] }, () => {
  test('T1: /api/health antwortet 200 — Live-Site erreichbar (Positiv-Anker)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });

  test('T2: /sdlc/design-system ist im Prod-Build nicht erreichbar (Build-Target-Split)', async ({ request }) => {
    const res = await request.get(`${BASE}/sdlc/design-system`);
    // SOLL: 404 — SDLC-Oberflächen fliegen aus BUILD_TARGET=prod.
    expect(res.status()).toBe(404);
  });
});
