# Tasks: grilling-ui-multichoice

Plan: `docs/superpowers/plans/2026-06-20-grilling-ui-multichoice.md` · Ticket: T000737

## Task 0: T000737 Daten-Reset (operativ, kein Code-Change)

- [ ] Read-only verify: `psql … SELECT external_id, grilling_answers IS NOT NULL, grilling_meta IS NOT NULL WHERE external_id='T000737'`
- [ ] `UPDATE tickets.tickets SET grilling_answers = NULL, grilling_meta = NULL WHERE external_id = 'T000737'` via `kubectl --context fleet exec -n workspace deploy/shared-db` (→ `UPDATE 1`)
- [ ] Confirm beide Spalten NULL; falls Ticket auch in `workspace-korczewski` existiert, dort wiederholen

## Task 1: grilling.ts — `choices?`-Feld + kuratierte Choice-Listen

- [ ] Failing-Test `grilling.test.ts`: q13 final / q4 coaching exposen `choices`; q1 ohne `choices` → undefined; `resolveQuestions` reicht `choices` durch
- [ ] `GrillingQuestion.choices?: string[]` + `ResolvedQuestion.choices?: string[]` ergänzen
- [ ] `final-grilling-v1`: choices an q8, q13, q17, q18, q19, q20
- [ ] `coaching-sessions-v1`: choices an q3, q4, q17, q18, q19
- [ ] `resolveQuestions` Registry-Branch kopiert `q.choices` ins ResolvedQuestion (Meta-Branch unverändert)
- [ ] Tests grün; `wc -l grilling.ts` < ~500

## Task 2: GrillingStepper.svelte — Choice-Chips über dem Textarea

- [ ] Failing-Test `GrillingStepper.test.ts`: Chips rendern (`data-testid="grilling-choice-{choice}"`) für Frage mit choices; Chip-Klick setzt Textarea-Inhalt; Frage ohne choices → keine Chips
- [ ] `selectChoice(value)` setzt `answers[qnId][current.id]=value` + debounced PATCH
- [ ] Chip-Row zwischen Prompt und Textarea; aktiver Chip (`answerText===choice`) Gold-Border
- [ ] Tests grün (6 bestehende Stepper-Tests unverändert)

## Task 3: GrillingStepper.svelte — All-Modus-Liste implementieren

- [ ] Failing-Test: `mode==='all'` → `data-testid="grilling-all-list"` zeigt ALLE Fragen-Labels; answered-Frage zeigt Antwort-Preview
- [ ] Template in `{#if mode==='all'}` (Liste) / `{:else if current}` (Einzelfrage) / `{:else}` aufteilen
- [ ] All-Liste: answered (Preview) / dismissed (kursiv, opacity) / open (inline-Input → `currentId=q.id; onInput`)
- [ ] Tests grün (Mode-Toggle-Test unverändert); `wc -l` < ~500

## Task 4: [id].astro — dynamische Questionnaire-Auswahl

- [ ] Frontmatter: `grillingQnId` aus `Object.keys(ticket.grillingAnswers ?? {})` ohne `coaching-sessions-v1`, Default `final-grilling-v1`
- [ ] `questionnaireId={grillingQnId}` statt hardcoded `"coaching-sessions-v1"` (Z. 185)
- [ ] `pnpm astro check` ohne neue Fehler; `wc -l` < ~500 (zeilenneutral halten)

## Task 5: Volle Website-Test-Suite grün

- [ ] `cd website && pnpm vitest run` komplett grün
- [ ] Falls bestehender Test bricht: vorwärts fixen (Implementierung, nicht Assertion aufweichen)

## Task 6: OpenSpec-Artefakte

- [ ] `proposal.md` (Why/What) + Spec-Delta (echte ADDED Requirements + Scenarios) füllen — kein TODO-Rest
- [ ] `bash scripts/openspec.sh validate` grün

## Task 7: Finale Verifikation (PFLICHT)

- [ ] `task test:inventory` (+ `test-inventory.json` committen falls geändert)
- [ ] `task test:changed`
- [ ] `task test:openspec`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check` (S1–S4-Ratchet + Baseline grün)
