# P3 — plan-lint --rules + Factory-Injektion

Rolle: **impl**. Disjunkter Partial des Change `cross-harness-plan-guardrails` (T003267),
Komponente 3 aus `design.md`: der Linter selbst wird zur kanonischen Quelle der
Hard-Rule-Prosa (`--rules`), und die Factory injiziert diese Prosa in den
`plan:decompose`-Prompt, damit das lokale Modell (`gemma26-factory`) die Regeln **vor**
dem ersten Schreibversuch kennt statt sie vom roten Linter zu lernen. Tests
(`tests/spec/dev-flow-plan/plan-lint-rules.bats`) und die Verify-Kette trägt der
tests-Partial bzw. der Index — hier stehen bewusst KEINE Failing-Test- und Verify-Tasks.

Architektur-Randbedingung, die diesen Partial prägt: `scripts/factory/pipeline.mjs`
läuft als Workflow-Sandbox-Modul **ohne Node-APIs** — die Datei hat keinerlei
`import`/`require`, guarded sogar `typeof process` (Kopfbereich), und der
`runRunner`-Header (Z. 35–37) dokumentiert ausdrücklich: „Delegate any
Node-API-requiring operation to pipeline-runner.js (host-side, has
require/fs/child_process) by spawning an agent that shells out to it". Ein direkter
`execSync`-Aufruf in `pipeline.mjs` ist dort also **nicht möglich**. Ein neues
Runner-Kommando in `scripts/factory/pipeline-runner.js` scheidet ebenfalls aus: die
Datei gehört nicht zu den target_files dieses Partials (D1-Disjunktheit). Der
architekturkonforme Ersatz mit identischer Fehlersemantik (try/catch → leerer String +
Log) ist ein Agent-Shell-out nach dem im Repo etablierten `runRunner`-Prompt-Muster —
Task P3.3.

---

## File `scripts/plan-lint.sh` (edit)

- Sprache: bash · S1-Limit 800 · Ist-LOC 533 · Baseline: keine · **Budget 267**
  (der Diff bringt netto ~+35 Zeilen → neue LOC ~568, weit unter der wirksamen Schwelle).
- Neuer Modus `--rules`: druckt die Hard Rules als kompakte, prompt-taugliche Prosa auf
  stdout und exitet 0. Verlangt **keine** Plan-Datei und keine `baseline.json` (der
  fail-closed-Check auf beide greift erst im Prüfmodus).
