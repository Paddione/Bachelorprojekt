# Questionnaire Feature Design

**Date:** 2026-04-26  
**Status:** Approved  
**Context:** mentolder.de coaching platform (Astro + Svelte 5, PostgreSQL, Keycloak SSO)

## Overview

Add a Fragebogen (questionnaire) feature to the platform alongside the existing Newsletter and Verträge features. Coaches (admins) assign psychological self-assessment questionnaires to clients. Clients fill them in via a step-by-step wizard in their portal. The system automatically computes dimension scores. Admins review results with a bar chart Auswertung and add coaching notes.

Three validated instruments ship as seed data: Thomas/Kilmann (conflict styles), Riemann-Thomann (personality axes), and Inneres Funktionsmodell (inner drivers).

## Data Model

Six new tables, following the same TypeScript-interface + raw SQL pattern as `documents-db.ts` and `newsletter-db.ts`.

### `questionnaire_templates`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| title | TEXT | e.g. "Inneres Funktionsmodell" |
| description | TEXT | Internal admin description |
| instructions | TEXT | Shown to client before starting |
| status | TEXT | `draft` / `published` / `archived` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `questionnaire_dimensions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| template_id | UUID FK | → templates |
| name | TEXT | e.g. "Sei perfekt!" |
| position | INTEGER | Display order |
| threshold_mid | INTEGER nullable | Below = förderlich (green); NULL = no colour coding |
| threshold_high | INTEGER nullable | Below = mittel (amber), above = kritisch (red); NULL = no colour coding |
| score_multiplier | INTEGER | Default 1; IFM uses 2 to match ×2 rule from instrument |
| created_at | TIMESTAMPTZ | |

### `questionnaire_questions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| template_id | UUID FK | → templates |
| position | INTEGER | Wizard order |
| question_text | TEXT | Shown to client |
| question_type | TEXT | `ab_choice` / `ja_nein` / `likert_5` |
| created_at | TIMESTAMPTZ | |

### `questionnaire_answer_options`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| question_id | UUID FK | → questions |
| option_key | TEXT | `A`/`B`, `Ja`/`Nein`, or `1`–`5` |
| label | TEXT | Display label (e.g. "A. Ich versuche...") |
| dimension_id | UUID FK nullable | NULL = no score contribution (e.g. "Nein" in Ja/Nein) |
| weight | INTEGER | Default 1. Likert score = option_key::int × weight |

This is the scoring heart of the system. Each selectable option independently maps to a dimension with a weight. Thomas/Kilmann Q1-A → Vermeiden and Q1-B → Entgegenkommen are simply two rows pointing to different dimensions.

### `questionnaire_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| customer_id | UUID FK | → customers |
| template_id | UUID FK | → templates |
| status | TEXT | `pending` / `in_progress` / `submitted` / `reviewed` |
| coach_notes | TEXT | Admin's interpretation notes |
| assigned_at | TIMESTAMPTZ | |
| submitted_at | TIMESTAMPTZ nullable | |
| reviewed_at | TIMESTAMPTZ nullable | |

### `questionnaire_answers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| assignment_id | UUID FK | → assignments |
| question_id | UUID FK | → questions |
| option_key | TEXT | The chosen option (A/B/Ja/Nein/1–5) |
| saved_at | TIMESTAMPTZ | Updated on each auto-save |

One row per question per assignment. Upserted on each wizard step. Requires `UNIQUE (assignment_id, question_id)` DB constraint to support `INSERT ... ON CONFLICT DO UPDATE`.

## Score Computation

Computed server-side on-the-fly in the admin detail endpoint. No caching needed (max ~50 questions, trivially fast).

```
For each dimension D in template:
  raw_score = SUM of:
    - For ab_choice / ja_nein: weight (when answer.option_key matches an option with dimension_id = D.id)
    - For likert_5: answer.option_key::int × weight (same condition)

  final_score = raw_score × D.score_multiplier

  level (only when thresholds are set):
    if D.threshold_mid is NULL → no colour coding, show neutral bar
    final_score < D.threshold_mid  → "förderlich" (green)
    final_score < D.threshold_high → "mittel" (amber)
    else                           → "kritisch" (red)
```

## API Routes

### Admin (require `isAdmin` session check)

| Method | Path | Action |
|---|---|---|
| GET | `/api/admin/questionnaires/templates` | List all templates |
| POST | `/api/admin/questionnaires/templates` | Create template |
| PUT | `/api/admin/questionnaires/templates/[id]` | Update (returns 409 if status is `published`) |
| DELETE | `/api/admin/questionnaires/templates/[id]` | Delete (blocked if has assignments) |
| POST | `/api/admin/questionnaires/assign` | Assign template to customer, send email |
| GET | `/api/admin/questionnaires/assignments?customerId=` | List assignments for a client |
| GET | `/api/admin/questionnaires/assignments/[id]` | Detail: questions + answers + computed scores |
| PUT | `/api/admin/questionnaires/assignments/[id]` | Update coach_notes + status |

