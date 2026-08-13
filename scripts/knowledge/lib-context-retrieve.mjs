#!/usr/bin/env node
/**
 * lib-context-retrieve.mjs — Kern der S1-Retrieval-Schicht (T002658).
 *
 * Pure Funktionen von (Aufgabentext, Rolle, Budget) auf einen budgetierten,
 * gerankten Kandidatensatz aus `knowledge.chunks`. Kein Rueck-Import auf die
 * CLI- oder API-Schicht (S2-Gate: keine neuen Import-Zyklen); Ein-/Ausgabe
 * gehoert ausschliesslich scripts/context-retrieve.mjs.
 *
 * Pipeline: Query embedden (bge-m3) -> Kandidaten per pgvector <=> ziehen
 * (LIMIT, Vorgabe 40) -> Cross-Encoder-Rerank (bge-reranker-v2-m3) ->
 * Budget-Fuellung greedy nach Score.
 *
 * Kostenlage (gemessen nach T002661): Embedding 0,25 s, Rerank ueber 40
 * Kandidaten 6,35 s — der Rerank stellt ~96 % der Dispatch-Zeit, die
 * Kandidatenzahl vor dem Rerank ist die einzige Stellschraube. Deshalb ist
 * `limit` Parameter und keine Konstante; p6 kalibriert ihn.
 *
 * MESSUNG (2026-08-14, k3d-dev-Pod bge-rerank, gleiche Manifeste wie fleet):
 * Der deployte llama.cpp-Server kennt pro Anforderung n_ctx=2048 Tokens
 * (HARTES Limit, HTTP 400 "max context size (2048 tokens)") und scheitert
 * darunter schon am 2Gi-RAM-Limit: 4500 Zeichen deutschen Texts = 1633
 * prompt_tokens liefen durch, ~5700 Zeichen (~1900 Tokens) endeten im
 * OOMKilled (exit 137). Ein einzelner echter Plan-Chunk (bis 20950 Zeichen =
 * ~7000 Tokens) ueberschreitet den Slot also fuer sich allein — auch limit=1
 * wuerde mit Volltext scheitern. Deshalb kuerzt rerank() die Kandidatentexte
 * vor dem Aufruf auf ein gemeinsames Zeichenbudget; nur das Rank-Signal wird
 * gekuerzt, fillBudget und der gelieferte Block bleiben unangetastet.
 *
 * Messbefehl (T002717, gegen k3d: kubectl port-forward svc/... 8094:8080):
 *   curl -sX POST http://127.0.0.1:8094/v1/rerank -H 'Content-Type: application/json' \
 *     -d '{"model":"bge-reranker-v2-m3","query":"ping","documents":["'$(head -c 4500 /dev/zero | tr '\0' x)'"]}' \
 *   und die Obergrenze per /slots (n_ctx) gegenpruefen.
 *
 * Drei-Faelle-Regel: Jede Funktion mit Zugriff auf ein externes System
 * unterscheidet explizit "Antwort erhalten und brauchbar", "Antwort erhalten
 * und leer" und "keine Antwort erhalten". Der leere Fall wird nie wie der
 * Fehlerfall behandelt und umgekehrt — genau diese Verwechslung macht die
 * Herkunfts-Marker der CLI sonst wertlos.
 *
 * Endpoint-Konvention (T002551, website/src/lib/bge-router.ts): die Variablen
 * werden ohne Defaults gelesen — ein fehlender Wert ist ein Konfigurationsfehler
 * und degraviert den Aufruf (der Aufrufer faellt auf mode=rulefilter zurueck).
 */

import { createHash } from 'node:crypto';
import { approxTokens, ACTIVE_STATUSES } from '../openspec-embed.mjs';

/** Modell des lokalen bge-Gateways (k3d/llm-gpu.yaml), konfigurierbar. */
const embedModel = () => process.env.LLM_EMBED_MODEL ?? 'bge-m3';

/**
 * Timeout-Bemessung (p4-Vorgabe): aus der aktuell gemessenen Latenz plus
 * Reserve, nicht aus historischen Werten. Vor T002661 lag das Embedding bei
 * 10,7 s — ein dafuer grosszuegig bemessener Timeout liesse einen echten
 * Ausfall minutenlang als Haenger erscheinen statt als Fallback. Gemessen
 * heute: Embedding 0,25 s (5 s = 20x Reserve), Rerank 6,35 s ueber 40
 * Kandidaten (30 s ~ 4,7x Reserve, GPU-Konkurrenz T002628 eingerechnet).
 */
const embedTimeoutMs = () => Number(process.env.CONTEXT_RETRIEVE_EMBED_TIMEOUT_MS ?? 5_000);
const rerankTimeoutMs = () => Number(process.env.CONTEXT_RETRIEVE_RERANK_TIMEOUT_MS ?? 30_000);

