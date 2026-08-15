# Proposal: executor-post-merge-death

## Why

Der dev-flow-execute-Executor starb nach dem Merge eines Fix-PR (Incident #4460/T005592): Implementierung und Verify waren committed und gepusht, der Auto-Merge hatte den PR gemergt — aber Ticket-Closure, Plan-Archivierung und Worktree/Branch-Cleanup blieben liegen, weil der Executor am Ende seiner kontextschweren Session ausfiel. Die Eskalation musste alle Abschluss-Schritte manuell nachholen.

Ursache (belegt durch Struktur + dokumentierte Fehlerklasse, siehe `design.md`): Die Post-Merge-Finalisierung (Schritte 6.4–7.5) läuft als letzte Phase im erschöpften Orchestrator-Kontext. T001571 dokumentiert exakt diese Fehlerklasse („vergessene Auftragsdetails" bei Kontext-Überlauf); der Repo-eigene Heilungsweg ist die Delegation an einen frischen Kontext (T002365-Muster).

## What

1. **Finalizer-Delegation:** `dev-flow-execute` delegiert die Schritte 6.4–7.5 (Merge-Wait, Ticket-Closure, Plan-Archiv, Cleanup, Lock-Release) nach dem Review-Gate an einen frischen Finalizer-Subagenten mit kompaktem Lagebild. Der Orchestrator-Kontext endet nach dem Auto-Merge-Request (Schritt 3.8).
2. **Idempotente Finalisierungs-Einheit:** Neues Skript `scripts/devflow-post-merge-finalize.sh <ticket-id>` bündelt die Abschluss-Schritte idempotent — eine Recovery-/Eskalations-Session (oder der Finalizer) kann die offenen Schritte mit einem Aufruf abschließen.
3. **SSOT + Guard:** Requirement in `openspec/specs/agent-skills.md` (Delta), abgesichert durch einen RED-Test in `tests/spec/agent-skills/executor-post-merge-death.bats` (Konventions-Guard + Output-Verifikation des Skripts).

_Ticket: T006284_
