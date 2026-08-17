---
title: "fix-alibaba-token-key-guard-tmpdir — Implementation Plan"
ticket_id: T011580
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-alibaba-token-key-guard-tmpdir — Implementation Plan

_Ticket: T011580_

## File Structure

| Datei | Status | S1-Budget |
|---|---|---|
| `tests/spec/security/alibaba-token-key-guard.bats` | modified — Bestandsdatei, kein neuer Test-Anhang (T002416) | Ist 51 Zeilen, nicht baselined, Extension `.bats` nicht in `s1.limits` → kein S1-Budget (ungated) |
| `openspec/changes/fix-alibaba-token-key-guard-tmpdir/specs/secrets-deploy-automation.md` | MODIFIED-Delta (bereits geschrieben) | — |
| `openspec/changes/fix-alibaba-token-key-guard-tmpdir/design.md`, `proposal.md`, `tasks.md` | Change-Set | — |

S1-Budget-Ermittlung (verifiziert am 2026-08-17 im Worktree):

```bash
wc -l tests/spec/security/alibaba-token-key-guard.bats    # → 51
jq -r '."S1:tests/spec/security/alibaba-token-key-guard.bats"' docs/code-quality/baseline.json   # → null (nicht baselined)
grep -A15 '  limits:' docs/code-quality/gates.yaml        # → kein .bats-Eintrag, Extension ungated
```

`.gitleaks.toml` bleibt unverändert — Referenz-Kontext, kein Teil des Change-Sets (die dokumentierte T002554-Entscheidung wird respektiert).

## Task 1: RED — vakuos-roten Zustand auf origin/main reproduzieren

**Ziel:** Belegen, dass Test 1 des Alibaba-Token-Key-Guards auf dem Basis-Stand (origin/main) dauerhaft rot ist: gitleaks findet den Fixture-Key in `$BATS_TEST_TMPDIR` nicht, weil die Allowlist `.*tmp.*` (T002554) den Pfad unter `/tmp` matcht — der Test prüft damit nichts mehr. Der Testlauf läuft gegen einen Scratch-Tree aus `git archive origin/main`; der Arbeitsbaum bleibt unangetastet.

```bash
BASE="$(mktemp -d /dev/shm/alk-red.XXXXXX 2>/dev/null || mktemp -d)"
trap 'rm -rf "$BASE"' EXIT
git -C . archive --format=tar origin/main | tar -x -C "$BASE"
tests/unit/lib/bats-core/bin/bats "$BASE/tests/spec/security/alibaba-token-key-guard.bats"
# expected: FAIL — Test 1 rot: die Assertion [ "$status" -eq 1 ] schlägt fehl
# (gitleaks Exit 0 "no leaks found" statt Exit 1 — der Fund wird allowlisted).
# Test 2 (agent-models.jsonc) bleibt grün — der Defekt sitzt nur in Test 1.
```

**REPRO-Zusatz** — gitleaks 8.18.2 direkt gegen die Fixture-Kopie, Pfad-Kontrast (verifiziert 2026-08-17):

```bash
cp tests/spec/security/fixtures/alibaba-token-key-leak.txt /tmp/alk.txt
gitleaks detect --config .gitleaks.toml --no-git --source /tmp/alk.txt >/dev/null 2>&1
echo "EXIT=$? — /tmp-Kopie: 0, Fund allowlisted (Bug)"
cp tests/spec/security/fixtures/alibaba-token-key-leak.txt /dev/shm/alk.XXXX
gitleaks detect --config .gitleaks.toml --no-git --source /dev/shm/alk.XXXX >/dev/null 2>&1
echo "EXIT=$? — /dev/shm-Kopie: 1, Fund gemeldet (erwartetes Verhalten)"
rm -f /tmp/alk.txt /dev/shm/alk.XXXX
```

## Task 2: GREEN — Fixture-Scan in ein Verzeichnis ohne tmp-Segment verlagern