/**
 * Uebersetzt Rolle, Korpus-Whitelist und Status in SQL-Praedikate auf
 * knowledge.chunks.metadata plus einen Join auf knowledge.collections ueber
 * `source`. Rueckgabe { where, params }: `where` ist ein mit AND verketteter
 * SQL-Ausdruck, dessen Platzhalter ab $1 laufen; pullCandidates haengt Vektor
 * und Limit hinten an (dort ist die Reihenfolge dokumentiert).
 *
 * Rolle und Domäne duerfen den Query-Text nicht beruehren: als Text verwassern
 * sie das Signal, als Metadaten-Praedikat filtern sie exakt und ohne
 * GPU-Kosten (design.md "Warum der Aufgabentext die Query ist").
 *
 * Rollen-Praedikat: `metadata->>'role'` traegt der heutige specs_plans-Korpus
 * noch nicht (alle Chunks sind role-los); S2 fuehrt rollen-getaggte Chunks ein.
 * Das Praedikat ist deshalb null-inklusiv — `IS NULL OR = $role` —: Chunks
 * ohne Rollen-Metadaten passieren (der heutige Korpus bleibt nutzbar), sobald
 * Rollen-Metadaten existieren, wirkt es als harter Filter.
 */
export function buildPredicates({ role = null, corpora = null, status = null } = {}) {
  const clauses = [];
  const params = [];

  const sources = corpora ?? ['specs_plans'];
  if (sources.length > 0) {
    params.push(sources);
    clauses.push(`col.source = ANY($${params.length}::text[])`);
  }

  const statuses = status ?? ACTIVE_STATUSES;
  if (statuses.length > 0) {
    params.push(statuses);
    clauses.push(`c.metadata->>'status' = ANY($${params.length}::text[])`);
  }

  if (role) {
    params.push(role);
    clauses.push(`(c.metadata->>'role' IS NULL OR c.metadata->>'role' = $${params.length})`);
  }

  return { where: clauses.join(' AND '), params };
}

/**
 * Genau ein bge_embed-Aufruf ueber denselben Gateway-Pfad, den
 * lib-knowledge-pg.mjs (embedViaBge) nutzt: POST {LLM_EMBED_URL}/v1/embeddings
 * mit { model: 'bge-m3', input: [text] }.
 *
 * Ergebnis gecacht per sha256(text + model) in einer prozesslokalen Map. Keine
 * Dateiablage: nach T002661 kostet ein Query-Embedding 0,25 s, womit der Cache
 * eine Optimierung ist und die Invalidierungsfragen einer persistenten Ablage
 * nicht rechtfertigt (tasks.md Vorbedingung, Punkt 2).
 *
 * Fehlerfaelle werfen (der Aufrufer entscheidet ueber die Fallback-Kette);
 * "Antwort erhalten und leer" (data: []) ist ein eigener Fehler, kein stiller
 * Erfolg.
 */
const queryEmbedCache = new Map();

