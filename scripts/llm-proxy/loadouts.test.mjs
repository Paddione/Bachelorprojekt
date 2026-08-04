// scripts/llm-proxy/loadouts.test.mjs
// Reine Validierungs- und Round-Trip-Tests. Kein Dateisystem ausser tmpdir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseLoadouts, readLoadouts, writeLoadouts, findLoadout, findExclusiveConflict } from './loadouts.mjs'

const valid = {
  version: 1,
  modelRoots: ['~/models/gguf'],
  defaults: { host: '0.0.0.0' },
  loadouts: [{
    slug: 'gptoss-context',
    label: 'gpt-oss-20b',
    model: 'gptoss20/gpt-oss-20b-Q8_0.gguf',
    port: 8098,
    fit: { enabled: true, targetMarginMib: 2400, minCtx: 32768 },
    args: { ctx: null, ngl: null, parallel: 1, cacheTypeK: 'q8_0', cacheTypeV: 'q8_0',
            loadMode: 'mmap', flashAttention: true, jinja: true, metrics: true,
            reasoning: 'auto', reasoningBudget: null },
    speculative: { draftHfRepo: null, draftNgl: null },
    mcp: { serversConfig: null },
    extraArgs: [],
  }],
}

test('parseLoadouts: gueltiges Dokument kommt unveraendert zurueck', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(doc.loadouts.length, 1)
  assert.equal(doc.loadouts[0].slug, 'gptoss-context')
})

test('parseLoadouts: ctx null bleibt null und wird NICHT zu 0', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(doc.loadouts[0].args.ctx, null)
  assert.notEqual(doc.loadouts[0].args.ctx, 0)
})

test('parseLoadouts: doppelter Slug wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts.push(structuredClone(valid.loadouts[0]))
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /slug.*gptoss-context/i)
})

test('parseLoadouts: fit.enabled=false ohne ctx wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].fit.enabled = false
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /fit/i)
})

test('parseLoadouts: fit.enabled=false mit ctx und ngl ist gueltig', () => {
  const ok = structuredClone(valid)
  ok.loadouts[0].fit.enabled = false
  ok.loadouts[0].args.ctx = 32768
  ok.loadouts[0].args.ngl = 24
  const doc = parseLoadouts(JSON.stringify(ok))
  assert.equal(doc.loadouts[0].args.ctx, 32768)
})

test('parseLoadouts: unbekanntes Feld im Loadout wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].bogusField = 1
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /bogusField/)
})

test('parseLoadouts: ungueltiger Slug wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].slug = 'Bad Slug!'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /slug/i)
})

test('parseLoadouts: kaputtes JSON meldet Klartext', () => {
  assert.throws(() => parseLoadouts('{ nope'), /JSON/i)
})

test('Round-Trip lesen -> schreiben -> lesen ist idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadouts-'))
  const p = join(dir, 'loadouts.json')
  writeFileSync(p, JSON.stringify(valid, null, 2))
  const first = readLoadouts(p)
  writeLoadouts(first.doc, p, first.mtimeMs)
  const second = readLoadouts(p)
  assert.deepEqual(second.doc, first.doc)
})

test('writeLoadouts: mtime-Konflikt wird abgelehnt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadouts-'))
  const p = join(dir, 'loadouts.json')
  writeFileSync(p, JSON.stringify(valid, null, 2))
  const { doc } = readLoadouts(p)
  assert.throws(() => writeLoadouts(doc, p, 1), /geaendert|conflict/i)
})

test('findLoadout findet per Slug und liefert undefined sonst', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(findLoadout(doc, 'gptoss-context').port, 8098)
  assert.equal(findLoadout(doc, 'ghost'), undefined)
})

test('parseLoadouts: model path mit .. wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].model = '../../etc/passwd'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /\.\./)
})

