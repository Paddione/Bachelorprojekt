// scripts/llm-proxy/local-only.test.mjs
// [T002657] Lokal-only-Anforderung: Coaching-Inhalte duerfen die eigene
// Infrastruktur nicht verlassen — auch nicht ueber die Prioritaetskette des
// Proxys.
//
// Pruefmodus: command output verification [T002448-M4] — die Tests rufen
// resolveModel() auf und pruefen, WELCHES Backend zurueckkommt. Kein Grep auf
// die Implementierung: dass ein kind-Filter im Quelltext steht, belegt nicht,
// dass die Auswahl ihn auch anwendet.
//
// Der Kern ist der dritte Test: ohne ihn wuerde ein resolveModel, das bei
// lokal-only einfach das erstbeste Backend nimmt, die beiden ersten Tests
// bestehen, solange lokale Backends zufaellig vorne stehen.
//
// Run: node --test scripts/llm-proxy/local-only.test.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModel, isLocalBackend, _testSeed } from './discovery.mjs'

/** Backends wie sie backends.mjs liefert — remote steht bewusst VORNE. */
const BACKENDS = [
  { name: 'remote-deepseek', kind: 'openai-remote', priority: 1, baseUrl: 'https://api.deepseek.com',
    modelAliases: {}, aliases: {}, fixups: [] },
  { name: 'local-gptoss', kind: 'llamacpp', priority: 2, baseUrl: 'http://127.0.0.1:8081',
    modelAliases: {}, aliases: {}, fixups: [] },
  { name: 'local-studio', kind: 'lmstudio', priority: 3, baseUrl: 'http://127.0.0.1:1234',
    modelAliases: {}, aliases: {}, fixups: [] },
]
const getBackends = () => BACKENDS

function seed({ remoteHealthy = true, localHealthy = true } = {}) {
  _testSeed({
    backends: [
      { name: 'remote-deepseek', healthy: remoteHealthy, models: ['shared-model'] },
      { name: 'local-gptoss', healthy: localHealthy, models: ['shared-model'] },
      { name: 'local-studio', healthy: localHealthy, models: ['studio-only'] },
    ],
  })
}

beforeEach(() => seed())

test('isLocalBackend: llamacpp und lmstudio sind lokal, openai-remote nicht', () => {
  assert.equal(isLocalBackend({ kind: 'llamacpp' }), true)
  assert.equal(isLocalBackend({ kind: 'lmstudio' }), true)
  assert.equal(isLocalBackend({ kind: 'openai-remote' }), false)
  // Ein kuenftiges, unbekanntes kind gilt als NICHT lokal — die Liste altert
  // ins Sichere: fehlende Zusage ist keine Zusage.
  assert.equal(isLocalBackend({ kind: 'irgendwas-neues' }), false)
  assert.equal(isLocalBackend({}), false)
})

test('lokal-only waehlt kein remote-Backend, obwohl es dasselbe Modell fuehrt und vorne steht', () => {
  // Positiv-Anker: ohne localOnly gewinnt das remote-Backend (Reihenfolge).
  const normal = resolveModel('shared-model', getBackends)
  assert.equal(normal.backend.name, 'remote-deepseek')

  const local = resolveModel('shared-model', getBackends, { localOnly: true })
  assert.equal(local.backend.name, 'local-gptoss')
  assert.equal(local.backend.kind, 'llamacpp')
})

test('lokal-only schlaegt fehl, statt auf remote zu substituieren', () => {
  seed({ remoteHealthy: true, localHealthy: false })

  // Positiv-Anker: gewoehnliche Anfragen werden weiterhin bedient — sonst
  // waere das null unten auch bei einem komplett kaputten resolveModel wahr.
  const normal = resolveModel('shared-model', getBackends)
  assert.equal(normal.backend.name, 'remote-deepseek')

  const local = resolveModel('shared-model', getBackends, { localOnly: true })
  assert.equal(local, null, 'lokal-only darf nicht auf ein remote-Backend ausweichen')
})

test('lokal-only substituiert innerhalb der lokalen Backends', () => {
  // Modell nur auf dem lmstudio-Backend: die Substitution bleibt erlaubt,
  // solange sie lokal bleibt.
  const local = resolveModel('studio-only', getBackends, { localOnly: true })
  assert.equal(local.backend.name, 'local-studio')
  assert.equal(local.substituted, false)
})

test('gewoehnliche Anfrage behaelt ihren Fallback unveraendert', () => {
  seed({ remoteHealthy: true, localHealthy: false })
  const routed = resolveModel('gibt-es-nicht', getBackends)
  assert.ok(routed, 'ohne localOnly muss der Fallback greifen')
  assert.equal(routed.backend.name, 'remote-deepseek')
  assert.equal(routed.substituted, true)
})
