# Plan-Status & Ausführungsoptionen (Feature- und Fix-Pfad)

Aus `dev-flow-plan` Schritt 6.5 (Feature-Pfad) und Schritt 6 (Fix-Pfad) extrahiert (Chore T001007).
Ohne Ticket-DB gibt es keine Kommissionierungs-Queue; gestagte Pläne sind gepushte
`feature/*`-/`fix/*`-Branches mit `.agents/plans/<slug>/tasks.md` und ohne PR.

## Ausgabe-Format (identisch für Feature- und Fix-Pfad)

**STOPP.** Informiere den User:

```
✅ <Feature|Fix>-Plan bereit: <slug>
   Branch: <feature|fix>/<slug>
   Plan: .agents/plans/<slug>/tasks.md

🚀 Ausführungsoptionen:

1. **Einzel-Ausführung:**
   dev-flow-execute im Worktree von <feature|fix>/<slug> aufrufen

2. **Lokal mit dem Plan-Runner:**
   node scripts/llm/plan-runner.mjs .agents/plans/<slug>
   → Führt die Partials mit den lokalen Modellen aus (Runbook: docs/runbooks/plan-runner.md)
```

**Empfehlung:** Ein fertiger Plan → Option 1. Lokal ohne Cloud-Budget → Option 2.

STOPP danach.
