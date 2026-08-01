#!/usr/bin/env bats
#
# T002446 — touched_files beim stage-plan aus `## File Structure` ableiten.
#
# Bisher setzt erst `dev-flow-execute` Schritt 1.5 die Spalte, und zwar konditional
# ("Falls der Plan die berührten Dateien kennt"). Der Plan kennt sie immer: `## File Structure`
# ist plan-lint Hard Rule STRUCT1. Die Information liegt also schon beim Stagen zwingend vor,
# haengt aber an einem Prosa-Satz in einer Anleitung statt an Code.
# Live-Beleg: T002439 wurde am 2026-07-28 gestaged, File Structure im Plan, touched_files NULL.
#
# Der Parser muss DREI Formate beherrschen — so stehen sie in den 33 realen Plaenen:
#   1. Code-Fence mit NEW:/CHANGED:   (23 Plaene)
#   2. Bullet-Liste mit Backtick-Pfad  (~7)
#   3. Markdown-Tabelle                (~3)
# und Nicht-Pfade aussortieren: `fix-arena-db-url-secrets` listet `deployment/arena-server`,
# eine Cluster-Ressource ohne Repo-Entsprechung.
#
# Fixtures entstehen zur Laufzeit unter $BATS_TEST_TMPDIR — ein eingecheckter Beispielplan
# wuerde von plan-lint und den Plan-Watchdogs als echter Plan behandelt.

bats_require_minimum_version 1.5.0

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  DERIVE="${REPO_ROOT}/scripts/plan-touched-files.sh"
  FIX="${BATS_TEST_TMPDIR}"
}

# Ein Plangeruest mit beliebigem File-Structure-Rumpf. $1 = Zieldatei, danach der Rumpf via stdin.
_plan_with_fs() {
  local out="$1"
  {
    echo '# demo — Implementation Plan'
    echo
    echo '## File Structure'
    echo
    cat
    echo
    echo '## Tasks'
    echo
    echo '### 1. irgendwas'
  } > "$out"
}

# "Hat abgeleitet" heisst: gelaufen UND fuendig — nicht "Skript fehlt" (127).
_assert_derive_ran() {
  [ "$status" -ne 127 ]
  [ "$status" -eq 0 ]
}

@test "T002446: der Ableiter existiert als eigenstaendiges, ausfuehrbares Skript" {
  [ -f "$DERIVE" ]
  [ -x "$DERIVE" ]
}

@test "T002446: Code-Fence-Format (NEW/CHANGED) — die haeufigste Form" {
  _plan_with_fs "$FIX/fence.md" <<'PLAN'
```
NEW:
  scripts/plan-touched-files.sh          — neuer Ableiter
CHANGED:
  scripts/vda/ticket/stage-plan.sh       — ruft den Ableiter auf
```
PLAN

  run bash "$DERIVE" "$FIX/fence.md"
  _assert_derive_ran
  [[ "$output" == *"scripts/plan-touched-files.sh"* ]]
  [[ "$output" == *"scripts/vda/ticket/stage-plan.sh"* ]]
  # Die Beschreibung nach dem Gedankenstrich ist kein Pfad und darf nicht mitkommen.
  [[ "$output" != *"Ableiter"* ]]
}

@test "T002446: Bullet-Format mit Backtick-Pfaden" {
  _plan_with_fs "$FIX/bullet.md" <<'PLAN'
- `tests/spec/database.bats` (modified — RED-Baseline, keine weiteren Edits)
- `scripts/ticket.sh` — Commands-Zeile ergaenzen
PLAN

  run bash "$DERIVE" "$FIX/bullet.md"
  _assert_derive_ran
  [[ "$output" == *"tests/spec/database.bats"* ]]
  [[ "$output" == *"scripts/ticket.sh"* ]]
}

@test "T002446: Markdown-Tabellen-Format" {
  _plan_with_fs "$FIX/table.md" <<'PLAN'
| File | Action |
|------|--------|
| `k3d/brett.yaml` | Kommentar ueber der image-Zeile |
| `k3d/docs.yaml`  | Kommentar ueber der image-Zeile |
PLAN

  run bash "$DERIVE" "$FIX/table.md"
  _assert_derive_ran
  [[ "$output" == *"k3d/brett.yaml"* ]]
  [[ "$output" == *"k3d/docs.yaml"* ]]
  # Spaltenueberschriften sind keine Pfade.
  [[ "$output" != *"Action"* ]]
}