// ── T002550: eingebaute llama-Tools ──────────────────────────────────────────
//
// Die Namen stammen aus `llama-server --help` (b10223) und sind bewusst als
// Allowlist gefuehrt: read_file, file_glob_search, grep_search,
// exec_shell_command, write_file, edit_file, get_datetime.
//
// 'all' waere ebenfalls ein gueltiger llama-Wert, wird hier aber ABGELEHNT.
// llama.cpp kennt weder Sandbox noch Wurzelverzeichnis-Beschraenkung; wer
// exec_shell_command freischaltet, gibt Shell-Zugriff mit den Rechten der Unit
// auf das gesamte Benutzerverzeichnis. Ein Wort in der Registry darf das nicht
// verstecken — die Faehigkeit muss dort namentlich stehen, wo sie erteilt wird.

test('parseLoadouts: bekannte tools-Namen sind gueltig', () => {
  const ok = structuredClone(valid)
  ok.loadouts[0].tools = 'read_file,grep_search,edit_file'
  assert.equal(parseLoadouts(JSON.stringify(ok)).loadouts[0].tools,
    'read_file,grep_search,edit_file')
})

test('parseLoadouts: tools ist optional', () => {
  // Positiv-Anker: ohne das Feld bleibt das Dokument gueltig.
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(doc.loadouts[0].tools, undefined)
})

test("parseLoadouts: tools='all' wird abgelehnt", () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].tools = 'all'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /namentlich/)
})

test('parseLoadouts: unbekannter tools-Name wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].tools = 'read_file,list_directory'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /list_directory/)
})

test('parseLoadouts: leerer tools-String wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].tools = ''
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /tools/)
})

// ── T002628: externer Halter (managed: external) ───────────────────────────

test('parseLoadouts: managed=external ist ein gueltiges Feld', () => {
  const doc = structuredClone(valid)
  doc.loadouts[0].managed = 'external'
  const out = parseLoadouts(JSON.stringify(doc))
  assert.equal(out.loadouts[0].managed, 'external')
})

test('parseLoadouts: unbekannter managed-Wert wird verworfen (kein Fehler) — Feld bleibt frei', () => {
  const doc = structuredClone(valid)
  doc.loadouts[0].managed = 'internal'
  const out = parseLoadouts(JSON.stringify(doc))
  // 'internal' ist kein verpflichtendes Werte-Enum — das Feld ist frei textuell.
  // Der Test hält nur fest, dass der Parser das Feld akzeptiert und durchreicht.
  assert.equal(out.loadouts[0].managed, 'internal')
})

test('findExclusiveConflict: externer Eintrag ist Gruppenmitglied', () => {
  const doc = structuredClone(valid)
  doc.loadouts[0].exclusiveGroup = 'chat-gpu'
  doc.loadouts[0].managed = 'external'
  doc.loadouts[0].slug = 'unsloth-studio'
  doc.loadouts[0].port = 45013
  const other = structuredClone(valid.loadouts[0])
  other.slug = 'gptoss-context'
  other.exclusiveGroup = 'chat-gpu'
  doc.loadouts.push(other)
  const parsed = parseLoadouts(JSON.stringify(doc))
  const conflict = findExclusiveConflict(parsed, 'gptoss-context', ['unsloth-studio'])
  assert.ok(conflict, 'externer Eintrag muss als Konflikt gemeldet werden')
  assert.equal(conflict.conflictSlug, 'unsloth-studio')
  assert.equal(conflict.group, 'chat-gpu')
})

test('findExclusiveConflict: aktiver externer Eintrag ohne Unit zaehlt via Port-Liveness', () => {
  // Der externe Eintrag hat keine systemd-Unit. findExclusiveConflict bekommt
  // die aktiven Slugs vom Aufrufer (server.mjs filtert ueber isLoadoutActive).
  // Hier: der externe Slug steht in activeSlugs, muss also als Konflikt melden.
  const doc = structuredClone(valid)
  doc.loadouts[0].exclusiveGroup = 'chat-gpu'
  doc.loadouts[0].managed = 'external'
  doc.loadouts[0].slug = 'unsloth-studio'
  doc.loadouts[0].port = 45013
  const other = structuredClone(valid.loadouts[0])
  other.slug = 'gptoss-context'
  other.exclusiveGroup = 'chat-gpu'
  doc.loadouts.push(other)
  const parsed = parseLoadouts(JSON.stringify(doc))
  const conflict = findExclusiveConflict(parsed, 'gptoss-context', ['unsloth-studio'])
  assert.ok(conflict)
})

