-- T002652: Cache fuer die semantische Questionnaire-Analyse.
--
-- Der Embedding- und Clustering-Lauf ueber alle Antworten ist teuer (bge-m3
-- Batch ueber ~16k Antworten, O(n^2) DBSCAN-Distanzmatrix). Das Ergebnis wird
-- deshalb 24h zwischengespeichert (Freshness-Check in
-- lib/coaching-questionnaire-insights.ts; force=1 umgeht den Cache).
CREATE TABLE IF NOT EXISTS coaching.questionnaire_insights_cache (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
