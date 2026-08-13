# Design: plan-context-unmatched-domains

_Ticket: T002614 — Brainstorming-Ergebnis (dev-flow-plan Fix-Pfad, Schritt 2.8)._

## Root Cause (verifiziert, T002448-M5)

Zwei unabhängige Lücken im Rollenfilter von `scripts/plan-context.sh`:

1. **Vokabular-Lücke:** `_role_allowlist()` kennt nur die Routing-Table-Wörter.
   Die beobachteten Korpus-Wörter (`scripts` 11×, `plan-authoring` 5×, `ci-cd`
   4×, `dev-tooling` 3×, `devflow`, `deployment`, `ticket-mcp`, …) matchen
   keine Allowlist. Die Exklusion ist still — es gibt keine WARN für
   unbekannte Domains (nur für unbekannte Rollen).
2. **Selbst-Match-Lücke:** Ein Domain-Token, das der volle Rollenname ist
   (`bachelorprojekt-test`), matcht die eigene Rolle nicht — der
   Token-Exakt-Vergleich prüft `$d` gegen die Allowlist-Wörter, und der
   Rollenname steht nicht darin. 4 aktive Proposals taggen genau so.

Beide Lücken sind mit einem Wegwerf-Repo reproduziert (siehe proposal.md,
MESSUNG-Block) und durch den RED-Test `tests/spec/dev-flow-plan/
domains-vocabulary.bats` abgesichert (6 rot auf Pre-Fix, 2 Anker grün).

## Optionen (aus dem Ticket) und Entscheidung

| Option | Bewertung | Entscheidung |
|---|---|---|
| (a) Allowlist um Korpus-Wörter erweitern | behebt den Bestand, aber "verschiebt das Problem bis zum nächsten frei erfundenen Wort" | **Ja, aber nicht allein** |
| (b) Fail-loud: stderr-WARN für Proposals ohne Anker | macht stille Exklusion sichtbar; direkt testbar | **Ja** |
| (c) Guard analog `toolset:check` | erzwingt Vokabular-Disziplin in CI | **Ja, als BATS-Korpus-Guard** |

Das Ticket empfiehlt (b)+(c) zusammen richtig; (a) allein reicht nicht. Wir
setzen alle drei um, weil (b) und (c) den Bestand nicht reparieren: Ohne (a)
bleiben die 11 `scripts`-Proposals unsichtbar — nur laut statt leise.

## Entscheidungen im Detail

### 1. Selbst-Match-Regel

Ein Domain-Token, das exakt `$ROLE` ist, matcht immer. Implementierung in der
Intersection-Prüfung (Zeile ~96-105), nicht als Allowlist-Edit in allen sechs
Zeilen — eine Stelle, ein Mechanismus. Wirkung: alle 4 Bestandsproposals mit
vollen Rollennamen erreichen ihre Rolle.

### 2. Vokabular-Erweiterung (Mapping)

Grundsatz: **nur Wörter mit einem nachvollziehbaren Anker in der
Routing-Tabelle werden gemappt**; mehrdeutige Wörter bleiben unmappt. Ein
Proposal braucht nur EIN gemapptes Token, um sichtbar zu sein; Proposals ohne
jeden Anker fallen unter Fail-loud (3) und Guard (4).

| Wort | Rolle(n) | Begründung |
|---|---|---|
| `scripts` | test | 11 Proposals, durchweg Prozess-/Devflow-Tooling; Routing-Signale `factory:`, `runner.sh`, `autopilot` liegen bei bachelorprojekt-test |
| `plan-authoring` | test | Plan-/Factory-Prozess (plan-lint, stage-plan, tasks.md) |
| `dev-tooling` | test | Synonym-Familie zu `scripts` |
| `ci-cd`, `ci` | test | CI-Prozess = Tests + Guards; Deploy-Themen taggen Autoren mit `infra`/`deploy` |
| `devflow` | test | dev-flow-Prozess (Factory/Plan-Skills) |
| `testing` | test | Synonym zu `test`/`tests` |
| `ticket-mcp` | test | Routing-Tabelle: ticket-mcp ist MCP-Primär von bachelorprojekt-test |
| `ticket-ops` | test | Ticket-Lebenszyklus = Factory-Prozess |
| `deployment` | infra | Synonym zu `deploy` (bereits infra) |
| `<rollenname>` | selbst | Regel 1 |

