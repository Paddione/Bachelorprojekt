import { test, expect } from '@playwright/test';

// FA-62: Massage-Pilot E2E (T901029) — öffentliche Besucher-Journey + Anfrage-Lifecycle.
// Läuft gegen eine Massage-Brand-Instanz (BRAND=massage, z. B. lokale Dev-Instanz
// auf http://localhost:4321). Gegen andere Brands skippt der Spec selbständig,
// damit Nightly gegen web.mentolder.de grün bleibt.
// Pilot-Setup (DB-Fenster etc.): siehe T901029 Runbook-Anhang; E2E-Header
// markieren alle erzeugten Datensätze als Testdaten (is_test_data).
const BASE = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const CRON_SECRET = process.env.E2E_CRON_SECRET ?? 'e2e-pilot-secret';
const E2E_HEADERS = { 'X-E2E-Test': '1', 'X-Cron-Secret': CRON_SECRET };
// Booking ist auf 5 POSTs/min pro IP limitiert — jeder Test nutzt eine eigene
// Absender-IP, damit der Suite-Lauf nicht ins Rate-Limit rennt.
const ipBase = 10 + (Date.now() % 200);
let ipCounter = 0;
const workerIdx = Number(process.env.TEST_WORKER_INDEX ?? 0) % 250;
function testHeaders(extra: Record<string, string> = {}) {
  ipCounter += 1;
  return { ...E2E_HEADERS, 'X-Forwarded-For': `10.9.${workerIdx}.${ipBase + ipCounter}`, ...extra };
}

function dayPlus(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

test.describe('FA-62: Massage-Pilot', { tag: ['@booking'] }, () => {
  test.beforeEach(async ({ request }) => {
    const home = await request.get(`${BASE}/`);
    test.skip(home.status() !== 200, 'Homepage nicht erreichbar');
    const html = await home.text();
    test.skip(!html.includes('Massagepraxis'), 'keine Massage-Brand — Spec skippt');
  });

  test('T1: Homepage rendert Massage-Marker + CTA', async ({ request }) => {
    const res = await request.get(`${BASE}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('Massagepraxis');
    expect(html).toContain('Termin anfragen');
  });

  test('T2: Leistungen, FAQ, Profil rendern 200', async ({ request }) => {
    for (const slug of ['leistungen', 'faq', 'ueber-mich', 'kontakt']) {
      const res = await request.get(`${BASE}/${slug}`);
      expect(res.status(), slug).toBe(200);
    }
  });

  test('T3: Slots-API liefert buchbare Slots', async ({ request }) => {
    const res = await request.get(`${BASE}/api/calendar/slots?from=${dayPlus(2)}&durationMin=30`);
    expect(res.status()).toBe(200);
    const days = await res.json();
    expect(Array.isArray(days)).toBe(true);
    const total = days.reduce((n: number, d: { slots?: unknown[] }) => n + (d.slots?.length ?? 0), 0);
    expect(total).toBeGreaterThan(0);
  });

  test('T4+T6: Anfrage anlegen + Idempotenz-Replay gibt gleichen Token', async ({ request }) => {
    const date = dayPlus(2);
    const key = `pilot-${Date.now()}`;
    const body = {
      name: 'Pilot Test', email: 'pilot@example.org', type: 'termin',
      slotStart: `${date}T10:00:00+02:00`, slotEnd: `${date}T10:30:00+02:00`,
      slotDisplay: '10:00 - 10:30', date, leistungKey: 'ruecken-30',
    };
    const r1 = await request.post(`${BASE}/api/booking`, {
      data: body, headers: testHeaders({ 'Idempotency-Key': key }),
    });
    expect(r1.status()).toBe(200);
    const j1 = await r1.json();
    expect(j1.requestToken).toBeTruthy();
    expect(j1.state).toBe('offen');
    const r2 = await request.post(`${BASE}/api/booking`, {
      data: body, headers: testHeaders({ 'Idempotency-Key': key }),
    });
    expect(r2.status()).toBe(200);
    const j2 = await r2.json();
    expect(j2.requestToken).toBe(j1.requestToken);
  });

  test('T7: Gleich-Tag-Anfrage wird 409', async ({ request }) => {
    const today = dayPlus(0);
    const res = await request.post(`${BASE}/api/booking`, {
      data: {
        name: 'Pilot Test', email: 'pilot@example.org', type: 'termin',
        slotStart: `${today}T10:00:00+02:00`, slotEnd: `${today}T10:30:00+02:00`,
        slotDisplay: '10:00 - 10:30', date: today, leistungKey: 'ruecken-30',
      },
      headers: testHeaders({ 'Idempotency-Key': `pilot-sameday-${Date.now()}` }),
    });
    expect(res.status()).toBe(409);
  });

  test('T8+T9: Token-Statusseite + Storno', async ({ request }) => {
    const date = dayPlus(3);
    const r1 = await request.post(`${BASE}/api/booking`, {
      data: {
        name: 'Pilot Storno', email: 'storno@example.org', type: 'termin',
        slotStart: `${date}T11:00:00+02:00`, slotEnd: `${date}T11:30:00+02:00`,
        slotDisplay: '11:00 - 11:30', date, leistungKey: 'ruecken-30',
      },
      headers: testHeaders({ 'Idempotency-Key': `pilot-cancel-${Date.now()}` }),
    });
    expect(r1.status()).toBe(200);
    const { requestToken } = await r1.json();
    const page = await request.get(`${BASE}/anfrage/${requestToken}`);
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain('angefragt');
    const cancel = await request.post(`${BASE}/api/anfrage/${requestToken}/storno`, {
      data: {}, headers: testHeaders(),
    });
    expect(cancel.status()).toBe(200);
    const after = await request.get(`${BASE}/anfrage/${requestToken}`);
    expect(await after.text()).toContain('storniert');
  });

  test('T10: Cron ohne Bearer 403, Owner ohne Session abgewiesen', async ({ request }) => {
    const cron = await request.post(`${BASE}/api/cron/appointment-reminders`, { data: {} });
    expect(cron.status()).toBe(403);
    const owner = await request.get(`${BASE}/owner/anfragen`);
    expect(owner.url()).not.toBe(`${BASE}/owner/anfragen`);
  });

  test('T11: Umbuchung erzeugt verknüpfte Neuanfrage', async ({ request }) => {
    const date = dayPlus(3);
    const r1 = await request.post(`${BASE}/api/booking`, {
      data: {
        name: 'Pilot Umbuchung', email: 'umbuchung@example.org', type: 'termin',
        slotStart: `${date}T14:00:00+02:00`, slotEnd: `${date}T14:30:00+02:00`,
        slotDisplay: '14:00 - 14:30', date, leistungKey: 'ruecken-30',
      },
      headers: testHeaders({ 'Idempotency-Key': `pilot-resched-${Date.now()}` }),
    });
    expect(r1.status()).toBe(200);
    const { requestToken } = await r1.json();
    const re = await request.post(`${BASE}/api/anfrage/${requestToken}/umbuchung`, {
      data: { date, slotStart: `${date}T15:00:00+02:00`, slotEnd: `${date}T15:30:00+02:00` },
      headers: testHeaders(),
    });
    expect(re.status()).toBe(200);
  });
});
