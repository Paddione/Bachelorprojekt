// scripts/llm-proxy/models.mjs
// Einziger Ort, der das GGUF-Format kennt. Liest nur den Header (die Metadaten
// stehen ganz vorne) -- funktioniert deshalb auch auf einer noch unvollstaendig
// heruntergeladenen Datei und laedt nie 12 GB in den Speicher.
import { openSync, readSync, closeSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';

// GGUF-Werttypen laut Spezifikation.
const T_STRING = 8;
const T_ARRAY = 9;
const FIXED = {
  0: ['readUInt8', 1], 1: ['readInt8', 1], 2: ['readUInt16LE', 2], 3: ['readInt16LE', 2],
  4: ['readUInt32LE', 4], 5: ['readInt32LE', 4], 6: ['readFloatLE', 4], 7: ['readUInt8', 1],
  10: ['readBigUInt64LE', 8], 11: ['readBigInt64LE', 8], 12: ['readDoubleLE', 8],
};

class HeaderReader {
  constructor(fd) { this.fd = fd; this.pos = 0; }
  read(n) {
    const buf = Buffer.alloc(n);
    const got = readSync(this.fd, buf, 0, n, this.pos);
    if (got < n) throw new Error('EOF');
    this.pos += n;
    return buf;
  }
  u32() { return this.read(4).readUInt32LE(0); }
  u64() { return Number(this.read(8).readBigUInt64LE(0)); }
  str() { return this.read(this.u64()).toString('utf8'); }
  value(type) {
    if (type === T_STRING) return this.str();
    if (type === T_ARRAY) {
      const elemType = this.u32();
      const count = this.u64();
      const out = [];
      for (let i = 0; i < count; i++) out.push(this.value(elemType));
      return out;
    }
    const spec = FIXED[type];
    if (!spec) throw new Error(`unbekannter GGUF-Typ ${type}`);
    const [method, size] = spec;
    return Number(this.read(size)[method](0));
  }
}

/** Liest Architektur und Layer-Zahl. Wirft NICHT — unlesbare Dateien liefern
 *  null-Felder, damit ein einzelnes kaputtes File den Scan nicht abbricht. */
export function readGgufMetadata(path) {
  let fd;
  const out = { architecture: null, blockCount: null };
  try {
    fd = openSync(path, 'r');
    const r = new HeaderReader(fd);
    if (r.read(4).toString('ascii') !== 'GGUF') return out;
    r.u32();            // version
    r.u64();            // tensor_count
    const kvCount = r.u64();
    for (let i = 0; i < kvCount; i++) {
      const key = r.str();
      const val = r.value(r.u32());
      if (key === 'general.architecture') out.architecture = String(val);
      else if (key.endsWith('.block_count')) out.blockCount = Number(val);
      if (out.architecture !== null && out.blockCount !== null) break;
    }
  } catch {
    // absichtlich still: abgeschnitten, kein GGUF, keine Rechte
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return out;
}

// Quant steht verlaesslich im Dateinamen; die Tensor-Typen dafuer zu lesen waere
// deutlich teurer und beantwortet dieselbe Frage.
const QUANT_RE = /(?:^|[-_.])((?:UD-)?(?:IQ|Q)\d+(?:_[A-Z0-9]+)*|BF16|F16|F32|MXFP4)(?=\.gguf$|[-_.])/i;

export function quantFromFilename(name) {
  const m = name.match(QUANT_RE);
  return m ? m[1] : null;
}

export function expandRoot(root) {
  return root.startsWith('~') ? join(homedir(), root.slice(1)) : root;
}

// Loest loadout.model gegen doc.modelRoots auf. Gibt den ersten Treffer als
// absoluten Pfad zurueck, sonst null.
//
// statSync, NICHT readFileSync (T002536): readFileSync kennt keine Option
// 'length' — die gehoert zu fs.read. Der fruehere Aufruf in server.mjs,
//   readFileSync(candidate, { flag: 'r', encoding: null, length: 0 })
// las deshalb die KOMPLETTE Datei in den Speicher, statt nur die Existenz zu
// pruefen. Node wirft ab 2 GiB ERR_FS_FILE_TOO_LARGE; das leere catch
// verschluckte den Fehler und der Start meldete 'model_missing' — also fuer
// praktisch jedes Chat-Modell. Kleinere Dateien gingen durch, wurden aber
// vollstaendig in den RAM gelesen.
//
// Steht hier statt in server.mjs, weil ein Import von server.mjs den
// HTTP-Server startet und den Proxy-Port bindet; die Funktion war dort nicht
// ohne Nebenwirkungen pruefbar.
export function resolveModelPath(doc, loadout) {
  for (const root of doc.modelRoots) {
    const candidate = join(expandRoot(root), loadout.model);
    try { if (statSync(candidate).isFile()) return candidate; }
    catch { /* naechste Wurzel */ }
  }
  return null;
}

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    // .cache enthaelt die Zwischenablage von `hf download` -- teils unvollstaendige
    // Kopien derselben Modelle. Sie hier auszublenden verhindert Doppelanzeigen.
    if (e.isDirectory()) {
      if (e.name === '.cache' || e.name === 'node_modules') continue;
      walk(join(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith('.gguf')) {
      out.push(join(dir, e.name));
    }
  }
}

export function scanModels(roots, readMeta = readGgufMetadata) {
  const results = [];
  for (const root of roots) {
    const abs = expandRoot(root);
    if (!existsSync(abs)) continue;
    const files = [];
    walk(abs, files);
    for (const absPath of files) {
      const meta = readMeta(absPath);
      results.push({
        root,
        absPath,
        relPath: relative(abs, absPath).split('\\').join('/'),
        sizeBytes: statSync(absPath).size,
        quant: quantFromFilename(absPath.split('/').pop()),
        architecture: meta.architecture,
        blockCount: meta.blockCount,
      });
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
