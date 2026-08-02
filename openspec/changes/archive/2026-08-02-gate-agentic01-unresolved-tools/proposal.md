# Proposal: gate-agentic01-unresolved-tools

## Why

Gate `G-AGENTIC01` misst ein Stellvertretermerkmal statt des Schadens, den es verhindern soll. Es zählt, wie viele der drei Agenten `bachelorprojekt-{security,infra,db}` **keinen** `tools:`-Key tragen. Test `T002221` (`tests/spec/agent-library.bats:98`) fordert für genau diese drei das Gegenteil. Beide können nicht gleichzeitig erfüllt sein; der Test gewinnt, das Gate steht dauerhaft auf Warnung.

### Symptom (Fakt, gemessen 2026-08-01 auf `main` @6b565c158)

- `.claude/lib/goals.md:462` führt `G-AGENTIC01` mit Ist-Wert `3 ⚠`, Ziel `≤ 0`.
- Die Messung in `scripts/health-goals-check.sh:395-398` ausgeführt: liefert `3`.
- `tests/spec/agent-library.bats:98` fordert für dieselben drei Dateien `n -eq 0` Tools-Einträge und ist grün.

### Hypothese, die verifiziert wurde

Die Ticket-Beschreibung nannte den Widerspruch als Ursache der dauerhaften Warnung. Nachgemessen und **bestätigt**: das Gate prüft die Anwesenheit des Keys (`awk … /^tools:/`), der Test prüft die aufgelöste Toolmenge. Es sind zwei verschiedene Merkmale, und die von `T002221` gewählte Lösung (Key ganz entfernen) verletzt das erste zwangsläufig.

### Warum der naive Fix ausscheidet

Eine Liste aus reinen Built-ins (`Bash, Read, Glob, Grep`) macht das Gate grün, entzieht den Agenten aber ihre in `CLAUDE.md` als **primär** vorgeschriebenen MCP-Werkzeuge (`mcp-postgres` für `-db`, `mcp-kubernetes` für `-infra`). Das ist eine Funktionsregression, keine Rechteeinschränkung. Verifiziert mit `tests/spec/helpers/agent-tools.py`.

### Was der reale Schaden war

`T002221` war ein Bugfix: die frühere Liste nannte `mcp_postgres_query` statt `mcp__mcp-postgres__query`. Sie resolvte zur leeren Menge, und **jeder** Dispatch starb mit `would be spawned with zero tools - refusing`. Der schädliche Zustand ist also nicht „kein `tools:`-Key", sondern „ein `tools:`-Eintrag, der ins Leere zeigt".

## What

`G-AGENTIC01` wird auf den realen Schaden umgestellt. Gezählt werden künftig über **alle** `.claude/agents/*.md` zwei Zustände:

1. ein `tools:`-Key, der zur **leeren Menge** resolvt;
2. ein `tools:`-Eintrag der Form `mcp__<server>__<tool>`, dessen `<server>` nicht unter `clients:` in `docs/agent-guide/registry/mcp.yaml` steht.

Zustand 2 fängt die ursprüngliche Fehlschreibweise auch dann, wenn die Liste durch Built-ins nicht komplett leer resolvt — der Fall, den Zustand 1 allein durchlässt.

### Messstelle wird herausgelöst

Die Zählung steckt heute als Inline-Ausdruck in `row target G-AGENTIC01 "$( … )"` und ist von außen nicht aufrufbar. Ein Test könnte sie nur per `grep` auf den Quelltext prüfen — das verbietet die Test-Resultats-Konvention (`T002448-M4`). Die Zählung wandert deshalb nach `scripts/lib/count-unresolved-agent-tools.sh`, das Gate und Test gemeinsam aufrufen: eine Messstelle, zwei Konsumenten.

### Ehrliche Einordnung des Messwerts

Beide Zustände liefern auf dem heutigen Bestand `0`:

- Nur **ein** Agent (`bachelorprojekt-ops`) trägt überhaupt einen `tools:`-Key, und dieser resolvt zu vier Built-ins.
- Es existiert repo-weit **kein einziger** `mcp__*`-Eintrag in einem `tools:`-Key.

Das neue Gate wirkt damit als **Regressionsbremse**, nicht als Aufdeckung eines bestehenden Missstands. Es erhöht den gemessenen Wert heute nicht — es verhindert, dass der `T002221`-Bug unbemerkt zurückkehrt. Diese Einordnung gehört in die Gate-Beschreibung; ein Gate, das strukturell fast immer grün ist, darf nicht als Prüftiefe ausgegeben werden, die es nicht hat.

Daraus folgt eine Testauflage: der Repo-Ist-Zustand kennt keine Verstoß-Kandidaten, ein reiner Negativtest wäre also **vakuos** grün (`T002356-M1`). Die Tests arbeiten deshalb gegen Fixtures und enthalten Positiv-Anker.

## Nicht im Scope

- **Test `T002221` bleibt unverändert** und muss grün bleiben. Der Widerspruch wird einseitig auf der Gate-Seite aufgelöst.
- **`.claude/agents/bachelorprojekt-{db,infra,security}.md`** werden inhaltlich nicht geändert. Die Frontmatter-Kommentare, die die `T002221`-Entscheidung begründen, bekommen lediglich einen Verweis auf die neue Gate-Formulierung.
- Keine Änderung an anderen `G-AGENTIC*`-Zielen.

_Ticket: T002494_
