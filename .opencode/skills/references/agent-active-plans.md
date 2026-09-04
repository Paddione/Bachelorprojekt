# Active-plans-Injektion für Domain-Agenten

Geteilter Kontrakt für alle `.claude/agents/bachelorprojekt-*.md`. Die Agent-Dateien
verweisen hierher, statt diesen Text sechsmal zu wiederholen.

## Wer injiziert

Der Orchestrator (siehe `CLAUDE.md` → „Agent Routing") baut vor dem Dispatch einen
`<active-plans>`-Block aus `scripts/plan-context.sh <rolle> --with-openspec` und stellt
ihn dem Agent-Prompt voran. Quelle sind die aktiven Proposals unter
`openspec/changes/*/proposal.md`.

**Der injizierte Block ist maßgeblich** — er ist der Arbeitskontext für das laufende Feature.

## Rollenname: immer die Langform

`plan-context.sh` erwartet einen der Namen aus `_role_allowlist()` im Skript selbst:
`bachelorprojekt-{website,ops,infra,test,db,security}` oder `orchestrator`.

Eine Kurzform (`infra`, `test`, …) schlägt **nicht** fehl. Sie fällt still auf `__ALL__`
zurück, schreibt nur ein `WARN: unknown role` nach stderr und liefert **alle** Proposals
ungefiltert — der Rollenfilter wirkt dann gar nicht (T002322). Das ist die eigentliche
Falle: der Aufruf sieht erfolgreich aus und der Agent bekommt fremden Kontext.

```bash
bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec   # richtig
bash scripts/plan-context.sh infra --with-openspec                   # still ungefiltert
```

Die Allowlist wird hier bewusst nicht dupliziert — maßgeblich ist die Funktion im Skript.

Der Schwesterbefehl `scripts/toolset-context.sh <rolle>` ist im Gegensatz dazu
**fail-closed**: eine unbekannte Rolle beendet ihn mit Exit ≠ 0 und gibt nichts aus.

## Kein Block injiziert

Dann ist für diese Rolle kein Plan in Arbeit. **Nicht** ersatzweise `superpowers.plans`
abfragen: die Tabelle ist eingefrorene Historie. Die Tracking-Pipeline wurde in PR #788
(`tracking-import` CronJob) und PR #993 (`track-pr.yml`) entfernt;
der letzte erfasste Eintrag ist PR #787.