### Portal (require authenticated session, own assignments only)

| Method | Path | Action |
|---|---|---|
| GET | `/api/portal/questionnaires` | List my assignments |
| GET | `/api/portal/questionnaires/[id]` | Questions for this assignment (no scoring rules exposed) |
| PUT | `/api/portal/questionnaires/[id]/answer` | Upsert one answer (auto-save per question) |
| POST | `/api/portal/questionnaires/[id]/submit` | Mark submitted, notify admin by email |

## Components & Pages

### Admin — Template Builder

**Location:** New "Fragebögen" tab in `/admin/dokumente` (alongside Newsletter + Vertragsvorlagen).

`DokumentEditor.svelte` gets a third tab. New component `QuestionnaireTemplateEditor.svelte`:
- Left panel: list of templates with status badges, "Neue Vorlage" button
- Right panel (edit mode):
  - Metadata: title, description, instructions textarea
  - Dimension manager: list of dimensions with name, threshold_mid, threshold_high, score_multiplier; add/delete
  - Question list: drag-to-reorder by position, add/delete questions
  - Per-question: type selector, question_text, then answer-option rows (option_key, label, dimension dropdown, weight)
- Published templates are read-only (show "Duplizieren" button to create editable copy)
- Status: draft → published via toggle; published → archived via separate action

### Admin — Client Questionnaires Panel

**Location:** New "Fragebögen" tab in `/admin/[clientId]`, alongside existing "Verträge" tab.

`ClientQuestionnairesPanel.svelte`:
- List of assignments with status badges (Ausstehend / In Bearbeitung / Eingereicht / Besprochen)
- "Fragebogen zuweisen" button → dropdown of published templates → POST to assign endpoint → sends email notification to client
- Each row links to `/admin/fragebogen/[assignmentId]`

### Admin — Auswertung Page

**Location:** `/admin/fragebogen/[assignmentId]` (new Astro page with AdminLayout)

- Header: template title, client name, submitted date
- Dimension bar chart: horizontal bars per dimension, colour-coded by threshold level (green/amber/red), score label on right
- Raw answers section: all questions listed with the client's selected option (always visible)
- Coach notes: textarea (auto-saved on blur via PUT)
- Status control: "Als besprochen markieren" button → sets status to `reviewed`

### Portal — Client Wizard

**Location:** `/portal/fragebogen/[assignmentId]` (new Astro page with PortalLayout)

**Intro screen:**
- Template title + instructions text
- "Fragebogen starten" / "Weiter ausfüllen" button (depending on progress)

**Wizard screen (one question at a time):**
- Progress bar: "Frage X von N"
- Question text
- Answer options as clickable cards (A/B) or buttons (Ja/Nein) or 1–5 scale (Likert)
- On selection: auto-save via PUT, advance to next question
- Back button restores previous answer
- Resumable: on revisit, jumps to first unanswered question

**Final screen:**
- Summary: "X von N Fragen beantwortet"
- "Fragebogen absenden" button → POST submit → confirmation message

**Portal dashboard:**
- Pending questionnaire count shown as badge (alongside existing contract badge)

## Seed Data

Script: `scripts/seed-questionnaires.ts` (run once, idempotent — skips if template title already exists).

### Thomas/Kilmann Konflikttypen-Fragebogen
- 30 A/B questions
- 5 dimensions: Konkurrieren, Zusammenarbeit, Kompromiss, Vermeiden, Entgegenkommen
- No thresholds (raw sum per dimension, higher = stronger tendency)
- score_multiplier = 1
- Scoring matrix transcribed from instrument (PDF page 21)

### Riemann-Thomann Selbsteinschätzung
- 48 Ja/Nein questions
- 4 dimensions: Distanz, Nähe, Dauer, Wechsel
- Only "Ja" answers score; "Nein" rows have dimension_id = NULL
- Question-to-dimension groups from instrument (PDF page 3)
- score_multiplier = 1

### Inneres Funktionsmodell (Kahler/Caspers 1974)
- 50 Likert-5 questions
- 5 dimensions: Sei perfekt!, Beeil dich!, Streng dich an!, Mach es allen recht!, Sei stark!
- Thresholds: threshold_mid = 60, threshold_high = 80
- score_multiplier = 2 (raw sum × 2, matching the instrument's scoring rule)
- Question-to-dimension groups from instrument

## Integration Points

- **Email:** Reuse existing `email.ts` — one email to client on assignment, one to admin on submission
- **Auth:** Same `getSession()` / `isAdmin()` pattern as all other endpoints
- **Styling:** Svelte 5 `$state` / `$effect` / `$derived`, Tailwind v4 dark theme (brass `#b8a06a`, dark backgrounds)
- **DB library:** New `questionnaire-db.ts` in `website/src/lib/`, same raw SQL + typed interfaces pattern
