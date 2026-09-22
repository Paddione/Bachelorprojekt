# Spec: application-pipeline (Delta)

## Changes

### NEW: Cockpit shows all 7 job statuses

The cockpit Kanban board SHALL display columns for all 7 job statuses defined in the pipeline. Previously only 5 statuses were shown (found, drafting, applied, interviewing, offered); rejected and withdrawn were hidden.

**SHALL display:** `found`, `drafting`, `applied`, `interviewing`, `offered`, `rejected`, `withdrawn`
**SHALL still filter out:** `withdrawn` (jobs already withdrawn are excluded from the Kanban board to reduce clutter — this behavior is intentional)
**SHALL NOT display:** `withdrawn` column (same rationale as before)

### NEW: Job detail shows raw text and requirements

The cockpit detail panel SHALL display the job's `raw_text` (original uploaded content) and `requirements` (structured job requirements) in separate collapsible sections.

- `raw_text` section: labeled "Quelltext", rendered with preserved line breaks
- `requirements` section: labeled "Anforderungen", rendered with preserved line breaks
- Sections are only shown if the respective field is non-empty

### NEW: Auto-render path uses configurable directory

The cockpit status update handler SHALL look for the render script in a configurable directory.

**Configuration:**
- `APP_PIPELINE_SCRIPT_DIR` environment variable: absolute path to directory containing `scripts/vda/apply/render.sh`
- Fallback: derive from `process.cwd()` by finding first parent containing `scripts/vda/apply/render.sh` (recursive upward search, max 5 levels)
- If both fail, auto-render is skipped with a console warning (not an error)

## Scenarios

### Scenario: Rejected jobs appear on Kanban board

- **GIVEN** there are jobs with `status = 'rejected'` in the database
- **WHEN** the user opens the cockpit Kanban board
- **THEN** a "Abgelehnt" column with the rejected CSS color is visible
- **THEN** the rejected cards show match score, dossier count, and source link

### Scenario: Detail panel shows raw text and requirements

- **GIVEN** a job has non-empty `raw_text` and/or `requirements` fields
- **WHEN** the user clicks the job card to open the detail panel
- **THEN** sections for "Quelltext" and "Anforderungen" are rendered with the content
- **THEN** content is HTML-escaped to prevent XSS

### Scenario: Auto-render works with env var

- **GIVEN** `APP_PIPELINE_SCRIPT_DIR` is set to `/opt/app/scripts`
- **WHEN** a job status changes to `drafting` or `applied`
- **THEN** the render script at `/opt/app/scripts/vda/apply/render.sh` is spawned
- **THEN** the response is not blocked while render runs in background

### Scenario: Auto-render falls back gracefully

- **GIVEN** `APP_PIPELINE_SCRIPT_DIR` is not set
- **WHEN** the server is deployed from a path NOT containing `components/`
- **THEN** auto-render is skipped with a `console.warn` message
- **THEN** the status update response still succeeds