Bewusst **nicht** gemappt (kein Routing-Anker; im aktuellen Korpus immer in
Proposals mit mindestens einem gemappten Wort): `git`, `worktrees`, `skills`,
`hooks`, `docs`, `repo`, `subagent`, `agents`, `knowledge`, `agent-skills`.
Neue Vorschläge mit solchen Wörtern bleiben dank Guard sichtbar-kontrollierbar.

### 3. Fail-loud (stderr-WARN)

Ein Proposal ist **geankert**, wenn mindestens ein Domain-Token slash-frei ist
UND in der Vokabular-Union aller Rollen (inkl. Rollennamen) steht. Token mit
`/` sind Pfad-Verweise (`scripts/openspec.sh`, `repo/main-checkout`) und
zählen nie als Anker. Auf jedem Rollen-Lauf (Allowlist ≠ `__ALL__`):
`WARN: proposal <slug> has domains [<liste>] matching no role allowlist —
excluded for every role` auf stderr. `__ALL__`-Läufe (orchestrator,
unknown-role-Fail-Soft) inkludieren und warnen nicht.

`domains:` fehlend bzw. `domains: []` behalten ihr bestehendes Verhalten
(legacy-WARN bzw. Exklusion) — unverändert, nicht Teil dieses Fixes.

### 4. Korpus-Guard + `--vocab`-Flag

`plan-context.sh --vocab` gibt die Vokabular-Union (alle Rollen-Allowlists +
alle Rollennamen) als Token-Liste auf stdout aus — die WARN-Logik braucht die
Union ohnehin, der Flag macht sie abfragbar. Der BATS-Guard liest das
Vokabular aus dem Skript (Output-Verifikation, keine duplizierte Wortliste im
Test) und scannt den lebenden Korpus: jedes aktive Proposal muss geankert
sein. archive/, legacy-Proposals und `domains: []` sind ausgenommen.

Abweichung von der Fixture-Entkopplung (T001534/T001895): Der Guard liest
bewusst den echten Korpus. Die damalige Begründung (Races mit
openspec-workflow.bats) trifft auf einen rein lesenden Test nicht zu — im
Datei-Header dokumentiert.

## Edge Cases

- **Nur Pfad-Token** (`domains: [scripts/foo.sh]`): ungeankert → WARN. Der
  Autor muss ein Vokabular-Wort ergänzen — gewollt.
- **`domains: []` / fehlend:** bestehendes Verhalten (legacy-WARN bzw.
  Exklusion); kein neuer WARN-Text.
- **orchestrator / unbekannte Rolle:** `__ALL__` — inkludiert, keine
  dead-domains-WARN (die unknown-role-WARN bleibt).
- **Neues Wort im Korpus:** Guard rot → Wort in `_role_allowlist` mappen oder
  Proposal reparieren — der gewollte Rückkopplungs-Loop.
- **Regressionsschutz:** `tests/spec/plan-context.bats` (T001387, T002322)
  bleibt unangetastet und muss grün bleiben.

## Budget

`scripts/plan-context.sh`: Ist 186 Zeilen, nicht baselined, `.sh`-Limit 800 →
Budget 614. Die Änderung (Allowlist-Wörter, Selbst-Match, `--vocab`, WARN)
addiert grob 15-25 Zeilen — weit unter 80 % der Schwelle, kein Split nötig.
`tests/spec/dev-flow-plan/domains-vocabulary.bats`: neu, kein S1-Scope für
`.bats`.
