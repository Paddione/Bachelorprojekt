import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// .js-Endung fuer eine .ts-Datei — ESM-Konvention, wie in
// scripts/openspec-validate.test.ts. Ein '.ts'-Import braucht
// allowImportingTsExtensions, das hier nicht gesetzt ist.
import { chunkCode, chunkSource, chunkYaml, estimateTokens } from './index-repo.js';

// T002266 — Regressionsschutz gegen uebergrosse Chunks.
//
// Vorgeschichte: chunkYaml() splittete YAML ausschliesslich an Top-Level-Keys
// und kannte KEINE Obergrenze; chunkSource() brach nur ZWISCHEN Zeilen um, eine
// einzelne ueberlange Zeile wurde also nie geteilt. Gemessen 2026-07-27 ueber
// das ganze Repo: 298 von 3385 YAML-Chunks lagen ueber 512 Tokens, 31 sogar
// ueber 8192 (max_position_embeddings von bge-m3), der groesste bei 318.500
// Tokens. Der Embedding-Server lehnt solche Chunks mit HTTP 500 ab; sie landen
// still im catch von main() und werden als SKIP verbucht — ein Voll-Index
// bekommt dadurch systematische Loecher, ohne hart zu scheitern.
//
// Die Grenze hier ist bewusst das MODELL-Maximum (8192) und nicht der
// Konfigurationswert: sie muss auch dann halten, wenn jemand CHUNK_MAX_TOKENS
// hochdreht.
const MODEL_MAX_TOKENS = 8192;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

function assertAllBounded(chunks: string[], label: string) {
  expect(chunks.length).toBeGreaterThan(0);
  for (const [i, c] of chunks.entries()) {
    expect(
      estimateTokens(c),
      `${label}: Chunk ${i} hat ${estimateTokens(c)} geschaetzte Tokens ` +
      `(${c.length} Zeichen) und ueberschreitet damit das Modell-Maximum`,
    ).toBeLessThanOrEqual(MODEL_MAX_TOKENS);
  }
}

describe('estimateTokens', () => {
  it('rechnet dichter als 4 Zeichen/Token (Code tokenisiert bei ~2.6)', () => {
    // 2000 Zeichen Code ergaben am laufenden Server real 774 Tokens.
    // Mit der alten chars/4-Annahme waeren es 500 gewesen — zu optimistisch.
    const est = estimateTokens('x'.repeat(2000));
    expect(est).toBeGreaterThanOrEqual(700);
  });
});

describe('chunkYaml (T002266)', () => {
  it('begrenzt einen einzelnen riesigen Top-Level-Block', () => {
    // Genau der Fall aus den Helm-Renders: EIN Top-Level-Key, darunter alles.
    const yaml = 'data:\n' + '  key: value with some padding text\n'.repeat(20_000);
    const chunks = chunkYaml(yaml);
    assertAllBounded(chunks, 'ein Top-Level-Key');
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('begrenzt auch eine einzelne ueberlange Zeile', () => {
    // Base64-Blobs und eingebettete JSON-Strings in Manifests sehen so aus.
    const yaml = 'secret:\n  data: ' + 'A'.repeat(400_000) + '\n';
    assertAllBounded(chunkYaml(yaml), 'eine Riesenzeile');
  });

  it('behaelt die Gruppierung an Top-Level-Keys fuer kleine Manifeste', () => {
    const yaml = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: demo-configmap-with-enough-text-to-pass-the-filter',
      'data:',
      '  answer: forty-two and some more padding so the chunk survives',
    ].join('\n');
    const chunks = chunkYaml(yaml);
    assertAllBounded(chunks, 'kleines Manifest');
    // Kleine Dateien sollen nicht kuenstlich zerhackt werden.
    expect(chunks.length).toBeLessThanOrEqual(4);
  });
});

describe('chunkSource (T002266)', () => {
  it('begrenzt eine einzelne ueberlange Zeile (minified / Base64)', () => {
    const src = 'const x = "' + 'y'.repeat(300_000) + '";\n';
    assertAllBounded(chunkSource(src), 'minifizierte Zeile');
  });

  it('bricht normalen Code in mehrere Chunks um', () => {
    const src = 'export function f() { return 1; }\n'.repeat(5000);
    const chunks = chunkSource(src);
    assertAllBounded(chunks, 'normaler Code');
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('chunkCode gegen echte Repo-Dateien (T002266)', () => {
  // Die Dateien, die den Bug in der Praxis ausgeloest haben bzw. am
  // anfaelligsten sind. Fehlt eine, wird der Fall uebersprungen statt zu
  // scheitern — der Test soll nicht an Repo-Umbauten zerbrechen.
  const candidates = [
    'Taskfile.yml',
    'k3d/llm-gpu.yaml',
    '.github/workflows/ci.yml',
    'scripts/index-repo.ts',
  ];

  for (const rel of candidates) {
    it(`haelt die Grenze fuer ${rel}`, () => {
      const abs = resolve(REPO_ROOT, rel);
      if (!existsSync(abs)) return;
      const content = readFileSync(abs, 'utf8');
      assertAllBounded(chunkCode(content, abs), rel);
    });
  }
});
