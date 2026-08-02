// scripts/llm-proxy/runner.test.mjs
// argv-Konstruktion ohne Prozessstart. Der wichtigste Test ist
// "null-Felder erscheinen NICHT in argv" -- er kodiert die --fit-Regel.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unitName, buildServerArgv, buildStartCommand } from './runner.mjs'

const base = {
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
}
const defaults = { host: '0.0.0.0' }
const MODEL = '/home/u/models/gptoss20/gpt-oss-20b-Q8_0.gguf'

test('unitName folgt dem Slug', () => {
  assert.equal(unitName('gptoss-context'), 'llama-gptoss-context.service')
})

test('null-Felder erscheinen NICHT in argv (sonst ist --fit tot)', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.equal(argv.includes('-c'), false, '-c darf nicht gesetzt sein')
  assert.equal(argv.includes('-ngl'), false, '-ngl darf nicht gesetzt sein')
  assert.equal(argv.includes('--reasoning-budget'), false)
  assert.equal(argv.includes('--spec-draft-hf'), false)
  assert.equal(argv.includes('--mcp-servers-config'), false)
})

test('fit erzeugt -fit/-fitt/-fitc', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.deepEqual(argv.slice(argv.indexOf('-fit'), argv.indexOf('-fit') + 6),
    ['-fit', 'on', '-fitt', '2400', '-fitc', '32768'])
})

test('gepinnter ctx erscheint als -c', () => {
  const pinned = structuredClone(base)
  pinned.args.ctx = 65536
  const argv = buildServerArgv(pinned, MODEL, defaults)
  assert.equal(argv[argv.indexOf('-c') + 1], '65536')
})

test('flags werden gesetzt bzw. weggelassen', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.ok(argv.includes('--jinja'))
  assert.ok(argv.includes('--metrics'))
  assert.deepEqual(argv.slice(argv.indexOf('-fa'), argv.indexOf('-fa') + 2), ['-fa', 'on'])
  const off = structuredClone(base)
  off.args.jinja = false
  off.args.flashAttention = false
  const argv2 = buildServerArgv(off, MODEL, defaults)
  assert.equal(argv2.includes('--jinja'), false)
  assert.equal(argv2.includes('-fa'), false)
})

test('alias ist der Slug — damit ist das Loadout unter seinem Namen anfragbar', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.equal(argv[argv.indexOf('--alias') + 1], 'gptoss-context')
})

test('extraArgs stehen am Ende', () => {
  const withExtra = structuredClone(base)
  withExtra.extraArgs = ['--n-cpu-moe', '24']
  const argv = buildServerArgv(withExtra, MODEL, defaults)
  assert.deepEqual(argv.slice(-2), ['--n-cpu-moe', '24'])
})

test('fit.enabled=false erzeugt -fit off und die gepinnten Werte', () => {
  const noFit = structuredClone(base)
  noFit.fit.enabled = false
  noFit.args.ctx = 32768
  noFit.args.ngl = 24
  const argv = buildServerArgv(noFit, MODEL, defaults)
  assert.deepEqual(argv.slice(argv.indexOf('-fit'), argv.indexOf('-fit') + 2), ['-fit', 'off'])
  assert.equal(argv.includes('-fitt'), false)
  assert.equal(argv[argv.indexOf('-c') + 1], '32768')
  assert.equal(argv[argv.indexOf('-ngl') + 1], '24')
})

test('speculative und mcp erscheinen, wenn gesetzt', () => {
  const spec = structuredClone(base)
  spec.speculative = { draftHfRepo: 'org/draft:Q4_K_M', draftNgl: 8 }
  spec.mcp = { serversConfig: '/etc/mcp.json' }
  const argv = buildServerArgv(spec, MODEL, defaults)
  assert.equal(argv[argv.indexOf('--spec-draft-hf') + 1], 'org/draft:Q4_K_M')
  assert.equal(argv[argv.indexOf('-ngld') + 1], '8')
  assert.equal(argv[argv.indexOf('--mcp-servers-config') + 1], '/etc/mcp.json')
})

// T002426: die Web-UI von llama-server laesst den BROWSER direkt zum MCP-Server
// verbinden. Ein lokaler MCP-Server ohne CORS-Header lehnt das ab; mit
// --ui-mcp-proxy verbindet llama-server selbst. Der zweite Fall unten ist der
// Positiv-Anker zum ersten: faellt die Abbildung ganz weg, bleibt das Flag in
// beiden Faellen aus und der erste Test wird rot statt beide vakuos gruen.
test('uiMcpProxy=true erzeugt --ui-mcp-proxy in argv', () => {
  const withProxy = structuredClone(base)
  withProxy.args.uiMcpProxy = true
  const argv = buildServerArgv(withProxy, MODEL, defaults)
  assert.ok(argv.includes('--ui-mcp-proxy'))
})

test('uiMcpProxy=false bzw. fehlend erzeugt das Flag NICHT', () => {
  const off = structuredClone(base)
  off.args.uiMcpProxy = false
  assert.equal(buildServerArgv(off, MODEL, defaults).includes('--ui-mcp-proxy'), false)
  // base kennt das Feld gar nicht — auch dann darf nichts gesetzt werden.
  assert.equal(buildServerArgv(base, MODEL, defaults).includes('--ui-mcp-proxy'), false)
})

test('buildStartCommand kapselt systemd-run mit --user und --collect', () => {
  const cmd = buildStartCommand(base, MODEL, defaults, '/opt/llama/bin/llama-server')
  assert.equal(cmd[0], 'systemd-run')
  assert.ok(cmd.includes('--user'))
  assert.ok(cmd.includes('--collect'))
  assert.ok(cmd.includes('--unit=llama-gptoss-context.service'))
  const sep = cmd.indexOf('--')
  assert.equal(cmd[sep + 1], '/opt/llama/bin/llama-server')
})

// ── T002550: eingebaute llama-Tools ──────────────────────────────────────────
//
// edit_file, write_file, exec_shell_command & Co. sind KEINE MCP-Tools, sondern
// in llama-server eingebaut und nur ueber --tools erreichbar. Ohne das Flag hat
// das Modell trotz acht MCP-Servern keine Moeglichkeit, Dateien zu bearbeiten.
//
// buildServerArgv reicht den Wert nur durch — welche Namen gueltig sind,
// entscheidet der Validator in loadouts.mjs (TOOL_NAMES, kein 'all'). Deshalb
// steht hier bewusst eine echte Namensliste und nicht das Sammelwort: der Test
// soll kein Beispiel vorleben, das die Registry gar nicht mehr annimmt.

test('tools-Feld erzeugt --tools in der argv', () => {
  const tools = 'read_file,grep_search,edit_file'
  const argv = buildServerArgv({ ...base, tools }, MODEL, defaults)
  const i = argv.indexOf('--tools')
  assert.ok(i >= 0, '--tools fehlt in der argv')
  assert.equal(argv[i + 1], tools)
})

test('ohne tools-Feld bleibt die argv unveraendert', () => {
  // Positiv-Anker zuerst: der Aufbau funktioniert ueberhaupt.
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.ok(argv.includes('--port'), 'Grundgeruest der argv fehlt')
  assert.equal(argv.includes('--tools'), false,
    'Loadouts ohne tools-Feld duerfen kein --tools tragen')
})
