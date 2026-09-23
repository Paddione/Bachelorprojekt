## ADDED Requirements

### Requirement: Deterministic Keyword-Based Match Scoring

The system SHALL compute a deterministic, reproducible match score (0-100) for a job posting by
reusing the evidence-catalog selection logic from dossier personalization, and persist the score
and selected evidence ids on the job record.

#### Scenario: Job with strong evidence-catalog overlap receives a high score

- **GIVEN** a job record whose requirements text matches several evidence-catalog keywords
- **WHEN** running `scripts/vda/apply/match.sh --job-id <id>`
- **THEN** `applications.jobs.match_score` is set above 70 and `match_evidence_ids` contains the
  matched catalog entry ids, ranked by keyword-hit count

#### Scenario: Job with no evidence-catalog overlap receives the default fallback score

- **GIVEN** a job record whose requirements text matches no evidence-catalog keyword
- **WHEN** running `scripts/vda/apply/match.sh --job-id <id>`
- **THEN** `applications.jobs.match_score` is set to the documented default (not null, not a
  crash) and `match_evidence_ids` contains the catalog's default-marked entries
