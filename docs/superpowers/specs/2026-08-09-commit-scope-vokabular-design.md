# Commit-Scope-Vokabular — Design (T002814)

## Ausgangsbefund (verifiziert, nicht Hypothese)

Ticket T002814 beschreibt das Symptom als "zwei Commit-Message-Validatoren mit
unterschiedlichem Scope-Vokabular". Die Recherche vor diesem Design widerlegt die Diagnose,
bestätigt aber das Symptom:

- Es gibt **ein** SSOT für erlaubte Scopes: `commitlint.config.cjs`
  (`NAMED_SCOPES` + `SCOPE_ALIAS_GROUPS`), gelesen über `scripts/validate-commit-msg.sh`.
  Dieses Skript ist die **einzige** Implementierung und wird von drei Stellen aufgerufen:
  `.githooks/commit-msg` (lokal, blockierend), der CI-Job „Validate individual commit
  messages" (`.github/workflows/ci.yml`) und `scripts/preflight-pr-scope.sh` (lokal, vor
  `gh pr create`, Teil des `git-workflow`-Skills). Es gibt keine zweite Implementierung, die
  divergieren könnte.
- Der CI-Job „PR-Titel-Check" (`amannn/action-semantic-pull-request`) validiert **bewusst
  keinen Scope** — das steht wörtlich als Kommentar im Workflow: „Scopes are NOT enforced
  here … named-scope enforcement happens later via scripts/validate-commit-msg.sh range."
  Ein grüner PR-Titel-Check ist also keine Aussage über Scope-Gültigkeit.