@test "T002446: Nicht-Pfade werden aussortiert, echte Pfade daneben bleiben" {
  # Realfall aus fix-arena-db-url-secrets: eine Cluster-Ressource ohne Repo-Entsprechung
  # steht neben einem echten Repo-Pfad. Der Positiv-Anker in derselben Fixture verhindert,
  # dass dieser Test auch dann besteht, wenn der Ableiter schlicht gar nichts liefert.
  _plan_with_fs "$FIX/mixed.md" <<'PLAN'
- `tests/spec/database.bats` (modified)
- Cluster-only change: `deployment/arena-server` in namespace `workspace-korczewski`
  auf dem `fleet`-Kontext (keine Repo-Dateien)
PLAN

  run bash "$DERIVE" "$FIX/mixed.md"
  _assert_derive_ran
  [[ "$output" == *"tests/spec/database.bats"* ]]   # Positiv-Anker zuerst
  [[ "$output" != *"deployment/arena-server"* ]]
  [[ "$output" != *"workspace-korczewski"* ]]
}

@test "T002446: Realfaelle aus dem Bestand — Extension-Tokens, Backtick-Reste, Pfad-Fragmente" {
  # Diese drei Faelle stammen NICHT aus dem Reissbrett, sondern aus einem Lauf gegen die 33
  # realen Plaene unter openspec/changes/. Handgeschriebene Fixtures waren zu sauber und
  # liessen alle drei durch:
  #   - `.sh`/`.md` — blosse Extensions aus S1-Budget-Tabellen im selben Abschnitt
  #   - `queue.sh`  — Basename aus Prosa, ohne Verzeichnisanteil
  #   - `specs/database.md` — Fragment eines echten Pfads (openspec/specs/database.md)
  _plan_with_fs "$FIX/real.md" <<'PLAN'
| Datei | Ist | Schwelle |
|---|---|---|
| `scripts/factory/queue.sh` | 200 | 500 |

Nur `.sh` unterliegt S1; `.bats` und `.md` stehen nicht in den Limits. Siehe auch
`queue.sh` und die Spec unter `specs/database.md`.
PLAN

  run bash "$DERIVE" "$FIX/real.md"
  _assert_derive_ran
  [[ "$output" == *"scripts/factory/queue.sh"* ]]   # Positiv-Anker zuerst
  # Blosse Extensions sind keine Pfade.
  [[ $(printf '%s\n' "$output" | grep -cx '\.sh') -eq 0 ]]
  [[ $(printf '%s\n' "$output" | grep -cx '\.md') -eq 0 ]]
  [[ $(printf '%s\n' "$output" | grep -cx '\.bats') -eq 0 ]]
  # Basename ohne Verzeichnisanteil ist ein Prosa-Fragment.
  [[ $(printf '%s\n' "$output" | grep -cx 'queue.sh') -eq 0 ]]
  # 'specs' existiert nicht im Repo-Wurzelverzeichnis — also ein Fragment, kein Pfad.
  [[ $(printf '%s\n' "$output" | grep -cx 'specs/database.md') -eq 0 ]]
}

@test "T002446: leere File-Structure meldet auf stderr und blockiert nicht" {
  _plan_with_fs "$FIX/empty.md" <<'PLAN'
Keine Dateien — reine Cluster-Operation.
PLAN

  # --separate-stderr: ohne das ist $stderr nicht gesetzt und die Assertion unten
  # wuerde am Fallback haengen statt am eigentlichen Kriterium.
  run --separate-stderr bash "$DERIVE" "$FIX/empty.md"
  # Nicht blockieren: plan-lint STRUCT1 ist das Gate fuer Plan-Struktur, nicht stage-plan.
  [ "$status" -eq 0 ]
  # Aber auch nicht still: ohne Meldung faellt die Luecke niemandem auf.
  [ -n "$stderr" ]
  # Und stdout bleibt leer — ein leerer Pfad darf nicht als Datei durchgereicht werden.
  [ -z "$output" ]
}

@test "T002446: stage-plan ruft den Ableiter auf und schreibt touched_files" {
  # Statischer Nachweis der Verdrahtung. Ohne ihn koennte der Ableiter perfekt
  # funktionieren und trotzdem nie laufen — genau die Luecke, die dieses Ticket behebt.
  local sp="${REPO_ROOT}/scripts/vda/ticket/stage-plan.sh"
  run grep -c "plan-touched-files" "$sp"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  run grep -c "touched_files" "$sp"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T002446: stage-plan ueberschreibt vorhandene touched_files nicht, sondern ergaenzt" {
  # Der Implementer beruehrt regelmaessig Dateien, die im Plan nicht standen.
  # dev-flow-execute Schritt 1.5 darf die Baseline erweitern; ein blindes UPDATE ... SET
  # aus dem Plan wuerde diese Ergaenzungen bei jedem erneuten stage-plan verwerfen.
  local sp="${REPO_ROOT}/scripts/vda/ticket/stage-plan.sh"
  run bash -c "grep -A 6 'touched_files' '$sp' | grep -cE 'COALESCE|array_cat|UNION|\\|\\|'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
