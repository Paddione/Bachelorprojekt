// API Integration Tests for ${BRAND_NAME}
// Run: node tests/api.test.mjs
// Override base URL: BASE_URL=http://localhost:4321 node tests/api.test.mjs

const BASE_URL = process.env.BASE_URL || 'http://localhost:4321';

// -- Colors --
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const PASS = `${GREEN}\u2713${RESET}`;
const FAIL = `${RED}\u2717${RESET}`;

// -- State --
let passed = 0;
let failed = 0;
const failures = [];

// -- Helpers --

function log(icon, message) {
  console.log(`  ${icon} ${message}`);
}

function section(title) {
  console.log(`\n${BOLD}${title}${RESET}`);
}

async function assert(description, fn) {
  try {
    await fn();
    passed++;
    log(PASS, description);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    log(FAIL, `${description} ${DIM}— ${msg}${RESET}`);
    failures.push({ description, error: msg });
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeOneOf(values) {
      if (!values.includes(actual)) {
        throw new Error(`expected one of ${JSON.stringify(values)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTrue() {
      if (actual !== true) {
        throw new Error(`expected true, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTypeOf(type) {
      if (typeof actual !== type) {
        throw new Error(`expected typeof ${type}, got typeof ${typeof actual}`);
      }
    },
    toBeArray() {
      if (!Array.isArray(actual)) {
        throw new Error(`expected array, got ${typeof actual}`);
      }
    },
    toHaveProperty(prop) {
      if (actual == null || !(prop in actual)) {
        throw new Error(`expected property "${prop}" in ${JSON.stringify(actual)}`);
      }
    },
  };
}

async function get(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  return fetch(url, { redirect: 'manual', ...opts });
}

async function post(path, body) {
  const url = `${BASE_URL}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
}

// ============================================================
// TESTS
// ============================================================

async function run() {
  console.log(`\n${BOLD}API Integration Tests${RESET}`);
  console.log(`${DIM}Target: ${BASE_URL}${RESET}`);

  // -- 1. Page routes (GET 200) --
  section('Page Routes');

  const pages = [
    ['/', 'Landing page'],
    ['/digital-cafe', 'Digital Cafe'],
    ['/coaching', 'Coaching'],
    ['/beratung', 'Beratung'],
    ['/ueber-mich', 'Ueber mich'],
    ['/kontakt', 'Kontakt'],
    ['/registrieren', 'Registrieren'],
    ['/termin', 'Termin'],
    ['/leistungen', 'Leistungen'],
    ['/impressum', 'Impressum'],
    ['/datenschutz', 'Datenschutz'],
  ];

  for (const [path, label] of pages) {
    await assert(`GET ${path} (${label}) returns 200`, async () => {
      const res = await get(path);
      expect(res.status).toBe(200);
    });
  }

  section('Portal Tabs (unauthenticated - expect redirect)');

  await assert('GET /portal redirects to login', async () => {
    const res = await fetch(`${BASE_URL}/portal`, { redirect: 'manual' });
    expect(res.status).toBeOneOf([302, 303]);
  });

  // -- 2. GET /api/auth/me --
  section('Auth API');

  await assert('GET /api/auth/me returns {authenticated: false} without session', async () => {
    const res = await get('/api/auth/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  // -- 3. GET /api/auth/login --
  await assert('GET /api/auth/login returns 302 redirect', async () => {
    const res = await get('/api/auth/login');
    expect(res.status).toBe(302);
  });

  // -- 4. GET /api/calendar/slots --
  section('Calendar API');

  await assert('GET /api/calendar/slots returns JSON array (or error object)', async () => {
    const res = await get('/api/calendar/slots');
    // CalDAV may not be configured in dev, so we accept 200 (array) or 500 (error)
    const body = await res.json();
    if (res.status === 200) {
      expect(body).toBeArray();
    } else {
      // If CalDAV is down, at least check it's a proper error response
      expect(res.status).toBe(500);
      expect(body).toHaveProperty('error');
    }
  });

  // -- 5. GET /api/reminders/process --
  section('Reminders API');

  await assert('GET /api/reminders/process returns pending count and array', async () => {
    const res = await get('/api/reminders/process');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('pending');
    expect(typeof body.pending).toBe('number');
    expect(body).toHaveProperty('reminders');
    expect(body.reminders).toBeArray();
  });

  // -- 6. POST /api/contact --
  section('Contact API');

  await assert('POST /api/contact with empty body returns 400', async () => {
    const res = await post('/api/contact', {});
    expect(res.status).toBe(400);
  });

  await assert('POST /api/contact missing name returns 400', async () => {
    const res = await post('/api/contact', {
      email: 'test@example.com',
      message: 'Test message',
    });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/contact with invalid email returns 400', async () => {
    const res = await post('/api/contact', {
      name: 'Test User',
      email: 'not-an-email',
      message: 'Test message',
    });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/contact with valid data returns 200 + {success: true}', async () => {
    const res = await post('/api/contact', {
      name: 'Test User',
      email: 'test@example.com',
      type: 'allgemein',
      message: 'This is a test message from the API test suite.',
    });
    // Mattermost may not be reachable in all envs, so accept 200 or 500
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBeTrue();
    } else {
      // Mattermost down = 500 internal, which means validation passed
      expect(res.status).toBe(500);
    }
  });

  // -- 7. POST /api/bug-report --
  section('Bug report form');

  await assert('POST /api/bug-report with empty body returns 400', async () => {
    const fd = new FormData();
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report missing description returns 400', async () => {
    const fd = new FormData();
    fd.append('url', 'http://test/');
    fd.append('userAgent', 'test-ua');
    fd.append('viewport', '1280x720');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report with oversized screenshot returns 400', async () => {
    const fd = new FormData();
    fd.append('description', 'Test');
    const big = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' });
    fd.append('screenshot', big, 'big.png');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report with invalid MIME returns 400', async () => {
    const fd = new FormData();
    fd.append('description', 'Test');
    const exe = new Blob([new Uint8Array(100)], { type: 'application/x-msdownload' });
    fd.append('screenshot', exe, 'virus.exe');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report with description only returns 200 or 500', async () => {
    // 200 when Mattermost is reachable, 500 when it is not — both are
    // valid outcomes for this integration test; we only assert the
    // endpoint does not crash on well-formed input.
    const fd = new FormData();
    fd.append('description', 'Automated test: Kaffeemaschine leer');
    fd.append('url', 'http://test/homepage');
    fd.append('userAgent', 'api-test/1.0');
    fd.append('viewport', '1280x720');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBeOneOf([200, 500]);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  // -- 9. POST /api/register --
  section('Register API');

  await assert('POST /api/register with empty body returns 400', async () => {
    const res = await post('/api/register', {});
    expect(res.status).toBe(400);
  });

  await assert('POST /api/register missing required fields returns 400', async () => {
    const res = await post('/api/register', {
      firstName: 'Test',
      // missing lastName and email
    });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/register with valid data returns 200 + {success: true}', async () => {
    const res = await post('/api/register', {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '+49 123 456789',
      company: 'Test GmbH',
    });
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBeTrue();
    } else {
      // External services (Mattermost, email) may be down
      expect(res.status).toBe(500);
    }
  });

  // -- 10. POST /api/booking --
  section('Booking API');

  await assert('POST /api/booking with empty body returns 400', async () => {
    const res = await post('/api/booking', {});
    expect(res.status).toBe(400);
  });

  await assert('POST /api/booking with valid data returns 200 + {success: true}', async () => {
    const res = await post('/api/booking', {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+49 123 456789',
      type: 'erstgespraech',
      message: 'Test booking',
      slotStart: '2026-05-01T10:00:00Z',
      slotEnd: '2026-05-01T11:00:00Z',
      slotDisplay: '10:00 - 11:00',
      date: '2026-05-01',
      serviceKey: 'erstgespraech',
    });
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBeTrue();
    } else {
      // External services may be down
      expect(res.status).toBe(500);
    }
  });

  // -- 11. POST /api/billing/create-invoice --
  section('Billing API');

  await assert('POST /api/billing/create-invoice with empty body returns 400', async () => {
    const res = await post('/api/billing/create-invoice', {});
    expect(res.status).toBe(400);
  });

  await assert('POST /api/billing/create-invoice with unknown service returns 400', async () => {
    const res = await post('/api/billing/create-invoice', {
      name: 'Test User',
      email: 'test@example.com',
      serviceKey: 'nonexistent-service-xyz',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  // -- 12. POST /api/meeting/finalize --
  section('Meeting API');

  await assert('POST /api/meeting/finalize with empty body returns 400', async () => {
    const res = await post('/api/meeting/finalize', {});
    expect(res.status).toBe(400);
  });

  await assert('POST /api/meeting/finalize with transcript returns results', async () => {
    const res = await fetch(`${BASE_URL}/api/meeting/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Test Insights',
        customerEmail: 'insights@test.local',
        meetingType: 'Test',
        transcript: 'Dies ist ein Test-Transkript fuer die Insights-Generierung.',
      }),
    });
    // Pipeline may fail on DB connection, but should not crash
    expect(res.status).toBeOneOf([200, 503]);
  });

  // -- 13. POST /api/reminders/process --
  section('Reminders Process (POST)');

  await assert('POST /api/reminders/process returns 200', async () => {
    const res = await post('/api/reminders/process', {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('pending');
  });

  // -- 14. Registration API --
  section('Registration API');

  await assert('POST /api/register returns 400 for missing fields', async () => {
    const res = await post('/api/register', { firstName: 'Test' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Bitte fullen Sie alle Pflichtfelder aus.');
  });

  await assert('POST /api/register returns 400 for invalid email', async () => {
    const res = await post('/api/register', { firstName: 'John', lastName: 'Doe', email: 'invalid' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Bitte geben Sie eine gultige E-Mail-Adresse an.');
  });

  await assert('POST /api/register returns 200 for valid data (or 500 if dependencies down)', async () => {
    const res = await post('/api/register', { 
      firstName: 'John', 
      lastName: 'Doe', 
      email: 'john.doe@example.com',
      company: 'Test Corp'
    });
    // In CI/Dev, this might return 500 because Mattermost/Email is not configured
    // but it confirms the route exists and processes data.
    expect([200, 500].includes(res.status)).toBeTrue();
  });

  // -- 15. Reminders persistence --
  section('Reminders (persistence)');

  await assert('GET /api/reminders/process returns pending count', async () => {
    const res = await fetch(`${BASE_URL}/api/reminders/process`);
    expect(res.status).toBeOneOf([200, 500]);
    if (res.status === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('pending');
    }
  });

  // ============================================================
  // SUMMARY
  // ============================================================

  const total = passed + failed;
  console.log(`\n${'─'.repeat(50)}`);

  if (failed === 0) {
    console.log(`${GREEN}${BOLD}All ${total} tests passed${RESET}`);
  } else {
    console.log(`${RED}${BOLD}${failed} of ${total} tests failed${RESET}`);
    console.log('');
    for (const f of failures) {
      console.log(`  ${FAIL} ${f.description}`);
      console.log(`    ${DIM}${f.error}${RESET}`);
    }
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================
// RUN
// ============================================================

// Check server is reachable before running tests
try {
  const probe = await fetch(`${BASE_URL}/api/auth/me`, { signal: AbortSignal.timeout(5000) });
  if (!probe.ok && probe.status !== 302) {
    // Server responded but not as expected — still run the tests
  }
} catch (err) {
  console.error(`\n${RED}${BOLD}Error:${RESET} Cannot reach ${BASE_URL}`);
  console.error(`${DIM}Make sure the dev server is running: npm run dev${RESET}\n`);
  process.exit(1);
}

await run();
