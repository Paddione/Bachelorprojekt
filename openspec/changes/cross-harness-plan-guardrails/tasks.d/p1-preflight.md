# P1 — plan-preflight.sh

Rolle: **impl** (Guard-Skript). Disjunkter Partial des Change `cross-harness-plan-guardrails`
(T003267). Dieser Partial liefert ausschließlich das neue Skript `scripts/plan-preflight.sh` —
die fail-closed Bündelung der bisher als Markdown-Copy-Paste in `dev-flow-plan` Schritt 5
lebenden Pre-Commit-Guards (T001268, Lock-Fallback T003102) und des Merged-Preflights
(T002279). Die Flow-Skills werden erst in Partial p5 auf die Skript-Aufrufe umgestellt; die
BATS-Abdeckung (Temp-Git-Fixtures, Positiv-Anker) trägt Partial p6 — hier stehen bewusst
KEINE Failing-Test- oder Verify-Tasks.

Reale Quellen, gegen die dieser Partial geschrieben ist:

- `.claude/skills/dev-flow-plan/SKILL.md` Schritt 5 (Zeilen 204–229): die drei Checks
  (nicht-main, clean tree, Lock-Match) inkl. der T003102-Fallback-Logik
  `ticket__<id>.json` → `branch__<branch-slug>.json` und dem `jq -r '.branch'`-Vergleich.
- `scripts/agent-lock.sh` / `scripts/agent-lock-merged.sh`: `check-merged <ticket_id>` mit
  Exit 0 = nicht auf main gefunden (fortfahren), 1 = auf main gemergt, 2 = Usage-/Umgebungsfehler
  (fehlendes `origin/main`, falsches ID-Format). Lock-Verzeichnis ist `agent-locks/` unter dem
  **git-common-dir**, absolut normalisiert (Worktrees haben `.git` als Datei — Muster
  `_lock_dir()` in `agent-lock.sh:78-86`).
- Stilvorlage: `scripts/plan-touched-files.sh` (Kopfkommentar mit Warum, Verwendung, Exit-Semantik).

Vertrag (SSOT: `design.md` → Komponente 1): Exit 0 = alle Checks grün, 1 = Guard verletzt,
2 = Usage-/Umgebungsfehler. Jede Fehlermeldung ist EINE Zeile — was fehlt + welcher Befehl es
behebt. Keine stillen stderr-Warnungen bei gleichzeitigem Erfolgs-Exit (T002673-Falle).

---

## File `scripts/plan-preflight.sh` (net-new)

- Sprache: Bash · S1-Limit 800 · Baseline: keine (net-new) · **Budget 800** (komfortabel;
  Zielumfang ~120 Zeilen).
- `set -euo pipefail` (Vorgabe aus design.md — bewusst strenger als `agent-lock.sh`,
  das ohne `-e` läuft: dieses Skript ist ein reiner Prüfer ohne Registry-Schreibpfade,
  ein unerwarteter Kommandofehler soll es hart beenden).
- Harness-agnostisch: keine Claude-/opencode-spezifischen Env-Variablen, kein LLM-Aufruf.
- Abhängigkeiten: `git`, `jq` (für das `.branch`-Feld der Lock-JSON). Fehlendes `jq` ist
  Umgebungsfehler → Exit 2, nicht Exit 1.

### Task P1.1 — Skript-Gerüst: Kopfkommentar, Usage, Argument-Parsing, Dispatch

- [ ] Lege `scripts/plan-preflight.sh` an (Kopf + Gerüst wörtlich):

