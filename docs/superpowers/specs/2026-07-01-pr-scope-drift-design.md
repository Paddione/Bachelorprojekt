---
ticket_id: T001364
plan_ref:
status: active
date: 2026-07-01
---

# PR/Commit Scope Single-Source-of-Truth — Design

## Problem

Drei Stellen im Repo entscheiden unabhängig voneinander, welche Commit-/PR-Scopes gültig sind,
und sie sind bereits auseinandergedriftet:

1. `commitlint.config.cjs` (`rules.scope-enum`) — laut Kommentar in `scripts/validate-commit-msg.sh`
   die "single source of truth", genutzt vom lokalen `pre-push`-Hook und vom CI-Schritt
   "Validate individual commit messages".
2. `.github/workflows/ci.yml` (`commit-lint`-Job, `amannn/action-semantic-pull-request` `scopes:`) —
   eine separat hartcodierte Kopie. Enthält zusätzlich `goals`, `openspec`, `mentolder-web`, `skills`,
   `quality`; es fehlt `arena` gegenüber `commitlint.config.cjs`.
3. `.github/workflows/pr-auto-title.yml` — leitet den Scope per Regex direkt aus dem Branch-Namen
   ab (`^(?:g-)?([a-z]{1,4}\d{2,3})-`) und validiert ihn gegen **keine** Liste. Ein Branch mit einem
   nie registrierten Präfix (z.B. `feature/xy09-...`) führt dazu, dass die PR mit einem erfundenen
   Scope (`feat(xy09): ...`) betitelt wird — der anschließend am eigentlichen Commit-Lint-Gate
   scheitert, ohne dass irgendwo markiert wurde, dass `xy09` ein neu anzulegender Scope ist.

Ergebnis: PRs mit nicht existierenden Scopes werden erzeugt, teils inkonsistent zwischen den
Gates akzeptiert/abgelehnt, und es gibt keinen Prozess, einen neuen Scope explizit zu registrieren.

## Ziel

`commitlint.config.cjs` wird die einzige tatsächliche Wahrheitsquelle. Alle Gates lesen daraus
(statt eigene Kopien zu pflegen), und es gibt einen expliziten Registrierungs-Schritt für neue
Scopes.

## Design

### 1. `scripts/validate-commit-msg.sh` — neuer `scopes`-Modus

Die bestehende `load_allowed_scopes()`-Funktion wird über einen neuen CLI-Modus exponiert:

```
validate-commit-msg.sh scopes
```

Gibt jeden erlaubten Scope auf einer eigenen Zeile aus (stdout), keine sonstige Ausgabe. Nutzt
intern dieselbe `load_allowed_scopes()`-Logik wie bisher (kein Duplikat).

### 2. `.github/workflows/ci.yml` — commit-lint Job lädt Scopes dynamisch

Neuer Schritt **vor** `amannn/action-semantic-pull-request`, nach dem bestehenden Checkout:

```yaml
- name: Load allowed scopes from commitlint.config.cjs
  id: load-scopes
  run: |
    {
      echo 'scopes<<SCOPES_EOF'
      bash scripts/validate-commit-msg.sh scopes
      echo 'SCOPES_EOF'
    } >> "$GITHUB_OUTPUT"
```

Der bisherige hartcodierte `scopes:`-Block im `amannn`-Action-Input wird ersetzt durch:

```yaml
scopes: ${{ steps.load-scopes.outputs.scopes }}
```

Die alte, driftende Inline-Liste (Zeilen ~314–403) entfällt vollständig.

### 3. `.github/workflows/pr-auto-title.yml` — Scope gegen SSOT validieren

Aktuell fehlt ein Checkout-Schritt (das Skript arbeitet nur mit `gh api`). Ergänzt wird:

- `actions/checkout` (shallow reicht — nur `commitlint.config.cjs` und `scripts/validate-commit-msg.sh`
  werden gebraucht).
- Nach der bestehenden Scope-Extraktion aus dem Branch-Slug (Schritt "3. Try to extract a scope"):
  der abgeleitete `SCOPE` wird gegen die Ausgabe von `bash scripts/validate-commit-msg.sh scopes`
  geprüft (exakter Zeilen-Match). Ist er nicht enthalten, wird `SCOPE=""` gesetzt — der komponierte
  Titel fällt auf `type: subject` zurück (kein erfundener Scope mehr im Titel). Das bestehende
  Verhalten für einen validen Scope ändert sich nicht.

Kein Blockieren des PRs — nur kein unregistrierter Scope mehr im Titel.

### 4. `scripts/register-scope.sh <scope>` — neues Skript

Registriert einen neuen Scope in `commitlint.config.cjs`:

- Validiert Format (`^[a-z0-9][a-z0-9-]*$`).
- Bricht mit klarer Meldung ab, wenn der Scope bereits in `rules.scope-enum` enthalten ist
  (idempotent — kein Duplikat-Eintrag).
- Fügt den Scope ans Ende des `scope-enum`-Arrays in `commitlint.config.cjs` ein (Node-basierter
  Edit, kein manuelles String-Patching — lädt das Modul, mutiert das Array in-memory, schreibt via
  `JSON.stringify`-nahes, aber Kommentar-erhaltendes Text-Insert vor der schließenden `]`-Zeile des
  Arrays; einfacher: Textzeilen-Insert vor der letzten Scope-Zeile, siehe Implementierungsplan).

Da CI (Punkt 2) und `pr-auto-title.yml` (Punkt 3) beide dynamisch aus `commitlint.config.cjs`
lesen, ist ein neu registrierter Scope sofort überall wirksam — keine zweite Liste mehr zu pflegen.

### 5. Doku-Hinweis in `.claude/skills/references/gh-axi.md` oder `git-workflow`-Referenz

Ein kurzer Abschnitt: bei neuem Goal-Code (z.B. `sec06`) zuerst
`bash scripts/register-scope.sh <scope>` ausführen und mitcommitten, bevor der Scope in
Commit-Messages verwendet wird.

## Testing

Neuer BATS-Test in `tests/spec/t001356-git02-conventional-commit.bats` (bestehende Spec-Datei zum
Conventional-Commit-Gate, T001356 ist der thematische Vorgänger):

- `validate-commit-msg.sh scopes` gibt eine non-leere, zeilengetrennte Liste aus, die `website`
  und `ci` enthält (Stichprobe).
- `register-scope.sh` fügt einen neuen Test-Scope hinzu, `scopes`-Ausgabe enthält ihn danach.
- `register-scope.sh` mit bereits vorhandenem Scope bricht mit Exit ≠ 0 ab, ohne die Datei zu
  verändern (Idempotenz/Duplikat-Schutz).
- `register-scope.sh` mit ungültigem Format (z.B. Großbuchstaben) bricht ab.

`pr-auto-title.yml`-Fallback-Logik (unbekannter Scope → kein Scope im Titel) ist Workflow-YAML und
nicht direkt per BATS testbar — wird stattdessen durch Extraktion der Kernlogik in ein eigenes,
testbares Shell-Snippet oder durch einen expliziten Kommentar-Verweis im Workflow auf den
BATS-Test der zugrunde liegenden `scopes`-Quelle abgedeckt (Kernrisiko — fehlende Scope-Liste —
ist bereits getestet).

## Out of Scope

- Keine Änderung an den erlaubten *Typen* (`feat`, `fix`, …) — nur Scopes.
- Kein automatisches Entfernen ungenutzter Scopes aus `commitlint.config.cjs`.
- Keine Änderung am lokalen `pre-push`-Hook-Verhalten (nutzt weiterhin `validate-commit-msg.sh`
  unverändert für `range`/`head`/`message`).
