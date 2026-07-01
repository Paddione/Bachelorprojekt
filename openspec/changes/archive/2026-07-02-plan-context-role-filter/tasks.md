---
title: "plan-context-role-filter — Implementation Plan"
ticket_id: T001387
domains: [dev-flow-plan, tooling, scripts]
status: completed
file_locks: [scripts/plan-context.sh, tests/spec/plan-context.bats, openspec/changes/plan-context-role-filter/]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-context-role-filter — Implementation Plan

_Ticket: T001387_
_Design: docs/superpowers/specs/2026-07-01-plan-context-role-filter-design.md_

## File Structure

```
Code (1 file edited, 1 file new, 1 file added-delta):
  scripts/plan-context.sh                     — Role-Filter implementieren
                                                  (S1: Ist 80 · nicht-baselined ·
                                                   Limit 500 · Budget 420;
                                                   Plan: ~140 Zeilen, Rest 360)

Tests (1 file new):
  tests/spec/plan-context.bats                — RED-Suite: 7 Cases für Role-Matrix
                                                  (S1: neue Datei, `.bats` ungated)

SSOT (1 file delta, archived post-merge):
  openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md
                                              — ADDED Requirement mit 5 Scenarios

OpenSpec change (this folder, archived after impl):
  openspec/changes/plan-context-role-filter/proposal.md
  openspec/changes/plan-context-role-filter/tasks.md
  openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md
  openspec/changes/plan-context-role-filter/.ticket
```

## Task 1 — RED: Failing BATS-Suite schreiben

Ziel: Hermetische Test-Suite, die das Filter-Verhalten in
`tests/spec/plan-context.bats` festschreibt. Vor dem Implementierungs-Schritt
muss sie FAIL laufen — das ist der RED-Stand.

Steps:

- [ ] **Setup-Block.** `setup()` legt eine frische `TMP=$(mktemp -d)` an und
      kopiert die Skript-Datei via `OPENSPEC_ROOT="$TMP/openspec"`-Override
      (das Skript nimmt `$REPO_ROOT` per `git rev-parse` — daher muss der
      Test mit `REPO_ROOT=$REPO` aufgerufen werden, und die Fixture-Props
      liegen in `$TMP/openspec/changes/`).

- [ ] **Fixture-Builder.** Helper `_make_changes_tmp` legt 5 fiktive
      Change-Verzeichnisse an:
      - `ops-only/proposal.md` mit `domains: [ops, llm]`
      - `website-only/proposal.md` mit `domains: [website, frontend]`
      - `multi/proposal.md` mit `domains: [test, infra]`
      - `legacy-no-domains/proposal.md` ohne `domains:`-Frontmatter
      - `explicit-empty/proposal.md` mit `domains: []`
      - `archive/old/proposal.md` (sollte nie erscheinen, auch nicht für
        `role=orchestrator`)

