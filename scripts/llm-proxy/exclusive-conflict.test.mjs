// scripts/llm-proxy/exclusive-conflict.test.mjs
// findExclusiveConflict — die eine Definition von "Konflikt", die sich beide
// Startwege teilen (Auto-Start ueber planAutoStart, expliziter Start ueber
// startLoadout). [T002616]
//
// Pruefmodus: command output verification — die Funktion wird AUFGERUFEN und
// ihr Rueckgabewert geprueft. activeSlugs wird uebergeben, nie aus unitStatus
// gelesen: dieser Test fasst keine systemd-Unit an.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findExclusiveConflict, planAutoStart } from './loadouts.mjs'

// Minimaldokument mit denselben Gruppen wie loadouts.json: die GPU-Loadouts in
// chat-gpu, die bge in bge-cpu.
const DOC = {
  loadouts: [
    { slug: 'gemma9-factory', port: 8092, exclusiveGroup: 'chat-gpu' },
    { slug: 'gemma26-factory', port: 8091, exclusiveGroup: 'chat-gpu' },
    { slug: 'gptoss-context', port: 8098, exclusiveGroup: 'chat-gpu' },
    { slug: 'bge-embed-cpu', port: 8095, exclusiveGroup: 'bge-cpu' },
    { slug: 'ungrouped', port: 9000 },
  ],
}

test('anderes Loadout derselben Gruppe aktiv -> Konflikt', () => {
  // Positiv-Anker zuerst (T002356-M1): ohne aktives Loadout gibt es keinen
  // Konflikt. Waere das schon rot, sagte die Aussage darunter nichts aus.
  assert.equal(findExclusiveConflict(DOC, 'gemma26-factory', []), null)

  const c = findExclusiveConflict(DOC, 'gemma26-factory', ['gemma9-factory'])
  assert.equal(c?.conflictSlug, 'gemma9-factory')
  assert.equal(c?.group, 'chat-gpu')
})

test('Loadout einer anderen Gruppe blockiert nicht', () => {
  // Positiv-Anker: dieselbe Gruppe blockiert nachweislich...
  assert.equal(
    findExclusiveConflict(DOC, 'gemma26-factory', ['gptoss-context'])?.conflictSlug,
    'gptoss-context',
  )
  // ...eine andere Gruppe darf es also nicht tun.
  assert.equal(findExclusiveConflict(DOC, 'gemma26-factory', ['bge-embed-cpu']), null)
})

test('eigener Slug aktiv ist kein Selbstkonflikt', () => {
  // Ohne diese Ausnahme wuerde ein Neustart sich selbst blockieren, solange
  // die alte Unit noch laeuft. Der Fall gehoert zu already_running, nicht hierher.
  assert.equal(findExclusiveConflict(DOC, 'gemma26-factory', ['gemma26-factory']), null)
})

test('Loadout ohne exclusiveGroup wird nie blockiert', () => {
  assert.equal(findExclusiveConflict(DOC, 'ungrouped', ['gemma9-factory']), null)
})

test('unbekannter Slug liefert null statt zu werfen', () => {
  assert.equal(findExclusiveConflict(DOC, 'gibt-es-nicht', ['gemma9-factory']), null)
})

test('planAutoStart verhaelt sich nach der Extraktion unveraendert', () => {
  // Regressionsprobe: die Extraktion darf den Auto-Start-Pfad nicht aendern.
  // proxyV1 haengt an genau diesem Rueckgabeformat.
  const conflict = planAutoStart({
    doc: DOC, model: 'gemma26-factory', activeSlugs: ['gemma9-factory'],
  })
  assert.equal(conflict.action, 'conflict')
  assert.equal(conflict.conflictSlug, 'gemma9-factory')
  assert.equal(conflict.group, 'chat-gpu')

  const start = planAutoStart({ doc: DOC, model: 'gemma26-factory', activeSlugs: [] })
  assert.equal(start.action, 'start')
  assert.equal(start.slug, 'gemma26-factory')

  const none = planAutoStart({
    doc: DOC, model: 'gemma26-factory', activeSlugs: ['gemma26-factory'],
  })
  assert.equal(none.action, 'none')
})
