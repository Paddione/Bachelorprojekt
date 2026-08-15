// coaching-questionnaire-insights.ts — T002652
//
// Semantische Analyse der Questionnaire-Antworten: alle details_text werden per
// bge-m3 embedded (fail-closed), per DBSCAN (Cosinus-Distanz) zu Themen-Clustern
// gruppiert und pro Cluster per LLM mit einem Label versehen. Das Ergebnis wird
// 24h in coaching.questionnaire_insights_cache gehalten; force=true umgeht den
// Cache.
//
// DSGVO: Labels werden ausschliesslich ueber den Session-Agent-Pfad erzeugt
// (createSessionAgent -> OpenAICompatibleSessionAgent mit DataResidencyError vor
// dem Request und x-llm-local-only-Header). Ohne on-premises-Provider werden
// KEINE Labels erzeugt — die Cluster werden dann ohne Labels ausgeliefert.
//
// DATENQUALITAET (Vorbehalt): Stand 2026-08 sind 16430 Antworten in der Tabelle,
// deren details_text generierter Schablonentext von 69/71 Zeichen ist (z. B.
// "Ich moechte ... klarer haben." mit Platzhaltern). Eine semantische Clusterung
// solcher Schablonen produziert plausible, aber mit echten Freitext-Antworten
// noch nicht validierte Gruppen. Die Qualitaet der Labels ist erst mit echten
// Antworten beurteilbar; die Defaults (eps=0.35, minPts=3) sind der Startpunkt.
//
// KOSTEN: DBSCAN berechnet paarweise Distanzen in O(n^2) — bei 16k Antworten
// sind das ~1.3e8 Cosinus-Berechnungen (je 768 dim). Die Implementierung haelt
// nur eine Zeile der Distanzmatrix im Speicher (O(n) statt O(n^2) RAM); die
// Laufzeit wird durch den 24h-Cache amortisiert.
import type { Pool } from 'pg';
import type { KiConfig } from './coaching-ki-config-db.ts';
import type { EmbeddingIndexError, EmbeddingQueryError } from './embeddings';
import { getActiveProvider } from './coaching-ki-config-db.ts';
import { embedBatch } from './embeddings';
import { createSessionAgent } from './session-agent-factory';

/**
 * Fail-closed-Vertrag der Analyse: embedBatch wirft EmbeddingIndexError (Batch)
 * bzw. EmbeddingQueryError (Query). Der Endpoint faengt beide als 503 ab — die
 * Analyse wird nie mit einem Teil der Antworten fortgesetzt.
 */
export type EmbeddingFailure = EmbeddingIndexError | EmbeddingQueryError;

export const EMBEDDING_MODEL = 'bge-m3';
export const INSIGHTS_CACHE_KEY = 'default';
export const INSIGHTS_CACHE_TTL_HOURS = 24;

export interface EmbeddedAnswer {
  id: string;
  text: string;
  vector: number[];
}

export interface ClusterResult {
  id: string;
  memberIds: string[];
  centroid: number[];
}

export interface InsightCluster {
  label: string | null;
  count: number;
  representativeAnswers: string[];
}

export interface QuestionnaireInsightsResult {
  cached: boolean;
  generatedAt: string;
  embeddingModel: string;
  clusters: InsightCluster[];
}

export interface ClusterOptions {
  eps?: number;
  minPts?: number;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  if (norm === 0) return 1;
  return 1 - dot / norm;
}

/**
 * Liest alle Questionnaire-Antworten mit details_text und embedded sie per
 * bge-m3. Antworten ohne Text werden uebersprungen (kein sinnvoller Vektor,
 * kein Batch-Token). Fail-closed: EmbeddingIndexError/EmbeddingQueryError
 * schlagen durch — die Analyse wird nie mit einem Teil der Antworten
 * fortgesetzt.
 */
export async function embed(pool: Pool): Promise<EmbeddedAnswer[]> {
  const res = await pool.query(
    `SELECT id, details_text FROM coaching.questionnaire_answers ORDER BY created_at`,
  );
  const rows = res.rows as { id: string; details_text: string | null }[];
  const withText = rows.filter(r => r.details_text != null && r.details_text.trim() !== '');
  const { embeddings } = await embedBatch(withText.map(r => r.details_text as string), {
    model: EMBEDDING_MODEL,
    purpose: 'index',
  });
  return withText.map((r, i) => ({
    id: r.id,
    text: r.details_text as string,
    vector: embeddings[i],
  }));
}

/**
 * DBSCAN ueber die Antwort-Vektoren (Cosinus-Distanz <= eps). Deterministisch:
 * das Ergebnis haengt nicht von der Reihenfolge der Antworten ab. Punkte ohne
 * minPts Nachbarn im eps-Radius werden als Rauschen verworfen.
 */
