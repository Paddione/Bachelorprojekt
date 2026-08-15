# Proposal: Auto-Merge-Zustands-Check in dev-flow-execute Pre-Flight und Review-Gate (T006366)

## Why

T006282: Zwei Sessions arbeiteten denselben Fix — die Plan-Session (SID db759381) und eine
dev-flow-execute-Session. Während das Review-Gate lief (Verdict "With fixes", 1
Important-Fund), aktivierte der User Auto-Merge auf PR #4524 (23:29Z); der Merge lief
23:31Z bei grüner CI durch. Der Review-Fix (2 Doc-Zeilen) kam nach dem Merge und brauchte
Folge-Ticket T006330 + PR #4527. Kein Datenverlust, aber der Review-Gate-Wert verpuffte.

**Ursachen-Verifikation (T002448-M5, Symptom vs. Hypothese):**

- **Symptom (Fakt, reproduzierbar):** PR #4524 wurde während eines laufenden Review-Gates
  mit Verdict "With fixes" gemergt; der Review-Fix musste als Folge-Ticket nachgezogen
  werden.
- **Hypothese:** dev-flow-execute prüft nicht, ob Auto-Merge bereits von anderer Stelle
  aktiviert ist.
- **Verifikation (Quelltext):** `grep -rn "autoMergeRequest\|disable-auto\|auto.merge"`
  über `scripts/` und `.claude/skills/` liefert **0 Treffer** — es existiert kein
  Auto-Merge-Zustandscheck im Repo. Der Pre-Flight (`dev-flow-execute-phases.md`,
  Schritte −1 bis 1.7) prüft Branch-Claim, Main-Sync, Worktree-Konsistenz, Rebase,
  Plan-Pfad, Doppelarbeit-Guard (nur Claim-Registry), Pipeline-Modus, `in_progress`,
  `touched_files` — aber keinen PR-Zustand. Schritt 3.8 (Code-Review-Gate) prüft vor dem
  Review ebenfalls keinen Auto-Merge-Zustand: Das Gate kontrolliert nur die **eigene**
  `gh pr merge --auto`-Anforderung. Extern aktiviertes Auto-Merge (User-Klick oder
  parallele Session) merged asynchron, sobald die Required Checks grün sind — die
  Gate-Invariante "kein Merge ohne bestandenes Gate" ist damit konstruktiv verletzbar.

**Prior-Art (T002829):** `review-gate-enforce` (T005565, gemergt) regelt die
**Request-Seite** — wer Auto-Merge anfordern darf (Orchestrator nach bestandenem Gate,
nicht der Implementer). Die **State-Seite** — Auto-Merge ist extern bereits aktiv, wenn
das Gate läuft — ist dort nicht adressiert. Dieser Fix ist komplementär, kein Duplikat.

## What

- **Neu: `scripts/check-pr-automerge.sh`** — deterministischer Auto-Merge-Zustandscheck
  (`gh pr view --json number,autoMergeRequest`; PR-Nummer explizit per `--pr` oder
  Branch-Auflösung):
  - `rc=0`: kein PR für den Branch **oder** `autoMergeRequest=null` → fortfahren
  - `rc=1`: Auto-Merge aktiv → fail-closed (BLOCK, PR-Nummer in der Meldung)
  - `rc=2`: Umgebungsfehler (gh fehlt, technischer gh-Fehler ≠ "kein PR")
- **`.claude/skills/dev-flow-execute/SKILL.md`** — Schritt 3.8 (Code-Review-Gate): erster
  Gate-Schritt ist der Auto-Merge-Zustandscheck; bei `rc=1` bricht das Gate fail-closed
  ab (keine stille Deaktivierung — der explizite User-Akt wird sichtbar, der Operator
  entscheidet).
- **`.claude/skills/references/dev-flow-execute-phases.md`** — neuer Pre-Flight-Schritt
  nach dem Doppelarbeit-Guard (1.4): Zustandscheck; bei `rc=1` Abbruch als
  Doppel-Execution-Situation (parallele Session/User hat bereits einen PR mit Auto-Merge
  auf dem Branch → koordinieren, nicht duplizieren).
- **Delta auf `openspec/specs/agent-skills.md`** — neues Requirement (ADDED).
- **Neu: `tests/spec/agent-skills/automerge-preflight-check.bats`** — failing Test
  (Rot-Grün): Script-Verhalten via gh-Stub (Output-Verifikation, T002448-M4) +
  Integrations-Guards (Source-Grep, dokumentierte Ausnahme für Doku-Konventionen).

## Impact

- `scripts/check-pr-automerge.sh` — neu (~70 Zeilen; .sh-Limit 800, Budget großzügig)
- `.claude/skills/dev-flow-execute/SKILL.md` — 352 Ist, kein S1-Limit → +~12 Zeilen
- `.claude/skills/references/dev-flow-execute-phases.md` — 362 Ist, kein S1-Limit → +~15 Zeilen
- `tests/spec/agent-skills/automerge-preflight-check.bats` — neu (kein S1-Limit für .bats)
- `openspec/specs/agent-skills.md` — via Delta (ADDED), Archivierung übernimmt es
- Nicht im Scope: GitHub Branch-Protection (Infra-Entscheidung, zu invasiv); opencode-
  Runtime-Äquivalent (`opencode-flow-execute`) — eigener Vorgang, gleiche Fehlerklasse;
  Factory-Pipeline (`pipeline.js`) — betrifft den interaktiven dev-flow-execute-Pfad.