export async function embedQuery(text) {
  const model = embedModel();
  const key = createHash('sha256').update(`${text}${model}`).digest('hex');
  const cached = queryEmbedCache.get(key);
  if (cached) return cached;

  const url = process.env.LLM_EMBED_URL;
  if (!url) throw new Error('LLM_EMBED_URL is not configured (embedQuery)');

  const r = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: [text] }),
    signal: AbortSignal.timeout(embedTimeoutMs()),
  });
  if (!r.ok) throw new Error(`embed ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  const embeddings = Array.isArray(j.data) ? j.data : [];
  if (embeddings.length === 0) {
    throw new Error('embed endpoint antwortete leer (data: []) — nicht als Erfolg behandelt');
  }
  const vector = embeddings[0].embedding;
  queryEmbedCache.set(key, vector);
  return vector;
}

/**
 * Kandidaten-Pull: `ORDER BY c.embedding <=> $n LIMIT $n+1`, Vorgabe limit=40.
 * Rueckgabe: Zeilen mit { id, position, text, metadata, source, collectionName,
 * score } — score = 1 - Distanz (Vektor-Reihenfolge). Ein leeres Ergebnis ist
 * der legitime "keine Kandidaten"-Fall, kein Fehler.
 *
 * Platzhalter-Reihenfolge: buildPredicates nummeriert ab $1 — der Vektor wird
 * deshalb HINTEN angehaengt (nicht vorangestellt, sonst kollidieren $1 der
 * Praedikate und $1 des Vektors und Postgres wirft "cannot cast type vector
 * to text[]"). Vektor- und Limit-Index werden dynamisch berechnet.
 */
export async function pullCandidates(pool, vector, predicates, limit = 40) {
  const vectorLiteral = `[${vector.join(',')}]`;
  const params = [...predicates.params, vectorLiteral, limit];
  const vectorIdx = params.length - 1; // $n fuer den Vektor
  const limitIdx = params.length; // $n+1 fuer das Limit
  const r = await pool.query(
    `SELECT c.id,
            c.position,
            c.text,
            c.metadata,
            col.source AS source,
            col.name   AS collection_name,
            1 - (c.embedding <=> $${vectorIdx}) AS score
     FROM   knowledge.chunks c
     JOIN   knowledge.collections col ON col.id = c.collection_id
     WHERE  ${predicates.where || 'TRUE'}
     ORDER  BY c.embedding <=> $${vectorIdx}
     LIMIT  $${limitIdx}`,
    params,
  );
  return r.rows.map((row) => ({
    id: row.id,
    position: row.position,
    text: row.text,
    metadata: row.metadata ?? {},
    source: row.source,
    collectionName: row.collection_name,
    score: Number(row.score),
  }));
}

/**
 * Ein bge_rerank-Batch (ein Aufruf, alle Kandidaten als documents). Bei Fehler,
 * Timeout oder leerer Antwort liefert die Funktion die Kandidaten in
 * Vektor-Reihenfolge zurueck und setzt `degraded: 'rerank'`, statt zu werfen —
 * ein Cross-Encoder-Ausfall darf den Dispatch nicht lahmlegen.
 *
 * Eingangsbegrenzung: Der deployte Reranker (k3d- und fleet-Manifeste
 * identisch) kennt n_ctx=2048 Tokens pro Anforderung und scheitert bei 2Gi
 * RAM schon darunter (OOMKilled, Messung 2026-08-14, Kopf dieses Moduls).
 * Die Kandidatentexte werden deshalb vor dem Aufruf auf ein gemeinsames
 * Zeichenbudget (Vorgabe CONTEXT_RETRIEVE_RERANK_INPUT_CHARS=4500, ~1500
 * Tokens) geteilt gekuerzt — pro Kandidat hoechstens
 * budget/documents.length Zeichen. Das kuerzt nur das Rank-Signal: die
 * Rueckgabe traegt die vollen Texte, fillBudget und der gelieferte
 * Kontextblock rechnen mit c.text ungekuerzt. Kurze Kandidaten (unter dem
 * Anteil) bleiben vollstaendig.
 *
 * Rueckgabe: { ranked, degraded } — ranked sortiert absteigend nach
 * Rerank-Score (bzw. unveraendert bei Degradation), auf topK gekuerzt.
 */
export async function rerank(query, candidates, topK = candidates.length) {
  const url = process.env.LLM_RERANKER_URL;
  if (!url) return { ranked: candidates, degraded: 'rerank' };

  const budgetChars = Number(process.env.CONTEXT_RETRIEVE_RERANK_INPUT_CHARS ?? 4500);
  // Query belegt den Slot mit; die Dokumente teilen den Rest (~3,0 Zeichen pro
  // Token gemessen 2026-08-14 — 4500 Zeichen ≈ 1500 Tokens, sicher unter der
  // 1633-Token-OOM-Grenze bei 2Gi).
  const docBudget = Math.max(500, budgetChars - query.length);
  const perDocCap = candidates.length > 0 ? Math.floor(docBudget / candidates.length) : docBudget;
  const documents = candidates.map((c) =>
    c.text.length > perDocCap ? c.text.slice(0, perDocCap) : c.text,
  );
  if (documents.length === 0) return { ranked: candidates, degraded: null };

  try {
    const r = await fetch(`${url}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LLM_RERANK_MODEL ?? 'bge-reranker-v2-m3',
        query,
        documents,
      }),
      signal: AbortSignal.timeout(rerankTimeoutMs()),
    });
    if (!r.ok) return { ranked: candidates, degraded: 'rerank' };
    const j = await r.json();
    const results = Array.isArray(j.results) ? j.results : [];
    // Antwort erhalten und leer: eigener Fall, nicht wie ein Fehler behandelt —
    // gleiches Ergebnis (Vektor-Reihenfolge, degraded), aber ohne Implikation
    // eines Ausfalls der Kette.
    if (results.length === 0) return { ranked: candidates, degraded: 'rerank' };

    const scoreByIndex = new Map(results.map((res) => [res.index, res.relevance_score]));
    const ranked = candidates
      .map((c, i) => ({ ...c, score: scoreByIndex.has(i) ? scoreByIndex.get(i) : -Infinity }))
      .sort((a, b) => b.score - a.score);
    return { ranked: topK < ranked.length ? ranked.slice(0, topK) : ranked, degraded: null };
  } catch {
    return { ranked: candidates, degraded: 'rerank' };
  }
}

/**
 * Budget-Fuellung: greedy nach Score bis zur Budget-Grenze (Token-Schaetzung
 * wie scripts/openspec-embed.mjs approxTokens, Laenge / 4 — Index- und
 * Retrieval-Seite rechnen identisch). Rueckgabe { selected, balance } mit
 * balance = { used, budget, selected, candidates } als Bilanz fuer --json.
 */
export function fillBudget(ranked, budgetTokens) {
  const selected = [];
  let used = 0;
  for (const c of ranked) {
    const tokens = approxTokens(c.text);
    if (used + tokens > budgetTokens) break;
    selected.push(c);
    used += tokens;
  }
  return {
    selected,
    balance: {
      used,
      budget: budgetTokens,
      selected: selected.length,
      candidates: ranked.length,
    },
  };
}

export { approxTokens, ACTIVE_STATUSES };