```bash
#!/usr/bin/env bash
# scripts/plan-preflight.sh — fail-closed Plan-Stage-Guards als Subkommandos. [T003267]
#
# Warum: Die Pre-Commit-Checks aus dev-flow-plan Schritt 5 (T001268, Lock-Fallback
# T003102) und der Merged-Preflight (T002279) existierten nur als Markdown-Snippets,
# die jede Runtime (Claude Code, opencode, agy, Factory) einzeln kopieren musste —
# mit dokumentierter Guard-Drift im opencode-Pfad. Dieses Skript ist der eine
# ausfuehrbare Ort; die Skill-Prosa erklaert das Warum, das Skript erzwingt das Was.
#
# Verwendung:
#   plan-preflight.sh pre-commit   --ticket <TICKET_EXT_ID>
#   plan-preflight.sh pre-worktree --ticket <TICKET_EXT_ID>
#
# Exit: 0 = alle Checks gruen · 1 = Guard verletzt · 2 = Usage-/Umgebungsfehler.
# Jede Fehlermeldung ist EINE Zeile: was fehlt + welcher Befehl es behebt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: ${0##*/} {pre-commit|pre-worktree} --ticket <TICKET_EXT_ID>" >&2
  exit 2
}

# Guard verletzt: eine Zeile, Exit 1.
fail() { echo "FEHLER: $*" >&2; exit 1; }
# Umgebungsfehler: eine Zeile, Exit 2.
envfail() { echo "FEHLER: $*" >&2; exit 2; }

SUBCMD="${1:-}"; shift 2>/dev/null || true
TICKET=""
while [ $# -gt 0 ]; do case "$1" in
  --ticket) TICKET="${2:-}"; shift 2 2>/dev/null || usage;;
  *) echo "FEHLER: unbekanntes Argument '$1'" >&2; usage;;
esac; done

[ -n "$TICKET" ] || usage
case "$TICKET" in
  T[0-9][0-9][0-9][0-9][0-9][0-9]) : ;;
  *) envfail "Ticket-ID '$TICKET' hat nicht das Format T###### — Abhilfe: die external_id aus 'bash scripts/ticket.sh get --id <id>' verwenden." ;;
esac

case "$SUBCMD" in
  pre-commit)   cmd_pre_commit ;;
  pre-worktree) cmd_pre_worktree ;;
  *) usage ;;
esac
```

- [ ] Die beiden `cmd_*`-Funktionen (P1.2–P1.4) stehen im fertigen Skript **vor** dem
      Dispatch-`case` (Bash löst Funktionsnamen erst beim Aufruf auf, aber die Definitionen
      müssen textuell vor dem `case`-Block liegen, weil das Skript top-level dispatcht).
- [ ] Ticket-Format-Validierung spiegelt bewusst das Muster aus `cmd_check_merged`
      (`agent-lock-merged.sh:27-30`), damit `pre-worktree` das Format-Exit-2 nicht erst
      im Wrapper-Callee produziert.

### Task P1.2 — `pre-commit`: HEAD-≠-main- und Clean-Tree-Check

- [ ] Beginn von `cmd_pre_commit()` — Checks (a) und (b) aus dev-flow-plan Schritt 5,
      Fehlertexte wörtlich:

```bash
cmd_pre_commit() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" \
    || envfail "kein Git-Repo im aktuellen Verzeichnis — Abhilfe: in den Worktree wechseln (cd .worktrees/<slug>)."
  [ "$branch" != "HEAD" ] \
    || fail "detached HEAD — plan-stage braucht einen Branch; Abhilfe: git checkout <feature-branch>."
  [ "$branch" != "main" ] \
    || fail "HEAD ist 'main' — plan-stage Commits auf main sind verboten; Abhilfe: bash scripts/worktree-create.sh <slug> und dort committen."
  [ -z "$(git status --porcelain)" ] \
    || fail "working tree ist nicht sauber — Abhilfe: erst 'git stash' oder 'git add … && git commit', dann plan-preflight erneut ausfuehren."
  # … Lock-Check folgt (Task P1.3)
}
```

- [ ] Reihenfolge beibehalten: detached-HEAD vor dem main-Check (sonst maskiert der
      String-Vergleich gegen `main` den kaputteren Zustand), Clean-Tree als letztes der
      drei Vor-Checks — identisch zur Snippet-Reihenfolge in der Skill, damit p5 beim
      Umstellen keinen Verhaltensunterschied erzeugt.

