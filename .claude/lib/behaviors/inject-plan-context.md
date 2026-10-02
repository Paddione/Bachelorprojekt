# Behavior: Plan-Kontext vor Agent-Dispatch injizieren

Vor dem Dispatch eines Sub-Agenten den aktiven Plan-Kontext injizieren:

```bash
context=$(bash scripts/plan-context.sh <role>)
if [[ -n "$context" ]]; then
  prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"
fi
```

`<role>` durch die Domäne des Agenten ersetzen: `infra`, `website`, `db`, `ops`, `test`, `security`.


Der `<active-plans>`-Block ist für das aktuelle Feature autoritativ — er überschreibt Annahmen
aus dem Gedächtnis oder aus git-log.
