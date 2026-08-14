---
title: "openspec-embed-slug-pcre — Implementation Plan"
ticket_id: T004829
domains: [plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-embed-slug-pcre — Implementation Plan

_Ticket: T004829_

**Goal:** `embed_output_is_success()` in `scripts/openspec-embed-lib.sh` matcht den
übergebenen Change-Slug literal als exakten Listeneintrag der missing-Liste — statt ihn
unescaped in eine PCRE zu interpolieren.

**Architecture:** Die missing-Liste der Completeness-Gate-WARN wird an `,` gesplittet,
jeder Eintrag getrimmt und per `grep -qxF "$slug"` exakt als Fixed-String geprüft.
Damit sind PCRE-Metazeichen im Slug wirkungslos (kein fail-open via grep-Syntaxfehler,
kein False-Positive via `.*`), und die Wortgrenzen-Semantik aus T004598
(`demo` ≠ `demo2`) bleibt über `-x` strukturell erhalten.

**Spec:** `openspec/changes/openspec-embed-slug-pcre/design.md` (Root-Cause, gewählter
Ansatz, Edge-Cases) und das Delta in
`openspec/changes/openspec-embed-slug-pcre/specs/openspec-embedding.md`
(MODIFIED auf „Wrapper success check fails on a completeness-gate warning").

## File Structure

```
scripts/openspec-embed-lib.sh                                    (modify — embed_output_is_success, Slug-Prüfung literal)
tests/spec/openspec-embedding/slug-literal-match-T004829.bats    (create — RED-Test, liegt bereits im Baum)
openspec/changes/openspec-embed-slug-pcre/specs/openspec-embedding.md  (modify — MODIFIED-Delta, liegt bereits im Baum)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test
      `tests/spec/openspec-embedding/slug-literal-match-T004829.bats` liegt bereits im
      Baum (Stage-Commit). Auf dem ungefixten Stand muss er in den beiden
      Bug-Fällen rot sein — Test 2 (`.*`-False-Positive) und Test 3
      (`demo(`-fail-open) — während Positiv-Anker (Test 1) und
      Wortgrenzen-Semantik (Test 4) grün bleiben. Der Test runner ist der
      vendored bats-Core-Pfad.

```bash
unset -f grep   # nur lokal nötig: Claude-Sandbox-grep-Shim neutralisieren, CI hat echtes grep
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/slug-literal-match-T004829.bats
# expected: FAIL (red — Tests 2 und 3 schlagen fehl, Tests 1 und 4 bestehen)
```

- [ ] **Fix-Step (GREEN).** `embed_output_is_success()` in
      `scripts/openspec-embed-lib.sh` auf den literal Match umstellen. Die
      Slug-Prüfung (Zeilen 35–43) ersetzt die PCRE-Interpolation:

```bash
  # Mit Slug: nur failen, wenn der Slug als exakter Eintrag in der
  # missing-Liste steht (literal Match — Metazeichen im Slug sind
  # wirkungslos; demo darf demo2 nicht matchen).
  local missing
  missing="$(printf '%s' "$warn" | grep -oP ':\s+\K[^:]*$' | head -1)"
  if [[ -z "$missing" ]] || ! printf '%s' "$missing" \
       | tr ',' '\n' | sed 's/^ *//; s/ *$//' \
       | grep -qxF "$slug"; then
    return 0
  fi
  return 1
```

Danach muss derselbe Testlauf grün sein:

```bash
unset -f grep   # nur lokal nötig (s.o.)
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/slug-literal-match-T004829.bats
# expected: PASS (green — alle 4 Tests bestehen)
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Commit & Push.** Production-Code-Fix mit `fix(openspec-embed):` committen —
      der Stage-Commit (`chore(plans):`) trägt bereits Test + Plan-Artefakte:

```bash
git add scripts/openspec-embed-lib.sh
git commit -m "fix(openspec-embed): slug literal in embed_output_is_success match [T004829]"
git push -u origin fix/openspec-embed-slug-pcre-T004829
```
