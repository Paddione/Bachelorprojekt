# Proposal: g-cq05-todo-cleanup

_Ticket: T001290_

## Why

Goal G-CQ05 tracks unlinked TODO comments in the codebase. The baseline was 1 (the pre-existing stub in `website/src/lib/assistant/actions/admin/sendInvoice.ts`). A regression of +5 occurred when the OpenSpec tooling scripts were added, raising the count to 6. All five new hits land in infrastructure scripts that use the literal string `TODO` as a stub-detection pattern inside regex literals and string arrays — they are not action items. Without correcting the measure command's exclusion list these false positives will silently accumulate every time stub-detection logic is extended, making the health metric unreliable.

## What

1. Run the current measure command to confirm the 6-hit baseline and identify every match.
2. Classify each hit: the five hits in `scripts/openspec-validate.ts`, `scripts/openspec-validate.test.ts`, and `scripts/openspec-merge.mjs` are false positives — the string `TODO` appears inside regex patterns and string literals used by the stub-detection pipeline, not as developer action items. The single hit in `website/src/lib/assistant/actions/admin/sendInvoice.ts` is the pre-existing real stub (the original baseline of 1).
3. Extend the grep exclusion filter in the measure command to also skip the three OpenSpec tool files.
4. Add the G-CQ05 row (with the corrected measure command) to `scripts/health-goals-check.sh` so the goal becomes machine-checkable.
5. After the fix the measure returns 1, which satisfies the target of ≤ 1.

No action is taken on the remaining `sendInvoice.ts` TODO in this change. It is the legitimate pre-existing stub documented in goals.md as the acceptable baseline and represents a genuine future feature (end-to-end invoice send pipeline). It will be addressed when the billing feature is implemented.

## Impact

**Changed files:**
- `scripts/health-goals-check.sh` — adds one `row target G-CQ05 …` line with the corrected measure command

**No deletions. No new files.**

**Risks:** Low. The change only adds a measurement row to the health-check script and tightens an exclusion filter. The underlying code files are not modified.

**Out of scope:** Implementing the invoice-send pipeline (`sendInvoice.ts`), refactoring the OpenSpec stub-detection strings, or changing the goals.md baseline entry.
