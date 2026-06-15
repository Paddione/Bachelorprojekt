---
ticket_id: T000724
plan_ref: docs/superpowers/plans/2026-06-14-plan-qualitaets-check.md
status: active
date: 2026-06-14
---

# Spec: T000724 — Plan-Qualitäts-Check: DeepSeek bewertet Plan-Vollständigkeit nach dev-flow-plan

## Kontext — Ist-Zustand

Nach `dev-flow-plan` liegt ein Implementierungsplan in `docs/superpowers/plans/` vor.
Dieser Plan wird bislang nur manuell gegen die Checkliste in
`.claude/skills/references/plan-quality-gates.md` geprüft (Schritt 4 der Skill).

Probleme mit dem Status quo:
- Lücken (fehlende S1-Budgets, fehlender Testplan, offene TODOs/TBD) werden erst beim
  `dev-flow-execute`-Run entdeckt, manchmal sogar erst in CI.
- Die manuelle Prüfung ist fehleranfällig und bleibt oft unvollständig, wenn der Agent
  bereits viel Kontext angesammelt hat.

## Was dieses Feature ändert

Nach dem Schreiben eines Implementierungsplans (Feature- oder Fix-Pfad) ruft `dev-flow-plan`
automatisch ein neues Skript `scripts/plan-qa-check.sh` auf. Das Skript lässt DeepSeek den
Plan gegen eine klar definierte Checkliste prüfen und gibt `PASS` oder `FAIL` zurück.

Bei `FAIL` versucht DeepSeek, die Lücken direkt in die Plan-Datei zu schreiben (Auto-Fix-Loop).
Der Loop läuft maximal 2 Iterationen. Schlägt auch der zweite Versuch fehl, informiert das
Skript den Agenten mit konkreten Lücken — der Agent kann dann manuell nachbessern oder einen
neuen Plan-Subagenten spawnen.

Das neue Skript ist außerdem als `task plan:qa PLAN=<pfad>` manuell aufrufbar (S4-Gate:
Taskfile-Eintrag + Referenz in der Doku).

## Kern-Nutzerflow

```
dev-flow-plan: Plan fertig
        ↓
scripts/plan-qa-check.sh <plan-pfad>
        ↓
DeepSeek prüft 4 Qualitätskriterien
        ↓
PASS → weiter zu Schritt 4.5 (ticket.sh stage-plan)
FAIL → Auto-Fix-Loop (max. 2 Iterationen):
        DeepSeek ergänzt fehlende Abschnitte in Plan-Datei
        → erneuter Check
        → PASS → weiter
        → FAIL nach Iteration 2 → Fehlermeldung mit konkret fehlenden Punkten
```

## Die 4 Qualitätskriterien (Checklist für DeepSeek)

1. **Konkrete Dateipfade**: Jeder Task benennt die geänderten Dateien explizit (keine
   vagen "passe X an"-Formulierungen ohne Pfad).

2. **Testplan vorhanden**: Mindestens ein Task enthält einen konkreten Test-Schritt
   (BATS, Vitest, Playwright oder manuelles Verifikationskommando) — nicht nur
   "Tests schreiben" als Platzhalter.

3. **Keine offenen TODOs/TBD**: Der Plan enthält keine ungelösten Platzhalter wie
   `TODO`, `TBD`, `FIXME`, `???` oder `<ausfüllen>`.

4. **S1-Budget**: Pro geänderter Datei mit bekannter Zeilenzahl ist entweder ein
   Budget-Kommentar vorhanden (`Ist X · Baseline Y → Budget Z`) oder die Datei ist
   explizit als neue Datei markiert (dann gilt das statische Extension-Limit).

Der letzte Task des Plans muss `task test:all`, `task freshness:regenerate` und
`task freshness:check` als Steps enthalten.

## Akzeptanzkriterien

- `scripts/plan-qa-check.sh <plan-datei>` gibt `PASS` aus und beendet sich mit Exit-Code 0
  für einen vollständigen Plan, `FAIL` + Liste der Lücken mit Exit-Code 1 für einen
  unvollständigen Plan.
- `task plan:qa PLAN=<pfad>` ist aufrufbar und delegiert an das Skript.
- `dev-flow-plan/SKILL.md` dokumentiert den QA-Check als Pflicht-Schritt zwischen
  Plan-Erstellung (Schritt 3.7) und Plan-Übernahme (Schritt 4).
- Bei fehlendem `ANTHROPIC_API_KEY` (DeepSeek nicht verfügbar) gibt das Skript eine
  Warnung aus und beendet sich mit Exit-Code 0 (advisory, kein Blocker).
- Bei FAIL nach 2 Iterationen beendet sich das Skript mit Exit-Code 1 und gibt eine
  lesbare Fehlermeldung aus, die konkret die fehlenden Punkte benennt.

## Edge Cases

- **DeepSeek API nicht verfügbar** (kein `ANTHROPIC_API_KEY` oder Netzwerkfehler):
  Skript warnt und gibt Exit-Code 0 — die Gate ist advisory, kein harter Blocker.
  Der Agent wird informiert und kann den Plan manuell prüfen.

- **Plan braucht 3+ Iterationen**: Nach 2 Auto-Fix-Versuchen stoppt der Loop. Das Skript
  gibt `FAIL` + eine Liste aller verbleibenden Lücken zurück. Der Agent entscheidet,
  ob er einen neuen Plan-Subagenten (Schritt 3.7) mit konkreten Korrektur-Hinweisen
  spawnt oder manuell nachbessert.

- **Plan ist sehr kurz / fast leer**: Wenn der Plan weniger als 10 Zeilen hat, schlägt
  die Prüfung sofort mit einem spezifischen Hinweis fehl ("Plan zu kurz für Bewertung").

- **DeepSeek schreibt fehlerhafte Markdown-Syntax**: Das Skript prüft nach jedem Auto-Fix,
  ob die Datei noch valides Frontmatter hat (YAML-Block vorhanden). Falls nicht, stellt
  es die ursprüngliche Version wieder her und gibt `FAIL` zurück.

## Technische Constraints

- **DeepSeek wird über den Anthropic-kompatiblen Endpunkt angesprochen**:
  - `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`
  - `ANTHROPIC_API_KEY` = Wert aus `environments/.secrets/deepseek.sh` (Variable
    `ANTHROPIC_AUTH_TOKEN`)
  - Modell: `deepseek-chat`
  - Das Skript nutzt `curl` (kein Node.js-Dependency), da es in Bash geschrieben ist
    und auch in CI-Umgebungen ohne npm-Setup laufen soll.

- **Kein Chore-Check**: Das Skript prüft nur Plans für Feature/Fix. Chores haben keinen
  Plan und durchlaufen diesen Check nicht.

- **Skript-Größe**: `scripts/plan-qa-check.sh` soll unter 300 Zeilen bleiben (`.sh`-Limit 500).

- **Idempotent**: Mehrfaches Ausführen auf demselben Plan (nach manuellem Nachbessern)
  ist sicher. Der Auto-Fix-Zähler wird nicht persistiert — jeder Aufruf beginnt frisch.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `scripts/plan-qa-check.sh` | **neu** — DeepSeek-QA-Skript |
| `.claude/skills/dev-flow-plan/SKILL.md` | Schritt 4 um QA-Check ergänzen |
| `Taskfile.yml` | `task plan:qa` hinzufügen (S4-Gate) |
