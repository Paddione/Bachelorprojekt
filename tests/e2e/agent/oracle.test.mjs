// tests/e2e/agent/oracle.test.mjs
// T901645 — Orakel-Checks gegen Fixture-Seitenstaende (URL/Text/State-Tripel).
// Muster: scripts/llm-proxy/bge-routes.test.mjs (node:test + node:assert/strict).
// Fixture-Namen entsprechen den kuratierten Flows aus curated.json (p2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFlow, summarize, validateFlows } from './oracle.mjs';

test('evaluateFlow: Login-Fixture mit erfuellten Checks besteht', () => {
  const flow = {
    id: 'smoke-home',
    checks: [
      { type: 'urlContains', value: '/login' },
      { type: 'textContains', value: 'Anmelden' },
    ],
  };
  const state = { url: 'http://localhost:4321/login', text: 'Bitte Anmelden', apiState: {} };
  const result = evaluateFlow(flow, state);
  assert.equal(result.pass, true);
  assert.ok(result.checks.every((c) => c.pass));
});

test('urlContains: booking-termin-tab landet auf /kontakt', () => {
  const flow = { id: 'booking-termin-tab', checks: [{ type: 'urlContains', value: '/kontakt' }] };
  const ok = evaluateFlow(flow, { url: 'http://localhost:4321/kontakt?mode=termin', text: '', apiState: {} });
  assert.equal(ok.pass, true);
  const bad = evaluateFlow(flow, { url: 'http://localhost:4321/termin', text: '', apiState: {} });
  assert.equal(bad.pass, false);
  assert.equal(bad.checks.length, 1);
  assert.equal(bad.checks[0].pass, false);
  assert.ok(bad.checks[0].detail.includes('/kontakt'));
});

test('urlMatches: admin-inbox-renders mit Status-Query', () => {
  const flow = { id: 'admin-inbox-renders', checks: [{ type: 'urlMatches', value: '/admin/inbox\\?status=\\w+' }] };
  const ok = evaluateFlow(flow, { url: 'http://localhost:4321/admin/inbox?status=offen', text: '', apiState: {} });
  assert.equal(ok.pass, true);
  const bad = evaluateFlow(flow, { url: 'http://localhost:4321/admin/inbox', text: '', apiState: {} });
  assert.equal(bad.pass, false);
  assert.ok(bad.checks[0].detail.length > 0);
});

test('textContains: billing-services zeigt Leistungsnamen', () => {
  const flow = { id: 'billing-services', checks: [{ type: 'textContains', value: 'Leistungen' }] };
  const ok = evaluateFlow(flow, { url: 'http://localhost:4321/leistungen', text: 'Unsere Leistungen im Überblick', apiState: {} });
  assert.equal(ok.pass, true);
  const bad = evaluateFlow(flow, { url: 'http://localhost:4321/leistungen', text: 'Seite nicht gefunden', apiState: {} });
  assert.equal(bad.pass, false);
  assert.ok(bad.checks[0].detail.includes('Leistungen'));
});

test('textMatches: content-hub-editor enthaelt Editor-Kontext', () => {
  const flow = { id: 'content-hub-editor', checks: [{ type: 'textMatches', value: 'Inhalt(e|en)\\s+(speichern|verwalten)' }] };
  const ok = evaluateFlow(flow, { url: 'http://localhost:4321/admin/inhalte', text: 'Inhalte verwalten', apiState: {} });
  assert.equal(ok.pass, true);
  const bad = evaluateFlow(flow, { url: 'http://localhost:4321/admin/inhalte', text: 'Zugriff verweigert', apiState: {} });
  assert.equal(bad.pass, false);
  assert.ok(bad.checks[0].detail.length > 0);
});

test('apiEquals: messaging-portal-gate mit Pfadvergleich', () => {
  const flow = { id: 'messaging-portal-gate',
    checks: [{ type: 'apiEquals', path: 'rooms', value: [{ id: 1, unread: 2 }] }] };
  const state = { url: 'http://localhost:4321/portal', text: '', apiState: { rooms: [{ id: 1, unread: 2 }] } };
  assert.equal(evaluateFlow(flow, state).pass, true);
  const deviant = { ...state, apiState: { rooms: [{ id: 1, unread: 0 }] } };
  const bad = evaluateFlow(flow, deviant);
  assert.equal(bad.pass, false);
  assert.ok(bad.checks[0].detail.includes('rooms'));
});

