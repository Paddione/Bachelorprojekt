# p4 — Fortsetzungs-Kontrakt in dev-flow-execute festschreiben

Rolle: `impl`. `depends_on: p3`. Beschreibt das Verhalten, das p1 bis p3 hergestellt haben.

`target_files`: `.claude/skills/dev-flow-execute/SKILL.md` (existiert, 250 Zeilen; `.md` steht nicht
in `s1.limits`, also kein Zeilenbudget).

## Warum das nötig ist

Der Skill ist heute für den menschlichen Ausführer geschrieben. Er sagt nicht, was gilt, wenn die
Factory dasselbe Ticket aufgreift. Nach Entscheidung E1 des Designs gibt es bewusst **keinen**
zweiten Skill — dann muss dieser eine für beide Aufrufumgebungen stimmen, sonst ist die
Entscheidung nur behauptet.

## Kopplungswarnung — vor jeder Änderung lesen

Neun Test-Dateien greifen auf den Inhalt dieser Datei zu:

```bash
grep -rl 'dev-flow-execute/SKILL.md' tests/
```

Das ist derselbe Fehlermodus wie bei T001441/T002181: Kürzungen oder Umstrukturierungen einer
SKILL.md reißen Test-Ketten, die auf Überschriften oder Formulierungen prüfen. **Dieses Partial
ergänzt ausschließlich; es entfernt und verschiebt nichts.** Bestehende Überschriften behalten
Wortlaut und Nummerierung.

## Aufgaben

- [ ] **P4.1 — Kopplung erfassen.** Vor der ersten Zeile Änderung feststellen, welche Zeichenketten
      die neun Tests aus dieser Datei erwarten:

```bash
grep -rn 'dev-flow-execute/SKILL.md' tests/ | head -20
```

      Jede so gefundene Assertion muss nach der Änderung weiterhin zutreffen.

- [ ] **P4.2 — Fortsetzungs-Abschnitt ergänzen.** Ein neuer Abschnitt beschreibt, was gilt, wenn
      auf dem Branch bereits Arbeit liegt:
      - Die Factory setzt fort statt neu zu beginnen; erledigte Partials werden über die
        `partial-done`-Phase-Events erkannt und übersprungen.
      - Der Worktree wird angelegt, bevor das Partial-Manifest gelesen wird — ohne diese
        Reihenfolge greift der Filter nicht.
      - Es gibt **keine** zweite Fortschrittsquelle. Wer hier Commit-Betreffs oder Plan-Checkboxen
        auswerten will, baut Drift ein.

- [ ] **P4.3 — Hold-Default ausdrücklich benennen.** `Schritt 1.8` behandelt bereits die Freigabe.
      Dort ergänzen, dass `readiness.execution_released=false` der **Default** bleibt und
      Fortsetzungsfähigkeit ihn nicht ersetzt: die Freigabe bleibt die menschliche Entscheidung,
      sie kostet nur keine bereits geleistete Arbeit mehr.

- [ ] **P4.4 — `reclaim` als Notausstieg einordnen.** Festhalten, dass `ticket.sh reclaim` für
      entgleiste Ausführungen gedacht ist und **nicht** der Regelweg für jedes gestagte Ticket —
      und dass keine Automatik ihn auslöst.

- [ ] **P4.5 — Fremdbesitz beschreiben.** Ist der Branch in einem anderen Worktree ausgecheckt,
      stellt die Factory zurück und gibt ihren Slot frei; das Ticket wird **nicht** `blocked`. Für
      den menschlichen Ausführer heißt das: ein Ticket, das kurz nicht anläuft, ist kein Defekt,
      sondern eine belegte Ressource.

- [ ] **P4.6 — Keine Brand-Domain-Literale.** Der Text darf keine konkreten Hostnamen enthalten;
      Domains kommen aus `k3d/configmap-domains.yaml`:

```bash
grep -nE 'mentolder\.de|korczewski\.de' .claude/skills/dev-flow-execute/SKILL.md
```

- [ ] **P4.7 — Test-Ketten gegenprüfen.** Nach der Änderung die gekoppelten Suites laufen lassen —
      `task test:changed` deckt die spec-Suite nicht zuverlässig ab, daher explizit:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-execute.bats tests/spec/dev-flow-plan.bats tests/spec/openspec-workflow.bats
```

- [ ] **P4.8 — Skill-Größe prüfen.** Es gibt einen laufenden Change zur SKILL.md-Größe
      (`openspec/changes/agentic-skillmd-size/`). Prüfen, ob daraus ein Limit gilt, das dieser
      Zuwachs reißt:

```bash
grep -rn "SKILL.md" openspec/changes/agentic-skillmd-size/*.md 2>/dev/null | head -10
```

      Greift ein Limit, gehört der ausführliche Teil in eine Referenz unter
      `.claude/skills/references/` und in die SKILL.md nur der Verweis — **aber nur dann**, weil
      jede Auslagerung die oben genannten Test-Ketten gefährdet.

## Abnahmekriterien

- Der Skill beschreibt Fortsetzung, Hold-Default, `reclaim`-Rolle und Fremdbesitz-Verhalten.
- Keine bestehende Überschrift wurde umbenannt, verschoben oder entfernt.
- Die neun gekoppelten Test-Dateien sind unverändert grün.
- Keine Brand-Domain-Literale im Text.
