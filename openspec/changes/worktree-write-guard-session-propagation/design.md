---
title: Design: Worktree-Write-Guard — SID-Propagation für delegierte Subagenten
ticket_id: T006365
domains: [website, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: Worktree-Write-Guard — SID-Propagation für delegierte Subagenten

Ticket: T006365 — Fix (minor/mittel)

## Root-Cause-Analyse (T002448-M5: Symptom vs. Ursache)

### Beobachtetes Symptom (Fakt, reproduzierbar)

Implementer-Subagent für T005560 (Branch `fix/ticket-lock-stale-pass-T005560`)
konnte Edit/Write-Tools nicht nutzen, solange der delegierende Orchestrator den
branch-scoped Claim hielt (Worktree-Pfade als Ziel). Workaround des Implementers:
Datei-Edits per `python3`-Bash statt Datei-Tools ("Hook umgangen, nicht
deaktiviert") — belegt durch die python3-basierten `tasks.md`-Edits im finalen
Stage-Commit `841d48645` (chore(plans): finalize ticket-lock-stale-pass change
[T005560], Diff: `tasks.md` +14/−5).

### Ursache (belegt, nicht Hypothese)

`scripts/hooks/worktree-write-guard.sh` identifiziert die Session über
`_my_sid()`, das `AGENT_LOCK_SID` → `CLAUDE_CODE_SESSION_ID` →
`CLAUDE_SESSION_ID` → `OPENCODE_SESSION_ID` → Unix-SID-Fallback liest.

Empirischer Befund in dieser Session (delegierter Subagent):
- Der Bash-Call eines Task-Tool-Subagenten sieht `CLAUDE_CODE_SESSION_ID`
  (`b09f292d-…`), die von Claude Code **pro Agenten-Session injiziert** wird.
- Die `claude`-Prozesse selbst tragen die Session-ID **nicht** in ihrer
  Prozess-Umgebung (`/proc/<pid>/environ` enthält kein `CLAUDE_CODE_SESSION_ID`) —
  eine /proc-basierte Parent-Erkennung ist damit strukturell unmöglich.
- Folglich hat jeder Task-Tool-Subagent eine **eigene SID**, die sich von der des
  Orchestrators unterscheidet.

Guard-Ablauf im Implementer-Kontext (Worktree-Write):
1. Orchestrator claimt Branch mit `owner_sid` = Orchestrator-SID.
2. Implementer-Subagent schreibt in den geclaimten Worktree → Regel 2
   (`MY_WTS` für die Subagenten-SID: leer) greift nicht.
3. Regel 3: der Claim des Orchestrators ist ein "fremder lebender Claim", der den
   Zielpfad deckt → `exit 2`. Edit/Write blockiert.

Die SSOT-Spec `openspec/specs/agent-skills.md` (Requirement "The worktree write
guard identifies ownership claims by SID with a stated source", Z. 1046–1054)
nimmt an: "claims recorded with this SID … includes the caller's own session AND
its subagents". Diese Annahme hält in der Praxis nicht: Subagenten haben eine
eigene Session-ID. Der Guard-Kommentar (T003131) sagt selbst, wie Subagenten
abgegrenzt werden: "Wer seine Subagenten abgrenzen will, gibt ihnen eine eigene
SID (AGENT_LOCK_SID)" — die Umkehrung (Subagenten sollen die Parent-SID
**übernehmen**) ist der hier gewählte Weg, die Spec-Annahme herzustellen.

### Warum keine andere Mechanik

| Kandidat | Verworfen, weil |
|---|---|
| Guard erlaubt Writes unter fremden Claims für claim-lose Sessions | kollabiert den T002355-M3-Schutz (fremde Session schreibt in fremden Worktree — der ursprüngliche Guard-Zweck) |
| /proc-<ppid>-Environ-Kette | strukturell unmöglich (Session-ID wird pro Bash-Call injiziert, nicht in Prozess-Env) |
| Neues Lock-Feld `authorized_sids` + `agent-lock.sh authorize` | zusätzliche Mechanik mit Stale-Data-Risiko; die Autorisierung müsste trotzdem per Prompt-Direktive ausgelöst werden — gleiche Weichheit, mehr Code |

Die Information "Subagent gehört zum Claim-Besitzer" existiert ausschließlich beim
delegierenden Orchestrator und muss deshalb **explizit propagiert** werden. Der
bestehende `AGENT_LOCK_SID`-Override ist genau der dafür vorgesehene Kanal.

## Fix-Ansatz

### Teil 1 — SID-Propagation in den Delegations-Skills (Kern-Fix)

Die beiden Delegationspunkte, deren Subagenten im Worktree des Orchestrator-Claims
schreiben, tragen eine PFLICHT-Direktive:

- `.claude/skills/dev-flow-execute/SKILL.md` — Implementer-Prompt (Schritt 2,
  Kontext-Injektion/Auftrag): Der Orchestrator ermittelt seine SID
  (`bash scripts/agent-lock.sh mine`) und schreibt dem Implementer vor, in jedem
  Bash-Call `export AGENT_LOCK_SID=<sid>` auszuführen.
- `.claude/skills/dev-flow-plan/SKILL.md` (Schritt 3.7, Kontext-Injektion für
  Plan-Subagenten): dieselbe Direktive — Plan-Subagenten schreiben
  `tasks.d/pX-*.md` und `tasks.md` im Worktree.

Wirkung: Der delegierte Subagent sieht die Parent-Claims als **eigene** (Regel 2)
→ Schreiben im geclaimten Worktree erlaubt; der Haupt-Checkout bleibt blockiert
(Regel 2 greift weiter für alle Pfade außerhalb der eigenen Worktrees inkl.
Phase-A-Pfade); fremde Claims anderer Sessions bleiben blockiert (Regel 3).

### Teil 2 — Guard: Regel-3-Meldung nennt den Propagations-Hinweis

`scripts/hooks/worktree-write-guard.sh`, Regel-3-Ausgabe: zusätzliche Zeile
"Falls du ein delegierter Implementer/Planer der Session <FOREIGN_SID> bist:
export AGENT_LOCK_SID=<FOREIGN_SID> und versuche erneut." — macht den Mechanismus
auffindbar, statt dass der Betroffene zum Workaround (python3-Bash) oder
Notausgang (`WORKTREE_GUARD_BYPASS=1`) greift.

### Teil 3 — SSOT-Spec

`openspec/specs/agent-skills.md`: neues Requirement (Delta):
"…SHALL treat claims whose `owner_sid` equals the caller's `AGENT_LOCK_SID` as
own — delegating skills propagate the parent SID to subagents (T006365)…" mit
Scenarios (delegierter Subagent mit Parent-SID schreibt im Parent-Worktree;
Haupt-Checkout bleibt blockiert).

## Betroffene Subsysteme

| Datei | Rolle |
|---|---|
| `scripts/hooks/worktree-write-guard.sh` | Produktionscode: Regel-3-Meldung |
| `.claude/skills/dev-flow-execute/SKILL.md` | Implementer-Prompt: SID-Direktive |
| `.claude/skills/dev-flow-plan/SKILL.md` | Plan-Subagenten-Prompt: SID-Direktive |
| `openspec/specs/agent-skills.md` | SSOT-Requirement + Scenarios |
| `tests/spec/agent-skills/worktree-write-guard-session-propagation.bats` | RED/GREEN-Guards |

## Edge-Cases

1. **Orchestrator ohne Harness-SID** (weder CLAUDE_CODE_SESSION_ID noch
   OPENCODE_SESSION_ID, nur Unix-Fallback): `agent-lock.sh mine` liefert die
   pro-Bash-Call driftende Unix-SID — die Propagation wäre wertlos. Abhilfe: die
   Direktive erwähnt, dass die SID aus `agent-lock.sh mine` stammt; im
   Harness-Betrieb (Claude Code/opencode) ist die Harness-SID stabil
   (T002375-p1, T002671). Kein neuer Code nötig.
2. **Subagent released versehentlich den Parent-Claim**: `release` prüft
   SID-Match — mit propagierter SID wäre der Subagent "Eigentümer". Die
   Implementer-Direktive sagt explizit, dass der Orchestrator released
   (bestehende T002365-Semantik); das Risiko ist dieselbe Annahme, die die Spec
   heute schon macht ("Subagent derselben SID passiert den Guard legitimerweise").
3. **Mehrere Orchestrator-Worktrees**: Regel 2 sammelt alle eigenen Claims
   (T002412) — mit propagierter SID sieht der Subagent alle Worktrees des
   Parents als eigene. Gewollt: der delegierte Subagent darf nur im Worktree des
   Auftrags schreiben; die Einengung auf den Auftrags-Worktree ist im Prompt
   (Worktree-Pfad-Präfix-Pflicht T002357) verankert, nicht im Guard.
4. **Fremde Claims anderer Sessions**: unverändert blockiert (Regel 3) — der
   T002355-M3-Schutz bleibt vollständig erhalten.
