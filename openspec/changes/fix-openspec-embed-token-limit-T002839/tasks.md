---
title: "fix-openspec-embed-token-limit-T002839 — Implementation Plan"
ticket_id: T002839
domains: [db]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-openspec-embed-token-limit-T002839 — Implementation Plan

_Ticket: T002839 · Proposal: [proposal.md](./proposal.md) · Delta-Spec:
[specs/openspec-embedding.md](./specs/openspec-embedding.md)_

Root-cause recap (full analysis in `proposal.md`): `--count-skipped`
(`scripts/openspec-embed.mjs` ~L388-411) is a static diagnostic, fully
decoupled from the real indexing path `embedSlug()` (~L222-333), which
never skips anything by token count — it POSTs every chunk to the
embedding backend regardless of size. The diagnostic's false positives
come from `buildChunks()` (~L141-171): `chunkProposal()` returns the
whole `proposal.md` body as ONE unsplit chunk, unlike `chunkSections()`
(tasks/spec), which applies a 400-token budget split with 50-token
overlap once a section exceeds target. Partials (`tasks.d/*.md`) are
correctly single-chunk by SSOT design (`openspec-embedding.md`
Requirement "Plan-Partials aus tasks.d/ werden als Factory-Slot-Einheit
eingebettet") and are already governed by their own 7000-token cap in
`scripts/plan-lint.sh` (T002453-C) — the flat 2048-token diagnostic
threshold was simply never made aware of that separate, larger, correct
budget, so legally-sized partials (like
`fix-watchdog-sf26-vakuos-T002620/tasks.d/p1-sf26-vakuos-tests.md`,
~2130 tokens) get wrongly reported as "skipped".

## File Structure

```
scripts/openspec-embed.mjs                                      (geändert, 430 → ~460 Zeilen · Budget 370 · nicht-baselined)
scripts/openspec-embed.test.mjs                                  (geändert, RED-Tests bereits im Plan-Stage-Commit hinzugefügt · Ist 254 · Budget 546 · nicht-baselined)
```

Keine der beiden Dateien ist gebaselined (`docs/code-quality/baseline.json`), beide liegen weit
unter dem `.mjs`-Limit (800 Zeilen, `docs/code-quality/gates.yaml`) — kein S1-Split nötig.

<!-- vitest: neue Assertions erweitern die bestehende scripts/openspec-embed.test.mjs statt eine
     neue Test-Datei anzulegen (bevorzugtes Muster it. plan-quality-gates.md „Bestehende Tests
     erweitern statt neue Dateien anlegen"). Kein tests/spec/*.bats nötig — die Logik ist reine,
     per Dependency-Injection testbare JS-Funktionalität mit einem existierenden Vitest-Suite. -->

## Task 1 — Failing-Test-Step (RED) — bereits erledigt

Die RED-Tests wurden bereits im Plan-Stage-Commit zu `scripts/openspec-embed.test.mjs`
hinzugefügt (Fix-Pfad Schritt 3 — failing test vor Plan). Sie decken alle drei Fix-Bausteine ab:

1. `chunkProposal()` muss oversized Bodies analog `chunkSections()` per 400-Token-Budget
   (50-Token-Overlap) aufteilen (`describe('chunkProposal')`, Test `[T002839] splits an
   oversized body …`).
2. `estimateSlugTokenWorst()` muss `{tokens, fileType}` statt einer nackten Zahl zurückgeben,
   damit `--count-skipped` typ-bewusst prüfen kann (`describe('estimateSlugTokenWorst')`).
3. Die CLI (`node scripts/openspec-embed.mjs --count-skipped`) muss auf einem synthetischen
   Fixture-Repo (`makeFixtureRepo()` in derselben Datei) korrekt zwischen einem jetzt
   aufgeteilten langen Proposal, einem plan-lint-legalen Partial (~2125 Token, < 7000) und
   einem tatsächlich illegal übergroßen Partial (~7500 Token, > 7000) unterscheiden — nur
   Letzteres bleibt geflaggt (Positiv-Anker gegen einen vakuosen "0 skips immer"-Fix) — und die
   betroffenen Slugs im Output auflisten (`describe('CLI: node scripts/openspec-embed.mjs
   --count-skipped')`).
4. Ein bereits grüner Regressions-Anker (`describe('buildChunks')`, Test `[T002839] keeps an
   oversized-but-plan-lint-legal partial as one chunk`) beweist, dass der Fix Partials NICHT
   aufteilt — das würde die SSOT-Anforderung "Plan-Partials … als Factory-Slot-Einheit"
   verletzen.

```bash
npx vitest run scripts/openspec-embed.test.mjs --reporter=verbose
# expected: FAIL — 3 von 13 Tests rot:
#   chunkProposal > [T002839] splits an oversized body …
#   estimateSlugTokenWorst > [T002839] reports {tokens, fileType} …
#   CLI: node scripts/openspec-embed.mjs --count-skipped > [T002839] stops flagging …
```

Kein weiterer Schritt hier nötig — nur zur Verifikation vor Task 2 erneut laufen lassen.

## Task 2 — `chunkProposal()`: 400-Token-Budget-Split mit Overlap

**Datei:** `scripts/openspec-embed.mjs`, Zeilen 95-97 (aktuelle Funktion):

```js
export function chunkProposal(body) {
  return [{ position: 0, text: body.trim(), sectionTitle: '', charOffset: 0 }];
}
```

Ersetzen durch (nutzt das bereits vorhandene, private `splitByTokenBudget(text, target,
overlap)`, Zeile 75-93 — kein neuer Helper nötig, nur Wiederverwendung):

```js
export function chunkProposal(body, opts = {}) {
  const target = opts.targetTokens ?? 400;
  const overlap = opts.overlapTokens ?? 50;
  const trimmed = body.trim();
  if (approxTokens(trimmed) <= target) {
    return [{ position: 0, text: trimmed, sectionTitle: '', charOffset: 0 }];
  }
  return splitByTokenBudget(trimmed, target, overlap).map((text, i) => ({
    position: i,
    text,
    sectionTitle: '',
    charOffset: 0,
  }));
}
```

Signaturänderung ist rückwärtskompatibel (`opts` optional, Default identisch zu
`chunkSections()`s Defaults) — der einzige Aufrufer, `buildChunks()` (Zeile 144-148), ruft
`chunkProposal(stripFrontmatter(files.proposal).body)` ohne `opts` auf und bleibt unverändert.

```bash
npx vitest run scripts/openspec-embed.test.mjs -t "chunkProposal" --reporter=verbose
# expected: beide chunkProposal-Tests grün (kurzer Body weiterhin 1 Chunk, langer Body gesplittet)
```

## Task 3 — `estimateSlugTokenWorst()`: `{tokens, fileType}` statt nackter Zahl

**Datei:** `scripts/openspec-embed.mjs`, Zeilen 196-220 (Funktionsende, aktuell):

```js
  const chunks = buildChunks(files);
  let maxTokens = 0;
  for (const c of chunks) {
    const t = approxTokens(c.text);
    if (t > maxTokens) maxTokens = t;
  }
  return maxTokens;
}
```

Ersetzen durch:

```js
  const chunks = buildChunks(files);
  if (chunks.length === 0) return null;
  let maxTokens = 0;
  let maxType = null;
  for (const c of chunks) {
    const t = approxTokens(c.text);
    if (t > maxTokens) { maxTokens = t; maxType = c.fileType; }
  }
  return { tokens: maxTokens, fileType: maxType };
}
```

`estimateSlugTokenWorst()` hat genau einen Aufrufer im gesamten Repo: den `--count-skipped`-
Block in `main()` (Task 4) — die Rückgabetyp-Änderung von `number|null` auf
`{tokens, fileType}|null` bricht keine weiteren Konsumenten (per `grep -rn
estimateSlugTokenWorst scripts/ website/ tests/` vor dem Commit verifizieren, dass kein
zusätzlicher Call-Site außerhalb dieser Datei existiert).

```bash
npx vitest run scripts/openspec-embed.test.mjs -t "estimateSlugTokenWorst" --reporter=verbose
# expected: grün — worst.tokens und worst.fileType wie erwartet
```

## Task 4 — `--count-skipped`: typ-bewusste Schwelle + Slug-Liste

**Datei:** `scripts/openspec-embed.mjs`, Zeilen 388-410 (aktueller Block in `main()`):

```js
  if (countSkipped) {
    const CONTEXT_LIMIT = 2048;
    let contextSkips = 0;
    let otherSkips = 0;
    const changesDir = path.join(repoRoot, 'openspec', 'changes');
    if (existsSync(changesDir)) {
      for (const entry of readdirSync(changesDir)) {
        if (entry === 'archive') continue;
        const tasksPath = path.join(changesDir, entry, 'tasks.md');
        if (!existsSync(tasksPath)) continue;
        const raw = readFileSync(tasksPath, 'utf8');
        const { frontmatter } = stripFrontmatter(raw);
        if (!ACTIVE_STATUSES.includes(frontmatter.status)) continue;
        const worst = estimateSlugTokenWorst(entry, repoRoot);
        if (worst === null) { otherSkips++; continue; }
        if (worst > CONTEXT_LIMIT) {
          contextSkips++;
        }
      }
    }
    console.log(`skipped: ${contextSkips + otherSkips} documents (${contextSkips} context limit > ${CONTEXT_LIMIT} tokens, ${otherSkips} other reasons)`);
    console.log('Rebuild after context limit is resolved: task openspec:embed:backfill');
    process.exit(0);
  }
```

Ersetzen durch (typ-bewusste Schwelle: `PARTIAL_TOKEN_LIMIT` spiegelt exakt den in
`scripts/plan-lint.sh` bereits erzwungenen 7000-Token-Deckel für Partials, T002453-C;
`CONTEXT_LIMIT` bleibt 2048 für alle anderen Chunk-Typen — nach Task 2 strukturell
unerreichbar (max. ~450 Token je Chunk), also ein großzügiger Regressions-Wächter statt einer
aktiven Grenze, siehe `proposal.md` Punkt 3):

```js
  if (countSkipped) {
    const CONTEXT_LIMIT = 2048; // proposal/task_section/spec_section chunks (post-Task-2: max ~450)
    const PARTIAL_TOKEN_LIMIT = 7000; // matches scripts/plan-lint.sh T002453-C partial size gate
    let contextSkips = 0;
    let otherSkips = 0;
    const skippedSlugs = [];
    const changesDir = path.join(repoRoot, 'openspec', 'changes');
    if (existsSync(changesDir)) {
      for (const entry of readdirSync(changesDir)) {
        if (entry === 'archive') continue;
        const tasksPath = path.join(changesDir, entry, 'tasks.md');
        if (!existsSync(tasksPath)) continue;
        const raw = readFileSync(tasksPath, 'utf8');
        const { frontmatter } = stripFrontmatter(raw);
        if (!ACTIVE_STATUSES.includes(frontmatter.status)) continue;
        const worst = estimateSlugTokenWorst(entry, repoRoot);
        if (worst === null) { otherSkips++; continue; }
        const limit = worst.fileType === 'partial' ? PARTIAL_TOKEN_LIMIT : CONTEXT_LIMIT;
        if (worst.tokens > limit) {
          contextSkips++;
          skippedSlugs.push(`${entry} (~${worst.tokens} tokens, ${worst.fileType ?? 'unknown'})`);
        }
      }
    }
    console.log(`skipped: ${contextSkips + otherSkips} documents (${contextSkips} context limit > ${CONTEXT_LIMIT} tokens, ${otherSkips} other reasons)`);
    for (const line of skippedSlugs) console.log(`  - ${line}`);
    console.log('Rebuild after context limit is resolved: task openspec:embed:backfill');
    process.exit(0);
  }
```

```bash
npx vitest run scripts/openspec-embed.test.mjs -t "count-skipped" --reporter=verbose
# expected: grün — CLI-Test bestätigt genau 1 verbleibender Skip (der illegal übergroße Partial)
# und listet dessen Slug im Output
```

## Task 5 — Reales Repo gegenprüfen (kein Code-Änderung, nur Beleg)

Nach Task 2-4: die beiden real betroffenen Dokumente aus dem Ticket (`proposal.md` +
`design.md`-Recherche) dürfen nicht mehr auftauchen:

```bash
node scripts/openspec-embed.mjs --count-skipped
# expected: "skipped: 0 documents (0 context limit > 2048 tokens, 0 other reasons)" —
# weder zielfamilie-llm-stack noch fix-watchdog-sf26-vakuos-T002620 mehr gelistet
```

Bleibt ein Skip übrig (z. B. weil zwischenzeitlich ein neuer, tatsächlich übergroßer Partial
oder Proposal entstanden ist), ist das kein Plan-Fehler — Task 4s Slug-Liste macht den Fall
sofort identifizierbar, statt wie bisher stumm zu bleiben.

## Task F — Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil eine bestehende Test-Datei erweitert (nicht neu angelegt) wurde, ist
`task test:inventory` bereits Teil von `freshness:regenerate` — keine separate
`test-inventory.json`-Diff-Prüfung nötig, da keine neue Testdatei entstanden ist.

## Risiken

- **Rückwärtskompatibilität von `chunkProposal()`/`estimateSlugTokenWorst()`:** beide Funktionen
  sind `export`iert; ein externer Caller außerhalb dieser Datei würde durch die
  Signatur-/Rückgabetyp-Änderung brechen. Task 3 verlangt einen `grep`-Check vor dem Commit;
  aktuell (Stand Recherche) ist `main()` in derselben Datei der einzige Aufrufer.
- **Partials bleiben bewusst ungeteilt** (siehe Regressions-Anker in Task 1) — ein Leser könnte
  naiv annehmen, Chunking sei "die" Lösung für beide Dokumente; das Proposal begründet explizit,
  warum Partials stattdessen einen eigenen, höheren Deckel bekommen statt gesplittet zu werden.

## Out of Scope

- `scripts/openspec-embed-local.sh`, `scripts/openspec-embed-lib.sh` (neu),
  `.githooks/post-commit-embed` — vollständig Schwesterticket T002870
  (`openspec-embed-collection-T002870`): Port-Forward-Identität, Completeness-Gate-Eskalation,
  Rebase-Skip. Kein Dateiüberlapp mit diesem Plan.
- Anhebung des physischen Embedding-Backend-Limits (`-ub 8192`) — bewusst nicht Teil dieses
  Fixes; siehe `proposal.md` Punkt 3 für die Begründung, warum das die eigentliche Ursache
  verschleiert hätte statt sie zu beheben.