- **SSOT-Ansatz (begründet, kleinster Diff):** Konstanten-Extraktion statt vollständiger
  Meldungs-Extraktion. Die Drift-Gefahr zwischen Prüf- und Prosa-Modus liegt in den
  **Parametern** der Regeln — Key-Listen (F1), Kommando-Listen (STRUCT3), Runner- und
  Placeholder-Regexe (STRUCT2, P1), Split-Keywords (B1b), Token-Limit (T002453-C) —
  nicht in den Satz-Skeletten der Diagnosen („missing required key '\$key'"). Genau diese
  Parameter werden einmalig als Variablen herausgezogen und von **beiden** Modi benutzt;
  die parametrischen `hard()`-Meldungen behalten ihre dynamischen Teile. Vollständige
  Meldungs-Extraktion müsste ~25 `hard()`-Aufrufe umschreiben, ohne zusätzlichen
  Drift-Schutz zu liefern (die Diagnose-Sätze sind nicht das, was ein Plan-Autor vorab
  wissen muss).

### Task P3.1 — Regel-Parameter als geteilte Konstanten extrahieren

- [ ] Füge nach den Budget-Helfern (hinter `residual_budget()`, vor dem
      `residual_budget`-Subkommando-Dispatch ~Z. 101) einen Konstanten-Block ein:

```bash
# --- rule constants: single source for the check blocks AND --rules prose ---
F1_KEYS="title ticket_id domains status"
STRUCT2_RUNNERS_RE='\b(bats|vitest|pytest|jest|mocha|go test|playwright test|node --test)\b'
STRUCT3_CMDS="test:changed freshness:regenerate freshness:check"
P1_RE='\b(TBD|TODO|FIXME)\b|\?\?\?|<ausfüllen>|similar to Task [0-9]'
B1B_SPLIT_RE='split|extract|verkleiner|shrink|aufteil'
PARTIAL_TOKEN_LIMIT=7000
```

- [ ] Stelle die bestehenden Regel-Blöcke auf diese Konstanten um (verhaltensneutral,
      Meldungstexte unverändert):
      - F1-Schleife: `for key in $F1_KEYS; do` (statt der Literal-Liste).
      - STRUCT2: der Runner-Grep nutzt `grep -qiE "$STRUCT2_RUNNERS_RE"`.
      - STRUCT3: die drei Einzel-Greps werden eine Schleife
        `for cmd in $STRUCT3_CMDS; do grep -qE "task[[:space:]]+$cmd" "$PLAN" || hard "STRUCT3: verify task missing 'task $cmd'"; done`.
      - P1: `grep -nE "$P1_RE" <<<"$PLAN_PROSE_NOCODE"`.
      - B1b: `grep -qiE "$B1B_SPLIT_RE" "$PLAN"`.
      - T002453-C: Vergleich und Meldung nutzen `$PARTIAL_TOKEN_LIMIT`.
- [ ] Selbst-Check (P3-lokal, kein Test-Task): Prüfmodus bleibt verhaltensgleich —
      `bash scripts/plan-lint.sh openspec/changes/archive/2026-07-22-factory-parallel-status/tasks.md`
      liefert vorher wie nachher dasselbe Verdict.

### Task P3.2 — `_print_rules()` + `--rules`-Dispatch

- [ ] Definiere direkt unter dem Konstanten-Block die Funktion `_print_rules()` — eine
      Heredoc, die ausschließlich aus den P3.1-Konstanten interpoliert. Gewünschter
      Output wörtlich (englisch, wie die Prüfmeldungen und der decompose-Prompt):

```
PLAN-LINT HARD RULES (fail-closed; any violation = exit 1). Write the plan to satisfy ALL of these:
F1: YAML frontmatter at the very top with non-empty keys: title, ticket_id, domains, status.
F2: 'domains' must be a non-empty YAML list (not '', not [], not null).
STRUCT1: after the frontmatter: H1 '# <slug> — Implementation Plan', then an H2 section '## File Structure' listing changed/new files.
STRUCT2: at least one task runs a real test runner (\b(bats|vitest|pytest|jest|mocha|go test|playwright test|node --test)\b) and expects it to FAIL first. The final 'task test:*' verify does NOT count.
STRUCT3: the last task lists verbatim: task test:changed; task freshness:regenerate; task freshness:check.
STRUCT-PARTIAL: if tasks.d/ exists next to tasks.md, tasks.md needs a '## Partials' manifest table; every referenced partial file must exist; the last row's role is 'tests'.
D1: no file may appear in the target_files of two partials (disjoint split).
D2: depends_on may only reference existing partial ids and must be acyclic.
I1: intel.json must exist in the change dir, be valid JSON with meta/impact_files/symbols, and cover every target_file.
P1: no open placeholders in prose outside code fences/inline code (regex: \b(TBD|TODO|FIXME)\b|\?\?\?|<ausfüllen>|similar to Task [0-9]).
B1a: any numeric budget claimed for an existing file must EXACTLY equal the computed effective budget (max(extension limit, baseline) - current lines). When unsure, claim no number.
B1b (warn): if a file's effective budget is <= 0, plan a real split/shrink step (keywords: split|extract|verkleiner|shrink|aufteil).
T002453-C: every tasks.d/ partial stays <= 7000 tokens (~28000 chars) - split the slot otherwise.
```

      Umsetzungshinweise: unquoted Heredoc-Delimiter, damit `${F1_KEYS// /, }`,
      `${STRUCT2_RUNNERS_RE}`, `${P1_RE}`, `${B1B_SPLIT_RE}`, `${PARTIAL_TOKEN_LIMIT}`
      und `$((PARTIAL_TOKEN_LIMIT*4))` interpolieren; die STRUCT3-Zeile baut sich aus
      `$STRUCT3_CMDS` (z. B. via `$(for c in $STRUCT3_CMDS; do printf 'task %s; ' "$c"; done)`).
      Die Regel-IDs selbst stehen als Literale in der Heredoc — sie sind zugleich die
      Präfixe der `hard()`-Meldungen und ändern sich nur zusammen mit dem Regel-Block.
- [ ] Dispatch **vor** der `--json`-/`PLAN`-Argumentbehandlung (nach dem
      `PLAN_LINT_SELFTEST`-Hook, ~Z. 117) einfügen — dadurch wird nie eine Plan-Datei
      oder `baseline.json` verlangt:

```bash
if [[ "${1:-}" == "--rules" ]]; then _print_rules; exit 0; fi
```

- [ ] Usage-Strings nachziehen: Header-Kommentar Z. 3 und die `${1:?Usage: …}`-Meldung
      (Z. 120) um `--rules` erweitern
      (`Usage: plan-lint.sh [--json] <plan-file> | --rules | residual_budget <file>`).
- [ ] Selbst-Check: `bash scripts/plan-lint.sh --rules` → Exit 0, ausschließlich die
      Regel-Prosa auf stdout, und `bash scripts/plan-lint.sh --rules | grep -cE '^(F1|F2|STRUCT1|STRUCT2|STRUCT3|STRUCT-PARTIAL|D1|D2|I1|P1|B1a|B1b|T002453-C):'`
      ergibt 13. Läuft auch aus fremdem cwd (`cd /tmp && bash <repo>/scripts/plan-lint.sh --rules`).

---

## File `scripts/factory/pipeline.mjs` (edit)

- Sprache: javascript · S1-Limit 800 · Ist-LOC 717 · Baseline: keine · **Budget 83 —
  KNAPP.** Die Änderung MUSS klein bleiben: Ziel ≤ ~15 Netto-Zeilen, **kein Refactor von
  `pipeline.mjs` in diesem Change**. Sollte die Datei durch parallele Changes wachsen,
  gilt: dieser Diff bleibt bei seiner Minimalform, es wird nichts „bei der Gelegenheit"
  mitumgebaut.
- Abweichung von der Vorgabe „execSync mit try/catch": siehe Kontext-Absatz oben —
  `execSync` ist in dieser Sandbox-Datei nicht verfügbar. Der Ersatz ist ein
  Agent-Shell-out im etablierten `runRunner`-Prompt-Stil („CRITICAL: Run this EXACT
  shell command via Bash tool …"), mit derselben geforderten Fehlersemantik: try/catch,
  Fallback auf leeren String, `log()`-Zeile. `log` ist ein Sandbox-Global (bereits
  vielfach benutzt, z. B. Z. 304/308).
- Die bestehende Schleife `plan-lint-check` → eine LLM-Fix-Iteration → `plan-lint-block`
  (Z. 345–361) bleibt **unangetastet** — sie ist das Netz unter der neuen Vorab-Injektion.

### Task P3.3 — Hard-Rules-Prosa vor dem plan:decompose-Prompt injizieren

- [ ] Füge im Nicht-REUSE-Plan-Pfad unmittelbar **vor**
      `const injections = await consumeInjections('plan')` (~Z. 322) ein:

```js
// [T003267] Hard rules BEFORE writing: feed plan-lint's canonical rule prose to
// the local model so it does not learn the rules from a red linter afterwards.
// No Node APIs in this sandbox (see runRunner header) — agent shell-out, fail-open.
let planRules = ''
try {
  const rulesOut = await agent(
    `CRITICAL: Run this EXACT shell command via Bash tool. Return ONLY its raw stdout. No explanation, no commentary.
Command:
bash ${REPO}/scripts/plan-lint.sh --rules`,
    { label: 'plan:rules', phase: 'Plan', model: FACTORY_MODEL },
  )
  if (rulesOut) planRules = `\n\n${String(rulesOut).trim()}`
} catch { log('plan:rules fetch failed — decompose runs without rule injection') }
```

- [ ] Hänge die Prosa an den decompose-Prompt an — die bestehende Zeile
      `` Return JSON { tasks: [...], plan_path: "<absolute path>" }` + injections, `` wird zu
      `` … }` + planRules + injections, ``. Netto-Diff des Tasks: ~+14 Zeilen, 1 Zeile
      geändert — innerhalb des 83er-Budgets mit deutlicher Reserve für die anderen
      Partials dieses Change, die dieselbe Datei NICHT anfassen (D1).
- [ ] Fail-open ist hier richtig (anders als bei den Preflight-Guards dieses Change):
      die Injektion ist eine Qualitätshilfe, kein Gate — das Gate bleibt die
      unveränderte plan-lint-Schleife darunter. Ein fehlgeschlagener `--rules`-Fetch
      darf die Pipeline deshalb nicht blocken, wird aber geloggt.
- [ ] Selbst-Check: `node --check scripts/factory/pipeline.mjs`.

---

## Scope-Grenzen (nicht in P3)

- Kein Eingriff in `scripts/factory/pipeline-runner.js` (gehört keinem P3-target_file;
  das `plan-lint-check`-Kommando dort bleibt wie es ist).
- Keine Injektion in den `plan:reuse`-Pfad (Z. 418 ff.) — der liest einen bereits von
  Menschen geplanten, gelinteten Plan und schreibt keinen neuen.
- Keine Änderung an `plan-quality-gates.md` (bleibt menschenlesbare Tiefenreferenz,
  design.md Komponente 3) und keine Skill-Prosa-Umbauten — andere Partials.
- Keine BATS-Datei (`plan-lint-rules.bats` liegt beim tests-Partial) und keine
  Verify-Kette (Index).
