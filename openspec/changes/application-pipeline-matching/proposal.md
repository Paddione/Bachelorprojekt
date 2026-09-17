# Proposal: application-pipeline-matching

## Why

Requirement "Automated Profile Matching against Platform Knowledge Graph" aus
`openspec/changes/application-pipeline/specs/application-pipeline.md` (Phase 1, T900228)
beschreibt Score-Berechnung und Strategie-Empfehlung, aber ohne konkreten Algorithmus oder
Speicherort. Phase 3 (T900230) hat bereits einen kuratierten Evidenz-Katalog
(`scripts/vda/apply/evidence-catalog.yaml`, `app_pipeline_select_evidence`) für die
Dossier-Personalisierung gebaut — dieselbe Auswahl-Logik liefert auch die Grundlage für einen
deterministischen Match-Score, statt eine zweite, unabhängige Bewertungslogik zu entwerfen.

## What

1. **Schema-Erweiterung:** `applications.jobs` bekommt `match_score` (0-100) und
   `match_evidence_ids` (Array der ausgewählten Katalog-Einträge).
2. **Matching-CLI:** `scripts/vda/apply/match.sh --job-id <id>` ruft
   `app_pipeline_select_evidence` (Phase 3) gegen die Requirements des Jobs auf, berechnet einen
   deterministischen Score aus der Anzahl/Gewichtung der Treffer und schreibt Score + Evidenz-IDs
   in die Job-Zeile zurück.
3. **Explizit nicht in dieser Phase:** Kein ML-/Embedding-basiertes Scoring (rein
   keyword-deterministisch, reproduzierbar und ohne externe Abhängigkeit), keine automatische
   Status-Transition (`found` → `drafting`) durch das Matching allein — das bleibt eine bewusste
   Operator-Entscheidung.

_Ticket: T900234_
