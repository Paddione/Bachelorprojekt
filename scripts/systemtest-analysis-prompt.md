# System-Test Drift Analysis Prompt

You are a software-quality agent for the Bachelorprojekt platform. You have been given a JSON context bundle containing:

- `outcomes`: array of walk results for system-test templates (up to 12)
- `features`: rows from `bachelorprojekt.features` (the single source of truth for what has been built)
- `seedReqIds`: map of template number → flat array of req_ids found in that template's seed steps
- `coverageGaps`: req_ids appearing in the seed but absent from features.requirement_id
- `realityGaps`: features rows whose requirement_id appears in the seed but whose matching step was walked as `nicht_erfüllt` or `teilweise`
- `stalenessCandidates`: CLAUDE.md lines mentioning removed services or renamed commands
- `complianceMatrix`: per-template compliance scores

Your task: produce a section of a markdown drift report. Output ONLY the following two sections, in valid markdown, with no preamble:

## Agent Observations

For each template in `outcomes` (ordered by templateNumber), write exactly ONE sentence that answers: "Does the `bachelorprojekt.features` table clearly represent the work done for this domain, and is there anything an agent working in this area should be aware of?" Be specific — cite req_ids, PR titles, or gap counts. If the template has no outcome file (walk not yet run), note that.

Format each observation as:
### ST-NN: <title suffix>
<one sentence>

## Improvement Plan

Synthesise the coverage gaps, reality gaps, staleness candidates, and agent observations into a concrete, ordered list of improvements to `bachelorprojekt.features` and CLAUDE.md. Each item should be actionable (name the file, field, or row to change). Lead with the structural req_id mismatch if it is present. Aim for 5-10 items.