- Rekonstruiert, wie `fix(mcp-gateway): …` (PR #3918) trotzdem auf `main` landen konnte: die
  individuellen Commits auf dem PR-Branch hatten vermutlich gültige Scopes; beim
  Squash-Merge wird aber der **PR-Titel** zum finalen Commit-Subject auf `main` — und dieser
  Titel wird nach dem PR-Title-Check nie erneut gegen die Scope-Allowlist geprüft. Die
  Lücke ist real, aber sie liegt zwischen „PR-Titel prüfen" und „Squash-Commit prüfen", nicht
  zwischen zwei Vokabularen.
- `mcp-gateway` ist ein aktiver, mehrfach verwendeter Scope (`openspec/specs/mcp-gateway.md`
  existiert als SSOT-Spec; PRs #3650, #3918 nutzten ihn). Im Konsolidierungs-Design von
  T002328 (`openspec/changes/archive/2026-07-27-commit-scope-consolidation/design.md`) taucht
  „gateway" an keiner Stelle auf — der Scope wurde beim Zusammenziehen von 95 auf 14 Scopes
  schlicht übersehen, nicht bewusst zurückgezogen (anders als `tracking`/`livekit`, die mit
  Begründung in `SCOPE_RETIRED` stehen).
- `tickets` ist dagegen **korrekt** abgelehnt: es ist bereits als Alias auf `factory`
  gemappt (`SCOPE_ALIAS_GROUPS.factory` enthält `'tickets'`) und liefert beim Ablehnen den
  Hinweis „'tickets' wurde zu 'factory' konsolidiert (T002328)". Das ist die beabsichtigte
  Konsolidierung, kein Bug — wird **nicht** angefasst.
- Kurzer Gegencheck (keine Vollaudit-Pflicht): `git log --since=2026-07-27` zeigt sechs
  weitere, seither auf `main` gelandete, unbekannte Scopes (`toolset`, `routes`,
  `e2e-testing`, `devflow`, `dev-flow-e2e`, `ci-cd`) — vermutlich über denselben
  Squash-Titel-Mechanismus. Das bestätigt, dass die Lücke systemisch ist, nicht nur
  `mcp-gateway` betrifft. Diese sechs werden **nicht** in diesem Change nachgezogen (Scope
  Creep bei einem als „trivial" eingestuften Ticket) — stattdessen wird die Beobachtung als
  Kommentar im Code hinterlegt, damit sie beim nächsten Antreffen nicht neu recherchiert
  werden muss.
- `divergence-guard`-Präzedenzfall (`openspec/specs/divergence-guard.md`, „bewusste
  Duplizierung der Branch-Namens-Validierung zwischen Hook und Helper, damit eine fehlende
  Repo-Datei nicht jeden Commit blockiert") **trägt hier nicht**: er rechtfertigt eine
  bewusste Zweit-Implementierung. Hier existiert aber nur eine Implementierung an mehreren
  Aufrufstellen — es gibt nichts zu vereinheitlichen.

## Entscheidung

Zwei kleine, unabhängige Änderungen, beide mit minimalem Footprint:

### (a) `mcp-gateway` als Alias ergänzen

In `commitlint.config.cjs`, `SCOPE_ALIAS_GROUPS.mcp` (aktuell nur `['mcp-task-runner']`) um
`'mcp-gateway'` erweitern. Damit liefert `scope_hint('mcp-gateway')` künftig „'mcp-gateway'
wurde zu 'mcp' konsolidiert (T002328)" statt der generischen Tippfehler-Heuristik
„did you mean 'mcp'?" — und Autoren wissen sofort, dass es kein Tippfehler, sondern ein
zusammengelegter Scope ist.

### (c) Hinweistext bei Ablehnung ergänzen

In `scripts/validate-commit-msg.sh`, `validate_subject()`, nach der bestehenden
Ablehnungszeile für unbekannte Scopes eine zusätzliche, immer gedruckte Zeile ergänzen, die
klarstellt, dass der CI-PR-Titel-Check keine Scope-Prüfung vornimmt — damit niemand mehr aus
einem grünen PR-Titel-Check falsche Sicherheit über den Scope ableitet. Da dieses Skript die
einzige Implementierung ist und von Hook **und** CI **und** `preflight-pr-scope.sh` genutzt
wird, reicht eine Änderung an einer Stelle, um die Botschaft überall auszuliefern — keine
zweite Stelle nötig (`.github/workflows/ci.yml` hat den erklärenden Kommentar für
Maintainer bereits).

Kein Test greift auf den Wortlaut der neuen Hinweiszeile (T002716) — Tests prüfen weiterhin
Exit-Code und die bestehenden, stabilen Substrings (`unknown scope`, Ziel-Scope-Name).

## Betroffene Dateien

- `commitlint.config.cjs` — `SCOPE_ALIAS_GROUPS.mcp` um `'mcp-gateway'` erweitern.
- `scripts/validate-commit-msg.sh` — zusätzliche Hinweiszeile in `validate_subject()`.
- `tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats` (neu) — Output-Verifikation
  (T002448-M4) mit Positiv-Anker (T002356-M1): ein gültiger Scope (`ops`) MUSS im selben Test
  durchlaufen, `mcp-gateway` MUSS mit dem Konsolidierungs-Hinweis abgelehnt werden, `tickets`
  MUSS weiterhin mit dem `factory`-Hinweis abgelehnt werden (Regressionsschutz gegen
  versehentliches Wiederherstellen).

## Out of Scope

- `tickets` NICHT als eigenständiger Scope wiederherstellen.
- Die sechs weiteren im Gegencheck gefundenen Scopes (`toolset`, `routes`, `e2e-testing`,
  `devflow`, `dev-flow-e2e`, `ci-cd`) NICHT in diesem Change nachziehen — als Kommentar im
  Code dokumentiert, nicht als eigenes Ticket (Severity/Aufwand steht in keinem Verhältnis
  zu einem eigenen Vorgang; wird beim nächsten thematischen Antreffen aufgegriffen).
- Kein neuer CI-Schritt, der den finalen Squash-Commit-Titel nachträglich validiert — das
  wäre die naheliegende strukturelle Lösung für die Root Cause (Squash-Titel wird nie gegen
  die Scope-Allowlist geprüft), aber ein eigener, größerer Vorgang mit eigener
  Kosten/Nutzen-Abwägung (govern squash-merge validation braucht eine Post-Merge-Prüfung
  oder ein PR-title-Scope-Gate direkt im PR-Titel-Check-Job). Für dieses „trivial"-Ticket
  bewusst zurückgestellt.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/commit-scope-vokabular
tests/unit/lib/bats-core/bin/bats -r tests/spec/t001356-git02-conventional-commit.bats
task test:changed
task freshness:regenerate && task freshness:check
```
