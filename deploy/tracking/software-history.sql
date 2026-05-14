-- Software-history events: one classified record per PR (may be multiple per PR).
CREATE TABLE IF NOT EXISTS bachelorprojekt.software_events (
  id             BIGSERIAL PRIMARY KEY,
  pr_number      INTEGER NOT NULL REFERENCES bachelorprojekt.features(pr_number) ON DELETE CASCADE,
  service        TEXT    NOT NULL,
  area           TEXT    NOT NULL,
  kind           TEXT    NOT NULL CHECK (kind IN ('added','removed','changed','irrelevant')),
  confidence     NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  classifier     TEXT    NOT NULL,
  classified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_software_events_pr      ON bachelorprojekt.software_events (pr_number);
CREATE INDEX IF NOT EXISTS idx_software_events_service ON bachelorprojekt.software_events (service);
CREATE INDEX IF NOT EXISTS idx_software_events_kind    ON bachelorprojekt.software_events (kind);

CREATE OR REPLACE VIEW bachelorprojekt.v_software_stack AS
WITH last_event AS (
  SELECT DISTINCT ON (service)
    service, area, kind, classified_at, pr_number
  FROM bachelorprojekt.software_events
  WHERE kind <> 'irrelevant'
  ORDER BY service, classified_at DESC, id DESC
)
SELECT service, area, classified_at AS as_of, pr_number AS last_pr
FROM last_event
WHERE kind <> 'removed'
ORDER BY area, service;

CREATE OR REPLACE VIEW bachelorprojekt.v_software_history AS
SELECT
  e.id,
  e.pr_number,
  f.merged_at,
  f.title,
  f.brand,
  f.merged_by,
  e.service,
  e.area,
  e.kind,
  e.confidence,
  e.classifier,
  e.classified_at,
  e.notes
FROM bachelorprojekt.software_events e
JOIN bachelorprojekt.features f ON f.pr_number = e.pr_number
WHERE e.kind <> 'irrelevant'
ORDER BY f.merged_at DESC, e.id DESC;

GRANT SELECT ON bachelorprojekt.software_events,
                bachelorprojekt.v_software_stack,
                bachelorprojekt.v_software_history
  TO website;
GRANT INSERT, UPDATE, DELETE ON bachelorprojekt.software_events TO website;
GRANT USAGE, SELECT ON SEQUENCE bachelorprojekt.software_events_id_seq TO website;
