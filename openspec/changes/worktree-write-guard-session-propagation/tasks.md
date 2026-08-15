---
title: worktree-write-guard-session-propagation
ticket_id: T006365
domains: [scripts, test]
status: plan_staged
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-write-guard-session-propagation — Implementation Plan

## File Structure

| Datei | Rolle |
|---|---|
| `scripts/hooks/worktree-write-guard.sh` | Regel-3-Meldung um AGENT_LOCK_SID-Propagations-Hinweis ergänzen |
| `.claude/skills/dev-flow-execute/SKILL.md` | Implementer-Prompt: SID-Propagations-Direktive |
| `.claude/skills/dev-flow-plan/SKILL.md` | Plan-Subagenten-Prompt (Schritt 3.7): SID-Propagations-Direktive |
| `openspec/specs/agent-skills.md` | Requirement + Scenarios (Delta) |
| `tests/spec/agent-skills/worktree-write-guard-session-propagation.bats` | RED/GREEN-Guards (bereits im Stage-Commit) |

## Kontext

Fix T006365: Task-Tool-Subagenten haben eine eigene Session-ID; der
branch-scoped Claim des delegierenden Orchestrators (`owner_sid`) gilt ihnen als
fremder lebender Claim → Guard-Regel 3 blockiert Edit/Write im eigenen Worktree.
Fix: delegierende Skills propagieren die Parent-SID per `AGENT_LOCK_SID`
(Quelle: `bash scripts/agent-lock.sh mine`); Guard-Regel-3-Meldung nennt den
Hinweis. Root-Cause + verworfenen Alternativen: `design.md`.

S1-Budgets (nicht-baselined → Limit 250 Zeilen/Datei):
`scripts/hooks/worktree-write-guard.sh` 227 → +3 Zeilen (unter Limit);
`.claude/skills/dev-flow-execute/SKILL.md` 352 (Doku, kein Ratchet-Ziel);
`.claude/skills/dev-flow-plan/SKILL.md` 324 (Doku);
`openspec/specs/agent-skills.md` 1097 (Spec);
Testdatei 76.

## Task 1 — RED: der Guard-Test liegt vor und ist rot

Der failing Test ist im Stage-Commit enthalten:
`tests/spec/agent-skills/worktree-write-guard-session-propagation.bats`
(T1: Regel-3-Meldung nennt AGENT_LOCK_SID-Hinweis; T2/T4: SKILL.md-Direktiven;
T3: Positiv-Anker — Write mit `AGENT_LOCK_SID` = `owner_sid` erlaubt).

Verifikation (echter Testrunner, Statuszeile prüfen):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-session-propagation.bats
```

- expected: FAIL — T1, T2 und T4 sind rot (`not ok`), T3 ist grün (`ok`).
- Falls T3 rot ist: Fixture prüfen (AGENT_LOCK_SID-Override greift nicht) —
  der Anker belegt, dass der Guard Writes mit `AGENT_LOCK_SID` = `owner_sid`
  erlaubt (Regel 2), die Basis der Propagation.

## Task 2 — GREEN Teil 1: Regel-3-Meldung nennt den Propagations-Hinweis

`scripts/hooks/worktree-write-guard.sh`, Regel-3-Block (aktuell Zeilen
214–224): Die Ablehnungsmeldung um eine Zeile ergänzen, die dem delegierten
Subagenten den Weg zeigt — Vorbild ist der `FOREIGN_SID`-Ausdruck in derselben
Meldung:

```
  echo "  Falls du ein delegierter Implementer/Planer der Session $FOREIGN_SID bist:"
  echo "  export AGENT_LOCK_SID=$FOREIGN_SID und versuche erneut (T006365)."
```

Nur die Meldung ändern; die Entscheidungslogik (Regel 2/3/4) bleibt unverändert.
Der Hook darf dadurch keine neue Abhängigkeit bekommen (weiterhin reines Bash +
sed + python3 wie bisher).

## Task 3 — GREEN Teil 2: dev-flow-execute propagiert die Parent-SID

`.claude/skills/dev-flow-execute/SKILL.md`, Implementer-Auftrag (Schritt 2,
Abschnitt "Auftrag", nach der Ein-Ebenen-Regel): eine PFLICHT-Zeile ergänzen,
die beides enthält — die SID-Quelle und die Propagations-Anweisung:

```
- **SID-Propagation (PFLICHT, T006365):** Ermittle deine Session-SID mit
  `bash scripts/agent-lock.sh mine` und weise den Implementer an, in jedem
  Bash-Call zuerst `export AGENT_LOCK_SID=<deine-sid>` auszuführen — ohne
  diese Propagation blockiert der Worktree-Write-Guard seine Edit/Write-Tools
  im geclaimten Worktree (eigene Session-ID des Subagenten ≠ owner_sid).
```

## Task 4 — GREEN Teil 3: dev-flow-plan propagiert die Parent-SID

`.claude/skills/dev-flow-plan/SKILL.md`, Schritt 3.7 (Kontext-Injektion für
Plan-Subagenten): dieselbe PFLICHT-Direktive ergänzen (Plan-Subagenten
schreiben `tasks.d/pX-*.md` und `tasks.md` im Worktree des Orchestrator-Claims):

```
**SID-Propagation (PFLICHT, T006365):** Ermittle deine Session-SID mit
`bash scripts/agent-lock.sh mine` und weise den Plan-Subagenten an, in jedem
Bash-Call zuerst `export AGENT_LOCK_SID=<deine-sid>` auszuführen — sonst
blockiert der Worktree-Write-Guard seine Datei-Tools im Worktree.
```

## Task 5 — GREEN: beide Guards laufen durch

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-session-propagation.bats
```

- expected: PASS — alle vier Tests grün (`ok`).
- Zusätzlich Regressionslauf der bestehenden Guard-Suite:
  `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/ tests/spec/batch-worktree-guard-tooling-fixes/`

## Task 6 — SSOT-Spec: Requirement + Scenarios

`openspec/specs/agent-skills.md`: hinter dem Requirement "The worktree write
guard permits Phase-A proposal paths on main during concurrent session work"
(Z. 1076 ff.) ein neues Requirement anhängen:

**"The worktree write guard accepts propagated parent session IDs for delegated
subagents"** — delegierende Skills SHALL die Parent-SID an delegierte Subagenten
propagieren (`AGENT_LOCK_SID`, Quelle `bash scripts/agent-lock.sh mine`);
Claims mit `owner_sid` gleich der `AGENT_LOCK_SID` des Aufrufers SHALL als
eigene Claims gelten (Regel 2); die Regel-3-Ablehnungsmeldung SHALL den
Propagations-Hinweis nennen.

Scenarios (je GIVEN/WHEN/THEN):
1. Delegierter Implementer mit propagierter Parent-SID schreibt in den
   Worktree des Parent-Claims → exit 0.
2. Haupt-Checkout-Write des delegierten Subagenten (außer Phase-A-Pfaden)
   → exit 2 (Regel 2 bleibt aktiv).
3. Fremder Claim einer anderen Session → exit 2 (Regel 3 bleibt aktiv) mit
   AGENT_LOCK_SID-Hinweis in der Meldung.

## Task 7 — Abschluss-Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- expected: PASS — CI-Gates grün, generierte Artefakte aktuell committet.
