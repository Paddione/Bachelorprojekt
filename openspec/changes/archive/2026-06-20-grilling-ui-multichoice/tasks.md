# Tasks: grilling-ui-multichoice

Plan: `docs/superpowers/plans/2026-06-20-grilling-ui-multichoice.md` · Ticket: T000737

## Task 0: T000737 Daten-Reset (operativ, kein Code-Change)

- [x] Read-only verify: `psql … SELECT external_id, grilling_answers IS NOT NULL, grilling_meta IS NOT NULL WHERE external_id='T000737'`
- [x] `UPDATE tickets.tickets SET grilling_answers = NULL, grilling_meta = NULL WHERE external_id = 'T000737'` via `kubectl --context fleet exec -n workspace deploy/shared-db` (→ `UPDATE 1`)
- [x] Confirm beide Spalten NULL; falls Ticket auch in `workspace-korczewski` existiert, dort wiederholen

## Task 1: grilling.ts — `choices?`-Feld + kuratierte Choice-Listen

- [x] Failing-Test `grilling.test.ts`: q13 final / q4 coaching exposen `choices`; q1 ohne `choices` → undefined; `resolveQuestions` reicht `choices` durch
- [x] `GrillingQuestion.choices?: string[]` + `ResolvedQuestion.choices?: string[]` ergänzen
- [x] `final-grilling-v1`: choices an q8, q13, q17, q18, q19, q20
- [x] `coaching-sessions-v1`: choices an q3, q4, q17, q18, q19
- [x] `resolveQuestions` Registry-Branch kopiert `q.choices` ins ResolvedQuestion (Meta-Branch unverändert)
- [x] Tests grün; `wc -l grilling.ts` < ~500

## Task 2: GrillingStepper.svelte — Choice-Chips über dem Textarea

- [x] Failing-Test `GrillingStepper.test.ts`: Chips rendern (`data-testid="grilling-choice-{choice}"`) für Frage mit choices; Chip-Klick setzt Textarea-Inhalt; Frage ohne choices → keine Chips
- [x] `selectChoice(value)` setzt `answers[qnId][current.id]=value` + debounced PATCH
- [x] Chip-Row zwischen Prompt und Textarea; aktiver Chip (`answerText===choice`) Gold-Border
- [x] Tests grün (6 bestehende Stepper-Tests unverändert)

## Task 3: GrillingStepper.svelte — All-Modus-Liste implementieren

- [x] Failing-Test: `mode==='all'` → `data-testid="grilling-all-list"` zeigt ALLE Fragen-Labels; answered-Frage zeigt Antwort-Preview
- [x] Template in `{#if mode==='all'}` (Liste) / `{:else if current}` (Einzelfrage) / `{:else}` aufteilen
- [x] All-Liste: answered (Preview) / dismissed (kursiv, opacity) / open (inline-Input → `currentId=q.id; onInput`)
- [x] Tests grün (Mode-Toggle-Test unverändert); `wc -l` < ~500

## Task 4: [id].astro — dynamische Questionnaire-Auswahl

- [x] Frontmatter: `grillingQnId` aus `Object.keys(ticket.grillingAnswers ?? {})` ohne `coaching-sessions-v1`, Default `final-grilling-v1`
- [x] `questionnaireId={grillingQnId}` statt hardcoded `"coaching-sessions-v1"` (Z. 185)
- [x] `pnpm astro check` ohne neue Fehler; `wc -l` < ~500 (zeilenneutral halten)

## Task 5: Volle Website-Test-Suite grün

- [x] `cd website && pnpm vitest run` komplett grün (nur pre-existing failures in cockpit-db + shareFile)
- [x] Falls bestehender Test bricht: vorwärts fixen (Implementierung, nicht Assertion aufweichen)

## Task 6: OpenSpec-Artefakte

- [x] `proposal.md` (Why/What) + Spec-Delta (echte ADDED Requirements + Scenarios) füllen — kein TODO-Rest
- [x] `bash scripts/openspec.sh validate` grün

## Task 7: Finale Verifikation (PFLICHT)

- [x] `task test:inventory` (+ `test-inventory.json` committen falls geändert)
- [x] `task test:changed`
- [x] `task test:openspec`
- [x] `task freshness:regenerate`
- [x] `task freshness:check` (S1–S4-Ratchet + Baseline grün)