### Task P1.3 — `pre-commit`: agent-lock-Claim-Existenz + Branch-Match [T001268, T003102]

- [ ] Fortsetzung von `cmd_pre_commit()` — Lock-Verzeichnis absolut am git-common-dir
      verankern (Muster `_lock_dir()` aus `agent-lock.sh`), dann bevorzugt ticket-scoped,
      Fallback branch-scoped:

```bash
  command -v jq >/dev/null 2>&1 \
    || envfail "jq fehlt (wird fuer das .branch-Feld der Lock-Datei gebraucht) — Abhilfe: sudo apt-get install -y jq."
  local toplevel common lock_dir slug lock_file claimed
  toplevel="$(git rev-parse --show-toplevel)"
  common="$(cd "$toplevel" && git rev-parse --git-common-dir)"
  case "$common" in /*) : ;; *) common="$(cd "$toplevel/$common" && pwd)";; esac
  lock_dir="${AGENT_LOCK_DIR:-$common/agent-locks}"
  slug="${branch//\//-}"
  lock_file="$lock_dir/ticket__${TICKET}.json"
  [ -f "$lock_file" ] || lock_file="$lock_dir/branch__${slug}.json"
  [ -f "$lock_file" ] \
    || fail "kein agent-lock-Claim fuer $TICKET (weder ticket__${TICKET}.json noch branch__${slug}.json in $lock_dir) — Abhilfe: bash scripts/agent-lock.sh claim ticket $TICKET --label dev-flow-plan --worktree . ."
  claimed="$(jq -r '.branch // empty' "$lock_file" 2>/dev/null || true)"
  [ "$claimed" = "$branch" ] \
    || fail "Branch-Mismatch: Lock $(basename "$lock_file") traegt branch='$claimed', HEAD='$branch' — Abhilfe: bash scripts/agent-lock.sh claim ticket $TICKET --branch $branch (refresht den eigenen Claim mit korrektem Branch)."
  echo "plan-preflight pre-commit: OK (branch=$branch, lock=$(basename "$lock_file"), ticket=$TICKET)"
  exit 0
```

- [ ] `AGENT_LOCK_DIR`-Override respektieren (gleiche Test-Umgebungsvariable wie
      `agent-lock.sh` selbst) — genau darüber baut p6 seine Temp-Fixtures, ohne die echte
      Lock-Registry der laufenden Session anzufassen.
- [ ] Der Branch-Slug ist exakt die Skill-Definition (`/` → `-`, `sed 's#/#-#g'`-äquivalent
      als Bash-Substitution). Bewusst NICHT `_sanitize` aus `agent-lock.sh` nachbauen
      (das ersetzt zusätzlich Leerzeichen): Branch-Namen mit Leerzeichen existieren im
      Git-Refformat nicht, und die Skill-Prosa definiert nur die `/`-Ersetzung — die
      Lock-DATEI wurde von `agent-lock.sh claim branch <name>` erzeugt, dessen `_sanitize`
      für refs-konforme Namen dasselbe Ergebnis liefert.
- [ ] Die Mismatch-Abhilfe nutzt, dass `cmd_claim` beim eigenen Lock die per Flag
      übergebenen Felder neu schreibt (`agent-lock.sh:394-401`) — ein erneuter Claim mit
      `--branch` repariert also einen Lock mit leerem/altem `branch`-Feld, statt an
      Idempotenz abzuprallen.

### Task P1.4 — `pre-worktree`: check-merged-Wrapper mit durchgereichten Exit-Codes [T002279]

- [ ] `cmd_pre_worktree()` wörtlich:

