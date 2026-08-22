// scripts/llm-proxy/loadout-pin.test.mjs
// Tests fuer den Loadout-Pin (T013593):
//   - evaluatePin: PID-Liveness, fail-closed bei unlesbarer/unvollstaendiger Datei
//   - pinGuard:    wer darf start/stop, wer bekommt 423
//   - acquirePin:  409 bei fremdem Pin, idempotent fuer den Besitzer
//   - releasePin:  nur mit passendem Token
// Konvention: node:test, Funktionen aufrufen und Rueckgabe pruefen — kein HTTP,
// kein laufender Proxy. Ein Test gegen den echten Dienst wuerde in CI die
// Ausstattung des Runners messen statt den Zustand des Codes (T002716).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluatePin, pinGuard, acquirePin, releasePin } from './loadout-pin.mjs'

function tmpPin() {
  const dir = mkdtempSync(join(tmpdir(), 'loadout-pin-'))
  return join(dir, 'pin.json')
}

// Eine PID, die es sicher nicht gibt. 2**22 liegt ueber jedem ueblichen
// pid_max (4194304 ist der Linux-Maximalwert), deshalb erst hochzaehlen und
// dann pruefen, statt eine Zahl zu raten.
function deadPid() {
  for (let p = 4194303; p > 4194000; p--) {
    try { process.kill(p, 0) } catch (err) { if (err.code === 'ESRCH') return p }
  }
  throw new Error('keine tote PID gefunden')
}

// ── evaluatePin: Liveness und fail-closed ──────────────────────────────────

test('evaluatePin: keine Datei -> kein Pin gehalten', () => {
  const r = evaluatePin(tmpPin())
  assert.equal(r.held, false)
})

test('evaluatePin: lebende PID -> Pin gilt und traegt seine Felder', () => {
  const file = tmpPin()
  writeFileSync(file, JSON.stringify({
    slug: 'brain-ingest', pid: process.pid, reason: 'ingest', token: 't1',
    started_at: '2026-08-22T00:00:00Z',
  }))
  const r = evaluatePin(file)
  assert.equal(r.held, true)
  assert.equal(r.slug, 'brain-ingest')
  assert.equal(r.pid, process.pid)
  assert.equal(r.token, 't1')
})

test('evaluatePin: tote PID -> Pin verworfen UND Datei entfernt', () => {
  const file = tmpPin()
  writeFileSync(file, JSON.stringify({ slug: 'brain-ingest', pid: deadPid(), token: 't1' }))
  const r = evaluatePin(file)
  assert.equal(r.held, false)
  assert.equal(existsSync(file), false, 'die Pin-Datei muss verschwinden, sonst friert ein Absturz die Modellwahl ein')
})

test('evaluatePin: unparsbare Datei -> gilt als gehalten (fail-closed)', () => {
  const file = tmpPin()
  writeFileSync(file, 'kein json {{{')
  const r = evaluatePin(file)
  assert.equal(r.held, true)
  assert.equal(r.unreadable, true)
})

test('evaluatePin: keine PID -> gilt als gehalten (fail-closed)', () => {
  const file = tmpPin()
  writeFileSync(file, JSON.stringify({ slug: 'brain-ingest', token: 't1' }))
  const r = evaluatePin(file)
  assert.equal(r.held, true)
  assert.equal(r.invalidPid, true)
})

test('evaluatePin: nicht-numerische PID -> gilt als gehalten (fail-closed)', () => {
  const file = tmpPin()
  writeFileSync(file, JSON.stringify({ slug: 'brain-ingest', pid: 'viele', token: 't1' }))
  const r = evaluatePin(file)
  assert.equal(r.held, true)
  assert.equal(r.invalidPid, true)
})

// ── pinGuard: wer darf wechseln ────────────────────────────────────────────

test('pinGuard: kein Pin -> jede Anfrage darf durch', () => {
  const g = pinGuard({ held: false }, null)
  assert.equal(g.allowed, true)
})

test('pinGuard: fremde Anfrage ohne Token -> 423 mit locked_by_pin', () => {
  const pin = { held: true, slug: 'brain-ingest', pid: 4242, token: 'geheim' }
  const g = pinGuard(pin, null)
  assert.equal(g.allowed, false)
  assert.equal(g.status, 423)
  assert.equal(g.code, 'locked_by_pin')
  // Die Meldung muss sagen WER haelt, nicht nur DASS etwas haelt.
  assert.match(g.message, /brain-ingest/)
  assert.match(g.message, /4242/)
  assert.equal(g.slug, 'brain-ingest')
  assert.equal(g.pid, 4242)
})

test('pinGuard: falsches Token -> 423', () => {
  const pin = { held: true, slug: 'brain-ingest', pid: 4242, token: 'geheim' }
  assert.equal(pinGuard(pin, 'geraten').allowed, false)
})

test('pinGuard: passendes Token -> darf durch', () => {
  const pin = { held: true, slug: 'brain-ingest', pid: 4242, token: 'geheim' }
  assert.equal(pinGuard(pin, 'geheim').allowed, true)
})

test('pinGuard: unlesbarer Pin ohne Token -> 423 (fail-closed, kein Freibrief)', () => {
  const g = pinGuard({ held: true, unreadable: true }, 'irgendwas')
  assert.equal(g.allowed, false)
  assert.equal(g.status, 423)
})

// ── acquirePin / releasePin ────────────────────────────────────────────────

test('acquirePin: freier Pin -> Token zurueck, Datei da', () => {
  const file = tmpPin()
  const r = acquirePin(file, { slug: 'brain-ingest', pid: process.pid, reason: 'ingest' })
  assert.ok(r.token, 'acquire muss ein Token liefern')
  assert.equal(r.slug, 'brain-ingest')
  assert.equal(evaluatePin(file).held, true)
})

test('acquirePin: fremder lebender Pin -> 409', () => {
  const file = tmpPin()
  writeFileSync(file, JSON.stringify({ slug: 'gemma4', pid: process.pid, token: 'fremd' }))
  assert.throws(
    () => acquirePin(file, { slug: 'brain-ingest', pid: process.pid, reason: 'ingest' }),
    (err) => err.status === 409,
  )
})

test('acquirePin: toter Pin steht dem Erwerb nicht im Weg', () => {
  const file = tmpPin()
  writeFileSync(file, JSON.stringify({ slug: 'gemma4', pid: deadPid(), token: 'alt' }))
  const r = acquirePin(file, { slug: 'brain-ingest', pid: process.pid, reason: 'ingest' })
  assert.ok(r.token)
  assert.equal(evaluatePin(file).slug, 'brain-ingest')
})

test('releasePin: passendes Token -> Datei weg', () => {
  const file = tmpPin()
  const { token } = acquirePin(file, { slug: 'brain-ingest', pid: process.pid, reason: 'ingest' })
  releasePin(file, token)
  assert.equal(existsSync(file), false)
  assert.equal(evaluatePin(file).held, false)
})

test('releasePin: falsches Token -> Pin bleibt stehen', () => {
  const file = tmpPin()
  acquirePin(file, { slug: 'brain-ingest', pid: process.pid, reason: 'ingest' })
  assert.throws(() => releasePin(file, 'geraten'), (err) => err.status === 423)
  assert.equal(evaluatePin(file).held, true)
})

test('releasePin: kein Pin da -> kein Fehler (idempotent)', () => {
  releasePin(tmpPin(), 'egal')
})
