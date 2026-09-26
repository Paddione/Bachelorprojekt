// scs-chunking.ts — Chunking-Logik des Semantic-Code-Search-Indexers.
//
// T002315: aus scripts/index-repo.ts extrahiert. Der Indexer lag bei 487 von
// 600 zulaessigen Zeilen (81 % der S1-Schwelle); die Chunking-Logik ist der
// Teil mit der klarsten Grenze — pure Funktionen ueber Strings, ohne DB-,
// Netz- oder Dateisystem-Zugriff, und damit ohne Testaufbau pruefbar.
//
// Die Grenzwerte stammen aus T002266: gemessen am laufenden bge-m3-Server
// tokenisieren Code und YAML bei ~2.6 Zeichen/Token, deutlich dichter als die
// 4 Zeichen/Token, mit denen frueher gerechnet wurde.

import { extname } from 'node:path';

export const CHUNK_MAX_TOKENS = 512;
export const CHUNK_OVERLAP = 64;

// T002266: estimateTokens rechnete mit 4 Zeichen/Token. Das gilt fuer Prosa —
// Code und YAML tokenisieren dichter. Gemessen am laufenden bge-m3-Server:
// 2000 Zeichen Code = 774 echte Tokens, 4000 Zeichen YAML = 1253. Das sind
// ~2.6 Zeichen/Token, die Schaetzung war also rund 1.5x zu optimistisch und
// die nominell "512-Token"-Chunks enthielten real bis zu ~774 Tokens.
export const CHARS_PER_TOKEN = 2.6;

// Harter Backstop in ZEICHEN, unabhaengig von jeder Schaetzung. Er greift genau
// dort, wo die zeilenweise Token-Logik strukturell nicht greifen kann:
//   - eine einzelne ueberlange Zeile (minifiziert, Base64, eingebettetes JSON)
//     wurde nie gesplittet, weil nur ZWISCHEN Zeilen umgebrochen wurde;
//   - chunkYaml kannte ueberhaupt keine Obergrenze und splittete nur an
//     Top-Level-Keys. Gemessen 2026-07-27 ueber das ganze Repo: 298 von 3385
//     YAML-Chunks lagen ueber 512 Tokens, 31 sogar ueber 8192 (dem
//     max_position_embeddings des Modells), der groesste bei 318.500 Tokens
//     (k3d/monitoring/kube-prometheus-stack-rendered.yaml). Solche Chunks
//     werden vom Embedding-Server mit HTTP 500 abgelehnt und landen still im
//     catch von main() als SKIP.
export const CHUNK_MAX_CHARS = Math.floor(CHUNK_MAX_TOKENS * CHARS_PER_TOKEN);

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkCode(content: string, filePath: string): string[] {
  const ext = extname(filePath);
  if (ext === '.yaml' || ext === '.yml') return chunkYaml(content);
  return chunkSource(content);
}

// Zerlegt eine einzelne Zeile, die allein schon zu gross ist. Ohne das bleibt
// jede Token-Rechnung wirkungslos, denn umgebrochen wurde nur ZWISCHEN Zeilen.
export function splitOversizedLine(line: string, maxChars: number = CHUNK_MAX_CHARS): string[] {
  if (line.length <= maxChars) return [line];
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += maxChars) {
    parts.push(line.slice(i, i + maxChars));
  }
  return parts;
}

// Gemeinsamer Kern beider Chunker: akkumuliert zeilenweise und deckelt sowohl
// die geschaetzten Tokens ALS AUCH die Zeichen. Der Zeichendeckel ist die
// Garantie — er haengt an keiner Schaetzung.
export function boundedChunks(
  text: string,
  opts?: { targetTokens?: number; overlapTokens?: number }
): string[] {
  const maxTokens = opts?.targetTokens ?? CHUNK_MAX_TOKENS;
  const overlap = opts?.overlapTokens ?? CHUNK_OVERLAP;
  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let currentChars = 0;

  for (const rawLine of text.split('\n')) {
    for (const line of splitOversizedLine(rawLine, maxChars)) {
      const lineTokens = estimateTokens(line);
      const lineChars = line.length + 1; // +1 fuer das \n beim Join
      const wouldExceed =
        currentTokens + lineTokens > maxTokens ||
        currentChars + lineChars > maxChars;

      if (wouldExceed && current.length > 0) {
        chunks.push(current.join('\n'));
        // Overlap uebernehmen (Kontext ueber die Chunk-Grenze hinweg).
        // Durch CHUNK_OVERLAP << CHUNK_MAX_TOKENS bleibt der Overlap immer
        // deutlich unter dem Deckel, ein Endlos-Flush ist damit ausgeschlossen.
        const overlapLines: string[] = [];
        let overlapTokens = 0;
        for (let i = current.length - 1; i >= 0; i--) {
          const t = estimateTokens(current[i]);
          if (overlapTokens + t > overlap) break;
          overlapLines.unshift(current[i]);
          overlapTokens += t;
        }
        current = overlapLines;
        currentTokens = overlapTokens;
        currentChars = overlapLines.reduce((acc, l) => acc + l.length + 1, 0);
      }

      current.push(line);
      currentTokens += lineTokens;
      currentChars += lineChars;
    }
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks.filter(c => c.trim().length > 20);
}

// YAML behaelt die semantische Gruppierung an Top-Level-Keys, jeder Block wird
// danach aber zwingend auf die Obergrenze gebracht. Vorher fehlte dieser zweite
// Schritt vollstaendig — ein Manifest mit einem Top-Level-Key wurde zu EINEM
// Chunk in Dateigroesse.
export function chunkYaml(content: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of content.split('\n')) {
    if (/^[^\s#]/.test(line) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks.flatMap(b => boundedChunks(b));
}

export function chunkSource(content: string): string[] {
  return boundedChunks(content);
}

export interface MarkdownChunk {
  text: string;
  title: string;
  charOffset: number;
}

export function chunkMarkdown(
  content: string,
  opts?: { targetTokens?: number; overlapTokens?: number }
): MarkdownChunk[] {
  const lines = content.split('\n');
  const sections: { text: string; offset: number }[] = [];
  let buf = '';
  let bufOffset = 0;
  let runningOffset = 0;

  for (const line of lines) {
    const isHeading = /^#{1,3}\s/.test(line);
    if (isHeading && buf.length > 0) {
      sections.push({ text: buf, offset: bufOffset });
      buf = '';
      bufOffset = runningOffset;
    }
    if (buf.length === 0) bufOffset = runningOffset;
    buf += line + '\n';
    runningOffset += line.length + 1;
  }
  if (buf.length > 0) sections.push({ text: buf, offset: bufOffset });

  const out: MarkdownChunk[] = [];
  for (const sec of sections) {
    const headingLine = sec.text.split('\n').find(l => /^#{1,6}\s/.test(l));
    const title = headingLine ? headingLine.replace(/^#{1,6}\s+/, '').trim() : '';
    let pieces = boundedChunks(sec.text, opts);
    if (pieces.length === 0 && sec.text.trim().length > 0) {
      pieces = [sec.text.trim()];
    }
    for (const piece of pieces) {
      out.push({ text: piece, title, charOffset: sec.offset });
    }
  }
  return out;
}