test('apiEquals: ohne Pfad wird der gesamte State verglichen', () => {
  const flow = { id: 'admin-platform-gate', checks: [{ type: 'apiEquals', value: { ok: true } }] };
  assert.equal(evaluateFlow(flow, { url: '', text: '', apiState: { ok: true } }).pass, true);
  assert.equal(evaluateFlow(flow, { url: '', text: '', apiState: { ok: false } }).pass, false);
});

test('Aggregation: genau der betroffene Check ist rot', () => {
  const flow = { id: 'smoke-home', checks: [
    { type: 'urlContains', value: '/login' },
    { type: 'textContains', value: 'Anmelden' },
    { type: 'apiEquals', path: 'session', value: null },
  ] };
  const result = evaluateFlow(flow, { url: 'http://localhost:4321/login', text: 'Willkommen', apiState: {} });
  assert.equal(result.pass, false);
  assert.deepEqual(result.checks.map((c) => c.pass), [true, false, false]);
  assert.ok(result.checks.every((c) => c.detail.length > 0));
});

test('unbekannter Check-Typ: fail statt Wurf', () => {
  const flow = { id: 'smoke-home', checks: [{ type: 'cssVisible', value: 'h1' }] };
  const result = evaluateFlow(flow, { url: '', text: '', apiState: {} });
  assert.equal(result.pass, false);
  assert.ok(result.checks[0].detail.includes('cssVisible'));
});

test('ungueltiges Regex-Pattern: fail statt Wurf', () => {
  const flow = { id: 'smoke-home', checks: [{ type: 'textMatches', value: '([' }] };
  const result = evaluateFlow(flow, { url: '', text: 'x', apiState: {} });
  assert.equal(result.pass, false);
  assert.ok(result.checks[0].detail.includes('ungueltig'));
});

test('summarize: einzeilige stderr-Zeile mit Flow, Pass und Fail-Namen', () => {
  const line = summarize({ flow: 'smoke-home', pass: false,
    checks: [{ name: 'urlContains', pass: true }, { name: 'textContains', pass: false }] });
  assert.equal(line, 'flow=smoke-home pass=false failed=textContains');
  const ok = summarize({ flow: 'smoke-home', pass: true, checks: [{ name: 'urlContains', pass: true }] });
  assert.equal(ok, 'flow=smoke-home pass=true failed=none');
});

const okFlow = (extra = {}) => ({ id: 'smoke-home', start_url: '/', goal_checks: [{ type: 'urlContains', value: '/' }], ...extra });

test('validateFlows: gueltige Flows mit und ohne auth-Marker passieren unveraendert', () => {
  const flows = [okFlow({ id: 'content-hub-editor', auth: true }), okFlow()];
  assert.equal(validateFlows(flows), flows);
});

test('validateFlows: unbekannter Check-Typ nennt die Flow-ID', () => {
  assert.throws(() => validateFlows([okFlow({ id: 'x1', goal_checks: [{ type: 'cssVisible', value: 'a' }] })]), /Flow x1.*cssVisible/);
});

test('validateFlows: auth ohne boolean nennt die Flow-ID', () => {
  assert.throws(() => validateFlows([okFlow({ id: 'x2', auth: 'yes' })]), /Flow x2.*auth/);
});

test('validateFlows: leere Checks nennen die Flow-ID', () => {
  assert.throws(() => validateFlows([okFlow({ id: 'x3', goal_checks: [] })]), /Flow x3/);
});

test('validateFlows: fehlende id wird benannt', () => {
  const { id, ...ohneId } = okFlow();
  assert.throws(() => validateFlows([ohneId]), /id/);
});

test('curated.json: genau die zwei Admin-Flows tragen den auth-Marker', async () => {
  const { readFileSync } = await import('node:fs');
  const doc = JSON.parse(readFileSync(new URL('./curated.json', import.meta.url), 'utf8'));
  validateFlows(doc.flows);
  assert.deepEqual(doc.flows.filter((f) => f.auth === true).map((f) => f.id), ['content-hub-editor', 'admin-inbox-renders']);
});
