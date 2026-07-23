#!/usr/bin/env node
/**
 * measure-embedding-equivalence.mjs
 *
 * Misst die Äquivalenz zwischen dem alten TEI-Embedding-Endpunkt und dem
 * neuen llama.cpp-Embedding-Endpunkt. Sendet 20+ Testtexte (gemischt
 * deutsch/englisch, kurz/lang) durch beide Endpunkte und berechnet die
 * paarweise Kosinus-Ähnlichkeit.
 *
 * Exit-Code 0:  Mittelwert >= 0.99 (Äquivalenz bestanden)
 * Exit-Code 1:  Mittelwert < 0.99 (Cutover blockiert)
 *
 * Endpunkt-URLs via Umgebungsvariablen überschreibbar:
 *   OLD_EMBED_URL  (Default: http://127.0.0.1:9081/embed)  — TEI-Dialekt
 *   NEW_EMBED_URL  (Default: http://127.0.0.1:8095/v1/embeddings) — llama.cpp
 */

const OLD_URL = process.env.OLD_EMBED_URL || 'http://127.0.0.1:9081/embed';
const NEW_URL = process.env.NEW_EMBED_URL || 'http://127.0.0.1:8095/v1/embeddings';

const testTexts = [
  // English, short
  'Hallo Welt',
  'What is the capital of France?',
  'Machine learning is fascinating.',
  'The quick brown fox jumps over the lazy dog.',
  'Natural language processing with transformers.',
  // English, long
  'This is a longer passage about artificial intelligence and its impact on modern society. ' +
    'From deep learning to reinforcement learning, the field has evolved rapidly over the past decade. ' +
    'Large language models have demonstrated remarkable capabilities in understanding and generating text.',
  'The process of training neural networks involves forward propagation, loss computation, ' +
    'backpropagation, and parameter updates. Each step requires careful tuning of hyperparameters ' +
    'such as learning rate, batch size, and optimizer choice.',
  // German, short
  'Berlin ist eine tolle Stadt.',
  'Das Wetter ist heute sehr schön.',
  'Können Sie mir bitte helfen?',
  'Die Katze sitzt auf der Matte.',
  'Ich habe einen Termin um 15 Uhr.',
  // German, long
  'Die Entwicklung der künstlichen Intelligenz hat in den letzten Jahren enorme Fortschritte gemacht. ' +
    'Besonders im Bereich der natürlichen Sprachverarbeitung haben große Sprachmodelle beeindruckende ' +
    'Fähigkeiten entwickelt. Sie können Texte zusammenfassen, übersetzen und sogar programmieren.',
  'In diesem Dokument werden die Anforderungen an das neue Softwaresystem beschrieben. ' +
    'Das System soll eine Vielzahl von Funktionen unterstützen, darunter Benutzerverwaltung, ' +
    'Authentifizierung und Datenanalyse. Die Implementierung erfolgt in mehreren Phasen.',
  // Mixed, technical
  'POST /v1/embeddings with model=bge-m3 returns 1024-dimensional vectors.',
  'The --pooling cls parameter selects the CLS token embedding from the last hidden state.',
  'Cosine similarity between two vectors a and b is defined as (a·b) / (||a|| * ||b||).',
  'HuggingFace TEI server supports both /embed and /rerank endpoints for CPU inference.',
  'llama.cpp baut auf gguf-Quantisierung auf und ermöglicht GPU-Offload über -ngl.',
  // Edge cases: numbers, special chars
  'Test 123! @#$% ^&*()',
  'a'.repeat(1000),  // single char repeated
  'Short.',
];

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function fetchOldEmbedding(text) {
  const res = await fetch(OLD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: [text] }),
  });
  if (!res.ok) {
    throw new Error(`Old endpoint returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  // TEI returns [[...embedding]] - array of arrays
  return data[0];
}

async function fetchNewEmbedding(text) {
  const res = await fetch(NEW_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'bge-m3', input: [text] }),
  });
  if (!res.ok) {
    throw new Error(`New endpoint returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  // llama.cpp returns {data: [{embedding: [...]}]}
  return data.data[0].embedding;
}

async function main() {
  console.log(`\n  Old endpoint (TEI): ${OLD_URL}`);
  console.log(`  New endpoint (llama.cpp): ${NEW_URL}`);
  console.log(`  Test texts: ${testTexts.length}`);
  console.log('');

  const similarities = [];
  let errors = 0;

  for (let i = 0; i < testTexts.length; i++) {
    const text = testTexts[i];
    const preview = text.length > 60 ? text.substring(0, 57) + '...' : text;

    try {
      const [oldEmb, newEmb] = await Promise.all([
        fetchOldEmbedding(text),
        fetchNewEmbedding(text),
      ]);

      const sim = cosineSimilarity(oldEmb, newEmb);
      similarities.push(sim);

      const marker = sim >= 0.99 ? '✓' : sim >= 0.95 ? '⚠' : '✗';
      console.log(`  [${String(i + 1).padStart(2)}] ${marker}  sim=${sim.toFixed(6)}  "${preview}"`);
    } catch (err) {
      errors++;
      console.log(`  [${String(i + 1).padStart(2)}] ✗  ERROR: ${err.message}  "${preview}"`);
    }
  }

  console.log('');

  if (errors > 0) {
    console.log(`  ❌ ${errors}/${testTexts.length} texts failed (endpoint unreachable or error).`);
    console.log(`     Ensure both endpoints are running.`);
    process.exit(1);
  }

  if (similarities.length === 0) {
    console.log('  ❌ No similarities computed.');
    process.exit(1);
  }

  const sum = similarities.reduce((a, b) => a + b, 0);
  const mean = sum / similarities.length;
  const min = Math.min(...similarities);
  const belowThreshold = similarities.filter(s => s < 0.99).length;

  console.log(`  ═══════════════════════════════════════`);
  console.log(`  Mean cosine similarity:  ${mean.toFixed(6)}`);
  console.log(`  Minimum cosine similarity: ${min.toFixed(6)}`);
  console.log(`  Pairs below 0.99:        ${belowThreshold}/${similarities.length}`);
  console.log(`  ═══════════════════════════════════════`);
  console.log('');

  if (mean >= 0.99) {
    console.log('  ✅ GATE PASSED: Mean similarity >= 0.99. Cutover to llama.cpp is safe.');
    process.exit(0);
  } else {
    console.log('  ❌ GATE BLOCKED: Mean similarity < 0.99.');
    console.log('     Do NOT cut over. Keep TEI running.');
    console.log('     File a follow-up ticket for pgvector reindex investigation.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