```bash
cmd_pre_worktree() {
  local rc=0
  bash "$SCRIPT_DIR/agent-lock.sh" check-merged "$TICKET" || rc=$?
  case "$rc" in
    0) ;;  # nicht auf main — check-merged hat "safe to proceed" bereits gemeldet
    1) echo "FEHLER: $TICKET ist bereits auf main gemergt — Abhilfe: bash scripts/ticket.sh update-status --id $TICKET --status done --resolution shipped und KEINEN Worktree anlegen." >&2 ;;
    *) echo "FEHLER: check-merged Umgebungsfehler (rc=$rc, origin/main fehlt oder ID-Format) — Abhilfe: git fetch origin main und erneut ausfuehren." >&2 ;;
  esac
  exit "$rc"
}
```

- [ ] Exit-Codes werden 1:1 durchgereicht (`exit "$rc"`), NICHT auf 0/1 plattgedrückt:
      der Aufrufer (p5-Skill-Prosa, p6-Tests) unterscheidet „schon gemergt" (1, Ticket
      schließen und abbrechen) von „Umgebung kaputt" (2, reparieren und wiederholen).
      Das `|| rc=$?` ist unter `set -e` die einzige zulässige Form, den Callee-Exit
      abzugreifen, ohne das eigene Skript abzubrechen.
- [ ] `check-merged` schreibt seine Diagnose (Commit-Subjects bzw. „NOT found") selbst auf
      stdout/stderr — der Wrapper ergänzt nur die einzeilige Abhilfe-Zeile, er dupliziert
      die Diagnose nicht.

### Task P1.5 — Ausführbarkeit, Syntax-Selbstcheck, Referenzierbarkeits-Notiz (S4)

- [ ] `chmod +x scripts/plan-preflight.sh` und Selbst-Check (P1-lokal, kein STRUCT-Step):
      `bash -n scripts/plan-preflight.sh` fehlerfrei; danach ein manueller Grün-Smoke im
      Worktree mit gesetztem Claim:

```bash
bash scripts/agent-lock.sh claim ticket T003267 --label plan-preflight-smoke --worktree .
bash scripts/plan-preflight.sh pre-commit --ticket T003267 && echo "rc=0 wie erwartet"
bash scripts/plan-preflight.sh pre-worktree --ticket T003267; echo "rc=$? (0 solange T003267 nicht gemergt ist)"
bash scripts/plan-preflight.sh pre-commit; echo "rc=$? (2 erwartet: --ticket fehlt)"
```

- [ ] **S4-Referenzierbarkeit (Acceptance-Notiz, KEINE Abhängigkeit dieses Partials):**
      Das Skript wird von den Flow-Skills (Partial p5: `dev-flow-plan`/`opencode-flow-plan`
      ersetzen ihre Inline-Snippets durch `plan-preflight.sh`-Aufrufe) referenziert und von
      der BATS-Suite (Partial p6, `tests/spec/dev-flow-plan/plan-preflight.bats`) ausgeführt —
      damit ist der Orphan-Check S4 nach dem Merge der Geschwister-Partials erfüllt.
      Abnahme-Probe nach p5/p6-Merge: `grep -rl 'plan-preflight.sh' .claude/ .opencode/ tests/`
      liefert eine nicht-leere Trefferliste. Innerhalb dieses Partials genügt der
      Kopfkommentar mit den Ticket-Referenzen; der Grep-Check gehört in die Abnahme des
      Gesamt-Change (tasks.md-Index), nicht hierher.

---

## Scope-Grenzen (nicht in P1)

- Keine Änderungen an `scripts/agent-lock.sh` / `agent-lock-merged.sh` — `check-merged`
  wird nur aufgerufen, nicht angefasst.
- Keine Skill-Prosa-Umstellung (`dev-flow-plan`, `opencode-flow-plan`) — Partial p5.
- Keine BATS-Tests, keine Failing-Test-/Verify-Tasks — Partial p6 bzw. der tasks.md-Index.
- Keine `stage-plan.sh`-Härtung und kein `plan-lint.sh --rules` — eigene Partials laut design.md.