**Ziel:** Test 1 kopiert die Fixture künftig nach `mktemp -d /dev/shm/alk.XXXXXX` statt nach `$BATS_TEST_TMPDIR`. `/dev/shm` (tmpfs außerhalb des Repos) matcht kein Allowlist-Muster und taucht nie im `--no-git`-Arbeitsbaum-Scan des Pre-Commit-Hooks auf. Die Korrektur liegt im Arbeitsbaum dieses Branches bereits vor (uncommitted) — dieser Schritt ist Diff-Prüfung, Testlauf und Commit.

Die Änderung in `tests/spec/security/alibaba-token-key-guard.bats` (Test 1, Fixture-Kopie + Scan):

```bash
[ -d /dev/shm ] || skip "kein /dev/shm vorhanden — Test braucht einen Scan-Pfad ohne 'tmp'-Segment"
SCAN_DIR="$(mktemp -d /dev/shm/alk.XXXXXX)"
cp "$REPO_ROOT/tests/spec/security/fixtures/alibaba-token-key-leak.txt" "$SCAN_DIR/"
run gitleaks detect --config "$GITLEAKS_CONFIG" --no-git \
  --source "$SCAN_DIR/alibaba-token-key-leak.txt" 2>&1
[ "$status" -eq 1 ]
[[ "$output" == *"leaks found"* ]]
```

Cleanup über eine `teardown()`-Funktion statt `trap ... EXIT` im Testkörper (Review-Befund 2026-08-18): bats-core überschreibt den EXIT-trap des Tests (bats-exec-test) — der trap feuert nie und jeder Lauf leakte ein `alk.*`-Verzeichnis nach /dev/shm. `teardown()` läuft bei Pass UND Fail. Der if-Block (statt `&&`-Einzeiler) ist Pflicht: eine false-Bedingung als letzte Zeile endet mit Exit 1 und bats färbt den Test als teardown-Fehler, obwohl die Testlogik grün war:

```bash
teardown() {
  if [ -n "${SCAN_DIR:-}" ]; then
    rm -rf "$SCAN_DIR"
  fi
}
```

Prüfschritte:

1. Diff gegen den Basis-Stand prüfen: `git diff tests/spec/security/alibaba-token-key-guard.bats` — geändert ist nur der Fixture-Scan-Pfad in Test 1 (plus Kommentar), die gitleaks-Allowlist-Datei ist nicht berührt.
2. Testlauf (muss grün sein — beide Tests ok, Exit 0) plus Cleanup-Check (teardown() darf keinen `alk.*`-Rest in /dev/shm hinterlassen):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security/alibaba-token-key-guard.bats
ls -d /dev/shm/alk.* 2>/dev/null | wc -l   # erwartet 0 — teardown() räumt auf
```

3. Committen (Change-Set inkl. Delta-Spec) — der Stage-Commit trägt `chore(plans):`, weil sein Diff nur Test-/Plan-Artefakte enthält (commit-vs-diff-Guard blockiert `fix(…)`-Präfixe für reine Test/Plan-Diffs; T001434). Der Implementer führt diesen Commit nur aus, falls der Stage-Commit ihn nicht bereits enthält:

```bash
git add tests/spec/security/alibaba-token-key-guard.bats openspec/changes/fix-alibaba-token-key-guard-tmpdir/
git commit -m "chore(plans): Alibaba-Token-Guard scannt Fixture in /dev/shm statt /tmp [T011580]"
```

Das MODIFIED-Delta `specs/secrets-deploy-automation.md` (Requirement "gitleaks-Gegenscan", Scenario "BATS positive tests scan fixtures outside allowlisted paths") ist bereits geschrieben und Teil des Change-Sets — kein weiterer Spec-Schritt.

## Task 3: Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
task openspec:validate
```

- `test:changed` deckt die geänderte Test-Datei ab (BATS-Selection + quality).
- `freshness:regenerate` aktualisiert generierte Artefakte; `freshness:check` ist das CI-Äquivalent inkl. S1–S4-Ratchet — die Testdatei ist ungated und nicht baselined, es besteht kein Baseline-Risiko.
- `openspec:validate` ist das fail-closed-Spec-Gate des Repos und prüft das MODIFIED-Delta.