export function cluster(answers: EmbeddedAnswer[], options: ClusterOptions = {}): ClusterResult[] {
  const eps = options.eps ?? 0.35;
  const minPts = options.minPts ?? 3;
  const n = answers.length;
  const visited = new Array(n).fill(false);
  const clusters: ClusterResult[] = [];

  // Zeilenweise Distanzberechnung: O(n^2) Zeit, aber nur O(n) Speicher — die
  // volle Matrix waere bei 16k Antworten ~2 GB.
  const regionQuery = (p: number): number[] => {
    const out: number[] = [];
    for (let q = 0; q < n; q++) {
      if (p !== q && cosineDistance(answers[p].vector, answers[q].vector) <= eps) out.push(q);
    }
    return out;
  };

  let clusterId = 0;
  for (let p = 0; p < n; p++) {
    if (visited[p]) continue;
    visited[p] = true;
    const neighbors = regionQuery(p);
    if (neighbors.length < minPts - 1) continue; // Rauschen
    const members = new Set<number>([p]);
    const queue = [...neighbors];
    while (queue.length > 0) {
      const q = queue.pop() as number;
      if (!members.has(q)) members.add(q);
      if (!visited[q]) {
        visited[q] = true;
        const qn = regionQuery(q);
        if (qn.length >= minPts - 1) queue.push(...qn);
      }
    }
    const memberIndices = [...members].sort((a, b) => a - b);
    const centroid = answers[memberIndices[0]].vector.map((_, d) => {
      let sum = 0;
      for (const m of memberIndices) sum += answers[m].vector[d];
      return sum / memberIndices.length;
    });
    clusters.push({ id: `cluster-${clusterId++}`, memberIds: memberIndices.map(i => answers[i].id), centroid });
  }
  return clusters;
}

function cosineSimilarity(a: number[], b: number[]): number {
  return 1 - cosineDistance(a, b);
}

/** Die bis zu 3 Antworten eines Clusters, die dem Zentroid am naechsten stehen. */
function representativeAnswers(answers: EmbeddedAnswer[], memberIds: string[], centroid: number[]): string[] {
  const members = memberIds
    .map(id => answers.find(a => a.id === id))
    .filter((a): a is EmbeddedAnswer => a !== undefined);
  return members
    .sort((x, y) => cosineSimilarity(y.vector, centroid) - cosineSimilarity(x.vector, centroid))
    .slice(0, 3)
    .map(m => m.text);
}

const LABEL_SYSTEM_PROMPT = [
  'Du bist ein Coaching-Analyst. Unten stehen repräsentative Antworten aus',
  'einem Coaching-Fragebogen, die eine gemeinsame Thematik teilen.',
  'Fasse diese Thematik in EINEM Label von höchstens 6 Wörtern zusammen,',
  'auf Deutsch, ohne Anführungszeichen, ohne Einleitung.',
].join(' ');

function buildLabelPrompt(answers: string[]): string {
  const numbered = answers.map((a, i) => `[${i + 1}] ${a}`).join('\n');
  return `Gemeinsame Thematik:\n${numbered}`;
}

/**
 * Erzeugt pro Cluster genau ein LLM-Label ueber den DSGVO-geguardeten
 * Session-Agent-Pfad. Ist kein on-premises-Provider konfiguriert (kiConfig
 * null), bleiben alle Labels null — die Analyse wird dann ohne Labels
 * ausgeliefert, niemals ueber einen ungeprueften Pfad erzeugt.
 */
export async function label(
  answers: EmbeddedAnswer[],
  clusters: ClusterResult[],
  options: { kiConfig: KiConfig | null },
): Promise<(string | null)[]> {
  if (!options.kiConfig) return clusters.map(() => null);
  const agent = createSessionAgent(options.kiConfig);
  const out: (string | null)[] = [];
  for (const c of clusters) {
    const reps = representativeAnswers(answers, c.memberIds, c.centroid);
    const result = await agent.generate({
      sessionId: 'questionnaire-insights',
      stepNumber: 0,
      coachInputs: {},
      kiConfig: options.kiConfig,
      brand: options.kiConfig.brand,
      history: [],
      effectiveSystemPrompt: options.kiConfig.systemPrompt || LABEL_SYSTEM_PROMPT,
      assembledUserPrompt: buildLabelPrompt(reps),
      stepName: 'Fragebogen-Insights',
      phase: 'insights',
    });
    out.push(result.aiResponse.trim() || null);
  }
  return out;
}

export interface GenerateInsightsOptions {
  brand?: string;
  force?: boolean;
}

/**
 * Orchestriert die Analyse: Cache-Check (24h-Freshness) -> embed -> cluster ->
 * label -> Cache-Schreiben. Der Cache-Key ist bewusst ein Singleton
 * ('default'): Die Analyse ist teuer und fuer eine Fragebogen-Bestandsmenge
 * sind thematische Verschiebungen binnen 24h unwahrscheinlich.
 */
export async function generateQuestionnaireInsights(
  pool: Pool,
  options: GenerateInsightsOptions = {},
): Promise<QuestionnaireInsightsResult> {
  const brand = options.brand ?? process.env.BRAND ?? 'mentolder';
  const force = options.force === true;

  if (!force) {
    const cacheRes = await pool.query(
      `SELECT payload FROM coaching.questionnaire_insights_cache
        WHERE key = $1 AND created_at > now() - interval '24 hours'`,
      [INSIGHTS_CACHE_KEY],
    );
    const cached = cacheRes.rows[0]?.payload as QuestionnaireInsightsResult | undefined;
    if (cached) return { ...cached, cached: true };
  }

  const answers = await embed(pool);
  const clusters = cluster(answers);

  const provider = await getActiveProvider(pool, brand);
  const labels = await label(answers, clusters, { kiConfig: provider });

  const insightClusters: InsightCluster[] = clusters.map((c, i) => ({
    label: labels[i],
    count: c.memberIds.length,
    representativeAnswers: representativeAnswers(answers, c.memberIds, c.centroid),
  }));

  const result: QuestionnaireInsightsResult = {
    cached: false,
    generatedAt: new Date().toISOString(),
    embeddingModel: EMBEDDING_MODEL,
    clusters: insightClusters,
  };

  await pool.query(
    `INSERT INTO coaching.questionnaire_insights_cache (key, payload, created_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, created_at = now()`,
    [INSIGHTS_CACHE_KEY, JSON.stringify(result)],
  );

  return result;
}