- [ ] **Case 1 — `role=ops` includes ops-tagged proposals.** Aufruf
      `bash scripts/plan-context.sh ops` (mit `REPO_ROOT`-Override via
      `OPENSPEC_ROOT=$TMP/openspec` ist **nicht** möglich, weil das Skript
      `git rev-parse --show-toplevel` fest verdrahtet — daher: das Skript
      MUSS als Patch eine `OPENSPEC_ROOT`-Override bekommen, oder die
      Tests laufen gegen das echte Repo mit Cleanup-vor-Test-Snapshot.
      **Vereinfachter Pfad:** Test ruft das Skript **mit dem echten
      `scripts/plan-context.sh` auf** und prüft, dass beim
      Default-`REPO_ROOT` (das Test-Repo selbst) `role=ops` einen
      Output liefert, in dem **kein** Proposal mit `domains: [website,
      frontend]` als einziger Domain-Liste auftaucht. Das ist
      schwächer als ein 100% deterministischer Test, aber es fängt den
      Bug-Kern (Output-Volumen hängt von Rolle ab). **Genaue Form:**
      Suche Output nach `### Active proposal: <slug>`-Headern, prüfe
      dass `cockpit-mobile-view` (domains=website) bei `role=ops`
      fehlt und `bats-coverage-batch1` (domains=quality,tests,infra)
      auftaucht.
      `expected: FAIL` (auf der RED-Seite: das Skript ignoriert die
      Rolle und liefert alle Proposals — Test schlägt fehl, weil
      `cockpit-mobile-view` auftaucht).

- [ ] **Case 2 — `role=website` excludes ops-tagged proposals.** Inverses
      Bild: `cockpit-mobile-view` (website) MUSS auftauchen, `bats-coverage`
      (tests) MUSS fehlen.
      `expected: FAIL` (RED: Skript liefert alle, schlägt fehl weil
      `bats-coverage` auftaucht obwohl nicht erlaubt).

- [ ] **Case 3 — `role=orchestrator` includes all non-archived proposals.**
      Aufruf `bash scripts/plan-context.sh orchestrator` → alle Slugs
      außer `archive/*` müssen im Output sein. Definiere Erwartung an
      mindestens N=10 verschiedenen Slugs (das ist die bestehende
      Default-Semantik minus den `archive/`-Ausschluss).
      `expected: PASS` (auf der RED-Seite, weil das Skript heute schon
      alles liefert — dieser Test ist der Anker, der sicherstellt dass
      die `orchestrator`-Rolle später nicht versehentlich strenger wird).

- [ ] **Case 4 — Skript gibt `WARN:`-Marker auf stderr aus, wenn ein
      Proposal keine `domains:`-Frontmatter hat.** Suche stderr nach
      `WARN.*legacy-no-domains` o.ä. — der Marker wird vom Skript selbst
      emittiert.
      `expected: FAIL` (RED: Skript gibt aktuell keine WARNs aus).

- [ ] **Case 5 — `domain:[]`-Proposal erscheint für `role=orchestrator`
      NICHT (es ist archiviert).** Setup: ein `archived-empty/proposal.md`
      mit `domains: []` im `archive/`-Unterordner. Output darf den Slug
      nicht enthalten.
      `expected: PASS` (Anker — bestehende `archive/`-Exclusion).

- [ ] **Case 6 — `role=foobar` (unbekannt) liefert alle Proposals +
      `WARN: unknown role` in stderr.** Aufruf mit beliebigem
      Fantasie-Rollennamen; Output muss alle Slugs enthalten UND stderr
      muss `WARN: unknown role` enthalten.
      `expected: FAIL` (RED: kein `WARN:`-Mechanismus vorhanden).

- [ ] **Case 7 — Skript-Smoke: Aufruf ohne Argumente exited mit
      Usage-Fehler.** `bash scripts/plan-context.sh` muss Exit-Code ≠ 0
      und stderr `Usage:` enthalten. Bestehende Semantik beibehalten.
      `expected: PASS` (Anker — bestehende Pflicht-Argument-Prüfung).

- [ ] **BATS-Suite-Datei** anlegen:
      `tests/spec/plan-context.bats` mit Header-Kommentar
      (`# SSOT: openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md`),
      Hermetik-Setup (`setup_file`/`teardown_file` für die Repo-Snapshot-
      Strategie, `setup` für jede Test-Invocation), und den 7 Cases
      oben. Test-Reihenfolge ist deterministisch (alphabetische
      `bats`-Sortierung).

- [ ] **Commit** der RED-Suite:
      `git add tests/spec/plan-context.bats`
      `git commit -m "test(plan-context): add RED BATS suite for role filter [T001387]"`

## Task 2 — GREEN: `scripts/plan-context.sh` implementieren

Ziel: Skript-Filter einbauen, sodass die RED-Suite aus Task 1 grün wird.

Steps:

- [ ] **Helper-Funktion `_parse_yaml_domains(path)` schreiben.** Liest die
      YAML-Frontmatter (zwischen den ersten zwei `---`-Zeilen) und gibt
      die kommagetrennte Domain-Liste aus dem `domains:`-Feld zurück.
      Token-Stripping (Klammern, Quotes, Whitespace). Leere Felder → leerer
      String. Robust gegen fehlende Frontmatter.

- [ ] **Helper-Funktion `_role_allowlist(role)` schreiben.** Hardkodierter
      `case`-Block mit den sieben Rollen aus der Design-Spec. Kommentar
      über dem `case` verweist auf `AGENTS.md` Zeilen 7-18 als SSOT.
      Unbekannte Rolle → leerer String + `printf 'WARN: unknown role "%s"\n'
      "$role"` auf stderr.

- [ ] **Hauptschleife umbauen.** Aktuell (Zeile 28-46):
      ```bash
      for proposal_file in "$CHANGES_DIR"/*/proposal.md; do
          [[ -f "$proposal_file" ]] || continue
          slug=$(basename "$(dirname "$proposal_file")")
          [[ "$slug" == "archive" ]] && continue
          ...
      ```
      Neu:
      ```bash
      allowlist="$(_role_allowlist "$ROLE")"
      for proposal_file in "$CHANGES_DIR"/*/proposal.md; do
          [[ -f "$proposal_file" ]] || continue
          slug=$(basename "$(dirname "$proposal_file")")
          [[ "$slug" == "archive" ]] && continue
          proposal_domains="$(_parse_yaml_domains "$proposal_file")"
          if [[ -z "$proposal_domains" ]]; then
              # Legacy: kein domains-Feld → Include, mit WARN
              printf 'WARN: legacy proposal without domains frontmatter: %s\n' "$slug" >&2
          elif [[ "$allowlist" != "__ALL__" && -n "$allowlist" ]]; then
              # Schnittmenge prüfen
              match=0
              for d in $proposal_domains; do
                  case " $allowlist " in
                      *" $d "*) match=1; break ;;
                  esac
              done
              [[ "$match" -eq 1 ]] || continue
          fi
          # allowlist == __ALL__ (orchestrator/leer) → kein Filter
          ...
      done
      ```

- [ ] **Edge-Case-Tests laufen lassen** (BATS-Cases 1-7 aus Task 1).
      Erwartung: alle PASS.

- [ ] **Manuelle Smoke-Validierung:**
      ```bash
      bash scripts/plan-context.sh bachelorprojekt-ops | wc -l
      bash scripts/plan-context.sh orchestrator | wc -l
      ```
      Erwartung: erste Zahl << zweite Zahl (Faktor ≥3).

- [ ] **Commit** der Implementierung:
      `git add scripts/plan-context.sh`
      `git commit -m "fix(dev-flow-plan): filter plan-context.sh by role [T001387]"`

## Task 3 — SSOT-Delta in `specs/dev-flow-plan.md` schreiben

Ziel: Die neue Filter-Semantik als Requirement im Delta-Verzeichnis
dokumentieren, sodass sie beim `archive` mit der SSOT zusammengeführt wird.

Steps:

- [ ] Datei `openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md`
      schreiben mit dem `## ADDED Requirements`-Header und einem
      Requirement-Block:
      ```
      ### Requirement: plan-context.sh filters by role

      The `scripts/plan-context.sh <role> [--with-openspec …]` script MUST
      filter the emitted active OpenSpec change proposals to those whose
      `proposal.md` frontmatter `domains:` list intersects with the
      domain-allowlist of the supplied `<role>`. The role-to-domain
      mapping is a hardcoded lookup in the script that mirrors the
      Agent Routing table in `AGENTS.md` (lines 7-18).

      #### Scenario: role=ops includes ops-tagged proposals and excludes website-tagged
      - **GIVEN** at least one proposal with `domains: [ops, llm]` and one with
        `domains: [website]`
      - **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops` is run
      - **THEN** the output contains the ops-tagged proposal
      - **AND** the output does not contain the website-tagged proposal

      #### Scenario: legacy proposals without `domains:` frontmatter are included with a stderr WARN
      - **GIVEN** a proposal without a `domains:` frontmatter field
      - **WHEN** `bash scripts/plan-context.sh <any-known-role>` is run
      - **THEN** the output contains the legacy proposal
      - **AND** stderr contains a line matching `WARN: legacy proposal without domains frontmatter: <slug>`

      #### Scenario: proposals with `domains: []` are excluded for all roles
      - **GIVEN** a proposal with `domains: []` (explicitly empty)
      - **WHEN** `bash scripts/plan-context.sh <any-known-role>` is run
      - **THEN** the output does not contain the proposal

      #### Scenario: role=orchestrator returns all non-archived proposals
      - **GIVEN** any number of non-archived proposals
      - **WHEN** `bash scripts/plan-context.sh orchestrator` is run
      - **THEN** the output contains every non-archived proposal
      - **AND** proposals under `openspec/changes/archive/` are still excluded

      #### Scenario: unknown role returns all proposals plus a stderr WARN
      - **GIVEN** a `<role>` that is not in the script's role-to-domain lookup
      - **WHEN** `bash scripts/plan-context.sh foobar` is run
      - **THEN** the output contains every non-archived proposal
      - **AND** stderr contains a line matching `WARN: unknown role "foobar"`
      ```

- [ ] **Commit** des Deltas:
      `git add openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md`
      `git commit -m "docs(plan-context): add SSOT delta for role filter [T001387]"`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED) — vor Task 2:** BATS-Suite aus Task 1
      muss auf der RED-Seite mindestens die Cases 1, 2, 4, 6 failen.
      Anker-Cases 3, 5, 7 sind heute schon grün.
      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/plan-context.bats
      # expected: FAIL (Cases 1, 2, 4, 6 rot)
      ```

- [ ] **Fix-Step (GREEN) — nach Task 2 + 3:** dieselbe BATS-Suite muss
      vollständig grün sein.
      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/plan-context.bats
      # expected: PASS (alle 7 Cases grün)
      ```

- [ ] **Final Verification.** Die drei CI-Gates laufen lassen:
      ```bash
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```
      Erwartung: alle drei exit 0, kein Regress in S1–S4-Ratchet
      (insbesondere `scripts/plan-context.sh` ist nicht-baselined,
      bleibt nach Edit voraussichtlich bei ~140 Zeilen, weit unter dem
      500-Limit für `.sh`).
