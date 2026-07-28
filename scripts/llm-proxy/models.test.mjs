// scripts/llm-proxy/models.test.mjs
// Der GGUF-Parser wird gegen synthetisch erzeugte Header-Bytes geprueft --
// kein 12-GB-Modell noetig, laeuft in CI.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readGgufMetadata, quantFromFilename, scanModels, expandRoot } from './models.mjs'

// Baut einen minimalen GGUF-Header mit zwei KV-Paaren.
function buildGguf({ arch = 'llama', blockCount = 24 } = {}) {
  const parts = []
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
  const str = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s, 'utf8')])
  parts.push(Buffer.from('GGUF', 'ascii'), u32(3), u64(0), u64(2))
  parts.push(str('general.architecture'), u32(8), str(arch))          // 8 = STRING
  parts.push(str(`${arch}.block_count`), u32(4), u32(blockCount))     // 4 = U32
  return Buffer.concat(parts)
}

test('readGgufMetadata liest architecture und block_count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gguf-'))
  const p = join(dir, 'model-Q8_0.gguf')
  writeFileSync(p, buildGguf({ arch: 'gptoss', blockCount: 24 }))
  const meta = readGgufMetadata(p)
  assert.equal(meta.architecture, 'gptoss')
  assert.equal(meta.blockCount, 24)
})

test('readGgufMetadata: Nicht-GGUF-Datei liefert null-Felder statt zu werfen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gguf-'))
  const p = join(dir, 'notamodel.gguf')
  writeFileSync(p, Buffer.from('HELLO WORLD', 'ascii'))
  const meta = readGgufMetadata(p)
  assert.equal(meta.architecture, null)
  assert.equal(meta.blockCount, null)
})

test('readGgufMetadata: abgeschnittene Datei liefert null-Felder statt zu werfen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gguf-'))
  const p = join(dir, 'truncated.gguf')
  writeFileSync(p, buildGguf().subarray(0, 20))
  const meta = readGgufMetadata(p)
  assert.equal(meta.blockCount, null)
})

test('quantFromFilename erkennt K-Quants und I-Quants', () => {
  assert.equal(quantFromFilename('gpt-oss-20b-Q8_0.gguf'), 'Q8_0')
  assert.equal(quantFromFilename('Devstral-Small-2-24B-Instruct-2512-IQ4_XS.gguf'), 'IQ4_XS')
  assert.equal(quantFromFilename('Qwopus3.5-9B-Coder-MTP-Q6_K.gguf'), 'Q6_K')
  assert.equal(quantFromFilename('model-UD-Q4_K_XL.gguf'), 'UD-Q4_K_XL')
  assert.equal(quantFromFilename('mmproj-F32.gguf'), 'F32')
  assert.equal(quantFromFilename('random.gguf'), null)
})

test('expandRoot loest fuehrendes ~ auf', () => {
  assert.equal(expandRoot('~/models').startsWith('~'), false)
  assert.equal(expandRoot('/abs/path'), '/abs/path')
})

test('scanModels findet gguf rekursiv und ueberspringt .cache', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roots-'))
  mkdirSync(join(dir, 'sub'), { recursive: true })
  mkdirSync(join(dir, '.cache', 'huggingface'), { recursive: true })
  writeFileSync(join(dir, 'sub', 'a-Q8_0.gguf'), buildGguf({ blockCount: 12 }))
  writeFileSync(join(dir, '.cache', 'huggingface', 'b-Q4_K_M.gguf'), buildGguf())
  writeFileSync(join(dir, 'notes.txt'), 'ignore me')

  const found = scanModels([dir])
  assert.equal(found.length, 1)
  assert.equal(found[0].relPath, 'sub/a-Q8_0.gguf')
  assert.equal(found[0].quant, 'Q8_0')
  assert.equal(found[0].blockCount, 12)
  assert.ok(found[0].sizeBytes > 0)
})

test('scanModels ignoriert nicht existierende Wurzeln, statt zu werfen', () => {
  assert.deepEqual(scanModels(['/definitely/not/here']), [])
})
