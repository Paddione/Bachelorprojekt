# Central Database View Specification

## Goal
Consolidate bug tracking and project requirement tracking views into a single centralized database view under the `tickets` schema.

## Views to replace/consolidate
- `bachelorprojekt.v_pipeline_status`
- `bachelorprojekt.v_progress_summary`
- `bachelorprojekt.v_open_issues`
- `bachelorprojekt.v_timeline`

## Target
- A new view (proposed name: `tickets.v_central_dashboard`) that queries `tickets.tickets` and relates it to other tracking information.

## Strategy
1. Audit all references to `bachelorprojekt.v_*` views.
2. Define the schema for `tickets.v_central_dashboard`.
3. Create a migration script to replace the old views with the new one (using backward compatibility views if necessary).
4. Update consumers.
