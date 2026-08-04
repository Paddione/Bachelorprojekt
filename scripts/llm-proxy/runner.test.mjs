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

// ── T002549: uiConfigFile muss vor dem Start auch ERZEUGT werden ─────────────
//
// T002544 lieferte das Flag (buildServerArgv) und den Generator, aber keinen
// Aufruf: --ui-config-file zeigte auf eine Datei, die niemand schrieb. Geprueft
// wird hier das Resultat auf der Platte, nicht ob irgendwo ein Funktionsname
// im Quelltext steht (T002448-M4).

test('ensureUiConfigRendered schreibt die Seed-Datei fuer ein Loadout mit uiConfigFile', async () => {
  const { ensureUiConfigRendered } = await import('./runner.mjs')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uicfg-'))
  const out = path.join(tmp, 'nested', 'ui-config.json')
  const prev = process.env.BGE_MCP_TOKEN
  process.env.BGE_MCP_TOKEN = 'test-token'

  try {
    ensureUiConfigRendered({ slug: 'gemma26-factory', uiConfigFile: out })

    assert.ok(fs.existsSync(out), 'Seed-Datei wurde nicht geschrieben')
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'))
    assert.equal(typeof doc.mcpServers, 'string',
      'mcpServers muss ein String sein — ein blankes Array verwirft die WebUI still')
    const arr = JSON.parse(doc.mcpServers)
    assert.ok(Array.isArray(arr) && arr.length > 0)
  } finally {
    if (prev === undefined) delete process.env.BGE_MCP_TOKEN
    else process.env.BGE_MCP_TOKEN = prev
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('ensureUiConfigRendered ist ein No-op ohne uiConfigFile', async () => {
  const { ensureUiConfigRendered } = await import('./runner.mjs')
  // Darf nicht werfen und nichts schreiben — Loadouts ohne das Feld bleiben
  // unveraendert, ihre argv traegt kein --ui-config-file.
  assert.doesNotThrow(() => ensureUiConfigRendered({ slug: 'bge-embed' }))
  assert.doesNotThrow(() => ensureUiConfigRendered({ slug: 'x', uiConfigFile: null }))
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

// ── T002555: systemd-Hardening der llama-Unit ────────────────────────────────
//
// Die eingebauten llama-Tools laufen im llama-server-Prozess, nicht im
// Factory-Sandbox-Container. Ohne Hardening haette das Modell die vollen Rechte
// des Benutzers. Geprueft wird die erzeugte argv — die Wirkung der Properties
// selbst ist gegen eine Wegwerf-Unit verifiziert (siehe Ticket T002555).

test('Hardening-Properties stehen VOR dem --Trenner', () => {
  const cmd = buildStartCommand(base, MODEL, defaults, '/opt/llama/bin/llama-server')
  const sep = cmd.indexOf('--')
  const protectHome = cmd.indexOf('--property=ProtectHome=tmpfs')
  assert.ok(protectHome >= 0, 'ProtectHome fehlt')
  // Nach dem Trenner gaebe systemd-run sie an das Binary weiter, das sie nicht
  // kennt und mit unbekannter Option abbricht.
  assert.ok(protectHome < sep, 'ProtectHome steht hinter dem --Trenner')
})

test('ProtectHome=tmpfs, PrivateTmp und NoNewPrivileges sind gesetzt', () => {
  const cmd = buildStartCommand(base, MODEL, defaults, '/opt/llama/bin/llama-server')
  for (const p of ['ProtectHome=tmpfs', 'PrivateTmp=yes', 'NoNewPrivileges=yes']) {
    assert.ok(cmd.includes(`--property=${p}`), `${p} fehlt`)
  }
})

test('Installations- und Modellverzeichnis werden read-only zurueckgebunden', () => {
  const cmd = buildStartCommand(base, MODEL, defaults, '/opt/llama/bin/llama-server')
  // Die Wurzel, nicht bin/ — lib/ liegt daneben (siehe eigener Test unten).
  assert.ok(cmd.includes('--property=BindReadOnlyPaths=-/opt/llama'), 'Installationswurzel fehlt')
  const modelDir = MODEL.slice(0, MODEL.lastIndexOf('/'))
  assert.ok(cmd.includes(`--property=BindReadOnlyPaths=-${modelDir}`), 'Modell-Dir fehlt')
})

test('jedes Bind-Property traegt das optionale -Praefix', () => {
  // Positiv-Anker zuerst: es gibt ueberhaupt Bind-Properties.
  const cmd = buildStartCommand(base, MODEL, defaults, '/opt/llama/bin/llama-server')
  const binds = cmd.filter((a) => /^--property=(BindPaths|BindReadOnlyPaths|InaccessiblePaths)=/.test(a))
  assert.ok(binds.length >= 3, `zu wenige Bind-Properties: ${binds.length}`)
  // Ohne '-' scheitert die Unit mit 226/NAMESPACE, sobald ein Pfad auf der
  // Maschine fehlt — und zwar bevor das Modell startet.
  for (const b of binds) {
    assert.match(b, /=-\//, `Bind ohne optionales -Praefix: ${b}`)
  }
})

test('uiConfigFile-Verzeichnis wird gebunden, fehlt es, entsteht kein Binding', () => {
  const withUi = buildStartCommand(
    { ...base, uiConfigFile: '/home/u/.config/llama-cpp/ui-config.json' },
    MODEL, defaults, '/opt/llama/bin/llama-server')
  assert.ok(withUi.includes('--property=BindReadOnlyPaths=-/home/u/.config/llama-cpp'),
    'ui-config-Dir fehlt')

  const without = buildStartCommand(base, MODEL, defaults, '/opt/llama/bin/llama-server')
  assert.equal(without.some((a) => a.includes('llama-cpp')), false,
    'Loadout ohne uiConfigFile darf kein solches Binding tragen')
})

test('das Repo ist schreibbar gebunden, .secrets ausgespart', async () => {
  const { buildHardeningProperties } = await import('./runner.mjs')
  const props = buildHardeningProperties(base, MODEL, '/opt/llama/bin/llama-server', '/repo')
  assert.ok(props.includes('--property=BindPaths=-/repo'),
    'Repo nicht schreibbar gebunden — write_file/edit_file waeren wirkungslos')
  assert.ok(props.includes('--property=InaccessiblePaths=-/repo/environments/.secrets'),
    'environments/.secrets nicht ausgespart')
})

test('Installationswurzel statt bin/ — sonst fehlt libllama-server-impl.so', async () => {
  const { buildHardeningProperties } = await import('./runner.mjs')
  const props = buildHardeningProperties({ slug: 'x' }, MODEL, '/opt/llama/bin/llama-server', '/repo')
  assert.ok(props.includes('--property=BindReadOnlyPaths=-/opt/llama'),
    'Installationswurzel fehlt — lib/ liegt NEBEN bin/, der Start scheitert mit 127')
  assert.equal(props.includes('--property=BindReadOnlyPaths=-/opt/llama/bin'), false,
    'nur bin/ zu binden reicht nicht und soll nicht passieren')
})

test('ist die Installationswurzel ein Symlink, werden BEIDE Pfade gebunden', async () => {
  const { buildHardeningProperties } = await import('./runner.mjs')
  const fs = await import('node:fs'); const os = await import('node:os'); const p = await import('node:path')

  const tmp = fs.mkdtempSync(p.join(os.tmpdir(), 'hard-'))
  const real = p.join(tmp, 'llama-b1'); const link = p.join(tmp, 'llama-current')
  fs.mkdirSync(p.join(real, 'bin'), { recursive: true })
  fs.symlinkSync(real, link)
  try {
    const props = buildHardeningProperties({ slug: 'x' }, MODEL, p.join(link, 'bin', 'llama-server'), '/repo')
    // Nur das Ziel zu binden laesst den ExecStart-Pfad (den Symlink) im tmpfs
    // verschwinden — die Unit stirbt dann mit 203/EXEC ohne eine Logzeile.
    assert.ok(props.includes(`--property=BindReadOnlyPaths=-${link}`), 'Symlink-Pfad fehlt')
    assert.ok(props.includes(`--property=BindReadOnlyPaths=-${real}`), 'aufgeloester Pfad fehlt')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('ohne Symlink entsteht kein doppeltes Binding', async () => {
  const { buildHardeningProperties } = await import('./runner.mjs')
  const props = buildHardeningProperties({ slug: 'x' }, MODEL, '/opt/llama/bin/llama-server', '/repo')
  const roots = props.filter((a) => a.startsWith('--property=BindReadOnlyPaths=-/opt/llama'))
  assert.equal(roots.length, 1, `erwartet 1 Binding fuer die Wurzel, erhalten ${roots.length}`)
})

// --- T002579: Sampling + Chat-Template-Argumente ---------------------------

test('T002579: Sampling-Felder erzeugen --temp/--top-p/--top-k', () => {
  const lo = { ...base, args: { ...base.args, temperature: 1.0, topP: 0.95, topK: 64 } }
  const argv = buildServerArgv(lo, MODEL, defaults)
  assert.equal(argv[argv.indexOf('--temp') + 1], '1')
  assert.equal(argv[argv.indexOf('--top-p') + 1], '0.95')
  assert.equal(argv[argv.indexOf('--top-k') + 1], '64')
})

test('T002579: chatTemplateKwargs wird als JSON serialisiert', () => {
  const lo = { ...base, args: { ...base.args, chatTemplateKwargs: { enable_thinking: true } } }
  const argv = buildServerArgv(lo, MODEL, defaults)
  const idx = argv.indexOf('--chat-template-kwargs')
  assert.notEqual(idx, -1, '--chat-template-kwargs fehlt')
  // Der Wert muss gueltiges JSON sein — nicht ein von Hand escapter String.
  assert.deepEqual(JSON.parse(argv[idx + 1]), { enable_thinking: true })
})

test('T002579: ein Loadout OHNE die neuen Felder behaelt seine argv unveraendert', () => {
  // Positiv-Anker gegen eine vakuose Aussage: waeren die Felder gar nicht
  // implementiert, wuerde dieser Test ebenfalls bestehen. Deshalb zuerst
  // belegen, dass die Flags bei GESETZTEN Feldern ueberhaupt entstehen.
  const withFields = buildServerArgv(
    { ...base, args: { ...base.args, temperature: 1.0, chatTemplateKwargs: { enable_thinking: false } } },
    MODEL, defaults)
  assert.ok(withFields.includes('--temp'), 'ANKER: --temp entsteht bei gesetztem Feld nicht')
  assert.ok(withFields.includes('--chat-template-kwargs'), 'ANKER: --chat-template-kwargs entsteht nicht')

  const argv = buildServerArgv(base, MODEL, defaults)
  assert.equal(argv.includes('--temp'), false)
  assert.equal(argv.includes('--top-p'), false)
  assert.equal(argv.includes('--top-k'), false)
  assert.equal(argv.includes('--chat-template-kwargs'), false)
})

// ---------------------------------------------------------------------------
// T002633 — Spekulatives Dekodieren. Geprueft wird das ERGEBNIS (argv), nicht
// die Implementierung. Der Regressionsschutz ist der erste Test: ohne
// '--spec-type' laedt llama.cpp b10225 das Draft-Modell und benutzt es nie
// (Default 'none'), belegt also VRAM ohne Wirkung.
// ---------------------------------------------------------------------------

const specBase = (speculative) => ({ ...base, speculative })

test('specType landet als --spec-type in argv', () => {
  const argv = buildServerArgv(specBase({ specType: 'ngram-cache' }), MODEL, defaults)
  const i = argv.indexOf('--spec-type')
  assert.notEqual(i, -1, '--spec-type fehlt — Draft-Modell waere wirkungslos')
  assert.equal(argv[i + 1], 'ngram-cache')
})

test('draftNMax landet als --spec-draft-n-max in argv', () => {
  const argv = buildServerArgv(specBase({ specType: 'draft-mtp', draftNMax: 4 }), MODEL, defaults)
  const i = argv.indexOf('--spec-draft-n-max')
  assert.notEqual(i, -1, '--spec-draft-n-max fehlt — Build-Default 3 statt gemessener 4')
  assert.equal(argv[i + 1], '4')
})

test('ngram-Variante kommt OHNE --spec-draft-model aus (kein VRAM fuer einen Drafter)', () => {
  const argv = buildServerArgv(specBase({ specType: 'ngram-simple' }), MODEL, defaults)
  assert.ok(argv.includes('--spec-type'), 'Positiv-Anker: --spec-type muss gesetzt sein')
  assert.equal(argv.includes('--spec-draft-model'), false)
})

test('ohne speculative-Felder erscheint kein einziges spec-Flag', () => {
  const argv = buildServerArgv(specBase({ draftHfRepo: null, draftNgl: null }), MODEL, defaults)
  assert.equal(argv.filter((x) => String(x).startsWith('--spec-')).length, 0)
})
