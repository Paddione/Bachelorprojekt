---
title: "repo-structure-reorg — Implementation Plan (Partial p1-md-kur)"
ticket_id: T006999
domains: [repo-structure]
status: active
---

# repo-structure-reorg — Implementation Plan (Partial p1-md-kur)

_Ticket: T006999_

Partial p1-md-kur = MD-Konsolidierung, risikofallend zuerst (Design.md „Ausführungs-Strategie", Reihenfolge 1). Die Persona-MDs (`SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`) verlassen die Repo-Root und wandern nach `docs/agent-context/`; `QWEN.md` wird von 335 Zeilen Projekt-Kontext-Duplikat auf einen Zeiger auf `CLAUDE.md` reduziert (Vorbild `GEMINI.md`). Die Root behält nur noch Harness-Einstiege und GitHub-Konventionen (Delta-Spec `repo-structure.md`, Requirement „Repo root carries only harness and GitHub convention files").

Disjunktheit (D1): `website/src/data/test-inventory.json` wird in diesem Partial NICHT regeneriert und NICHT committet — die einmalige Regenerierung für alle vier Guards übernimmt p4-website.

## File Structure

| Datei | Ist (wc -l) | Budget / Anmerkung |
|---|---|---|
| `tests/spec/repo-structure/root-agent-md.bats` | NEU | S1-Budget: kein Zahlen-Claim — `.bats` hat kein Limit in `gates.yaml` `s1.limits`, nicht-baselined |
| `docs/agent-context/persona.md` | NEU | S1-Budget: kein Zahlen-Claim — `.md` ungetated, `docs/` liegt außerhalb `scan.code_roots` |
| `docs/agent-context/user.md` | NEU | dito |
| `docs/agent-context/heartbeat.md` | NEU | dito |
| `QWEN.md` | 335 → ~15 (Zeiger) | S1-Budget: kein Zahlen-Claim — nicht-baselined, `.md` ungetated → `residual_budget` leer |
| `SOUL.md` | 38 → gelöscht | entfällt mit Löschung (`git rm`, History bleibt) |
| `IDENTITY.md` | 13 → gelöscht | entfällt |
| `USER.md` | 21 → gelöscht | entfällt |
| `HEARTBEAT.md` | 7 → gelöscht | entfällt |
| `docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md` | untracked (7,2 KB) | wird unverändert mitcommittet — kein inhaltlicher Edit |

## Ausgangslage (verifizierte Referenz-Messung)

MESSUNG (2026-08-15, `git grep`, gegen HEAD `7ae8d8279fd0f3286df257d9afe233d30edc5b94`, Ausschlüsse: node_modules/.git/tmp/k3d/docs-content-built/openspec):

```bash
git grep -n -E 'SOUL\.md|IDENTITY\.md|USER\.md|HEARTBEAT\.md|QWEN\.md' -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec/changes' ':!docs/superpowers/specs'
```

Ergebnis: keine maschinellen Referenzen. Die einzigen Treffer sind Selbstreferenzen (Datei-Titel in den jeweiligen H1-Zeilen) und `QWEN.md:323` (Dateimap-Zeile auf `IDENTITY.md` — entfällt, weil der gesamte 335-Zeilen-Inhalt durch den Zeiger ersetzt wird). Weder `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.opencode/`, `.openclaw/`, `.agy/`, `.github/workflows/`, `scripts/`, `tests/` noch `docs/` referenzieren die Persona-Dateien oder `QWEN.md` — sie sind reine Root-Lese-Konvention für Agenten. Konsequenz: kein Referenz-Update nötig. Die Erwähnungen in `openspec/changes/` (design.md, proposal.md) und in der Design-Doc (`docs/superpowers/specs/`) sind Prosa des Changes selbst und werden von der maschinellen Prüfung bewusst ausgeschlossen. Die Prüfung wird in P1.4 nach den Moves wiederholt und muss dann leer bis auf den QWEN-Selbsttitel sein.

## Task P1.1 — Guard schreiben (RED)

Neue Datei `tests/spec/repo-structure/root-agent-md.bats` (T002416: Verzeichnis pro SSOT-Spec-Slug, eine Datei pro Vorgang; Slug `repo-structure` aus der Delta-Spec):

```bash
mkdir -p tests/spec/repo-structure
```

Dateiinhalt (Prüfmodus im Header dokumentiert, T002448-M4):

```bats
# tests/spec/repo-structure/root-agent-md.bats
# Prüfmodus: Querschnitt über den Dateisystem-Zustand des Arbeitsbaums — das Ergebnis
# manifestiert sich ausschließlich im Repo-Zustand (T002448-M4-Ausnahme für
# Dokumentationskonventionen). Positiv-Anker zuerst (T002356-M1): der gültige Fall
# (Persona-Dateien unter docs/agent-context) muss durchlaufen, sonst ist die
# Negativ-Aussage (keine Root-Persona-MDs) vakuos.
# Gehört zum OpenSpec-Change repo-structure-reorg (T006999), SSOT-Spec-Slug: repo-structure.

@test "Persona-MDs: konsolidiert unter docs/agent-context, nicht mehr in der Root" {
  # Positiv-Anker: Zielzustand vorhanden
  [ -f docs/agent-context/persona.md ]
  [ -f docs/agent-context/user.md ]
  [ -f docs/agent-context/heartbeat.md ]
  # Negativ-Aussage: Root-Persona-Dateien sind entfernt
  for f in SOUL.md IDENTITY.md USER.md HEARTBEAT.md; do
    [ ! -e "$f" ]
  done
}

@test "QWEN.md: Zeiger auf CLAUDE.md statt Kontext-Duplikat" {
  [ -f QWEN.md ]
  grep -qF 'CLAUDE.md' QWEN.md
}
```

- [ ] Guard-Lauf ausführen (RED):
      `tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/root-agent-md.bats`
- [ ] Erwartung: `expected: FAIL` — Exit ungleich 0, weil der Positiv-Anker
      `docs/agent-context/persona.md` noch nicht existiert. Der zweite Test ist hier
      bereits grün (QWEN.md erwähnt CLAUDE.md schon heute) — der RED-Treiber ist der
      Positiv-Anker; Assertion (c) pinnt die Zeiger-Semantik für die Zukunft (ein
      Rewrite ohne CLAUDE.md-Bezug färbt rot).
- [ ] Die Datei NICHT committen, bevor sie grün läuft — erst nach den Moves (P1.4)
      ist der Zustand gültig.

## Task P1.2 — docs/agent-context/ anlegen

- [ ] Verzeichnis anlegen und drei Dateien aus den Root-MDs befüllen (Quellen per
      Read-Kopie übernehmen, keine Neuformulierung):
      `mkdir -p docs/agent-context`
- [ ] `docs/agent-context/persona.md`: Konsolidierung von SOUL.md + IDENTITY.md.
      Neue H1 `# persona.md — Agent-Persona (SOUL + IDENTITY)`, danach der
      IDENTITY.md-Inhalt wörtlich (Metadaten-Liste Name/Creature/Vibe/Emoji/Avatar
      und beide Kontext-Absätze), dann der SOUL.md-Inhalt wörtlich (Core Truths,
      Boundaries, Vibe, Continuity; die Zeile mit dem Link `/concepts/soul` bleibt
      enthalten).
- [ ] `docs/agent-context/user.md`: Inhalt von USER.md wörtlich, H1
      `# user.md — About Your Human`.
- [ ] `docs/agent-context/heartbeat.md`: Inhalt von HEARTBEAT.md wörtlich, H1
      `# heartbeat.md Template` — die Datei selbst trägt den Hinweis, dass sie leer
      bleiben soll („Keep this file empty (or with only comments) to skip heartbeat
      API calls.").
- [ ] Reihenfolge ist bewusst: die neuen Dateien entstehen, BEVOR die Quellen per
      `git rm` entfernt werden (P1.4) — kein Inhaltsverlust möglich.

## Task P1.3 — QWEN.md auf Zeiger reduzieren

`QWEN.md` komplett ersetzen durch (Vorbild GEMINI.md — bewusst dünn, kein
Projekt-Kontext-Duplikat; H1 behält den Namen, der Selbsttitel ist der einzig
verbliebene Treffer der Referenz-Verifikation):

````markdown
# QWEN.md — Project Context

Kontextdatei für Qwen-Modelle. Sie ist bewusst ein **Zeiger**, keine eigene Zusammenfassung
des Projekts.

## Lies stattdessen diese

- **[CLAUDE.md](CLAUDE.md)** — die maßgebliche Referenz: Agent-Routing, Architektur,
  Cluster-Topologie, Konfigurationsmuster, CI/CD, Entwicklungsregeln, Footguns.
- **[AGENTS.md](AGENTS.md)** — cross-harness Quick-Start: Kernkommandos, Workflow-Regeln,
  OpenSpec-Konventionen.

Beide sind für dich gedacht — öffne sie, statt dich auf diese Datei zu verlassen.

## Kommandos nicht raten

```bash
bash scripts/vda.sh oracle '<was du erreichen willst, in einem Satz>'
```

## Warum diese Datei so dünn ist

Sie duplizierte 335 Zeilen Projekt-Kontext, der in CLAUDE.md maßgeblich gepflegt wird.
Duplizierte Ebenen driften — diese Datei bitte nicht „vervollständigen".
````

- [ ] Nach dem Ersetzen `wc -l QWEN.md` prüfen: Ziel ~15 Zeilen (kein S1-Claim, siehe
      File Structure).
- [ ] Die 335 Zeilen Projekt-Kontext-Duplikat sind vollständig entfernt — nichts
      davon wird woandershin kopiert (CLAUDE.md ist die maßgebliche Referenz).

## Task P1.4 — Root-Persona-MDs entfernen, Referenz-Verifikation, Guard grün (GREEN)

- [ ] Löschen (History bleibt erhalten):
      `git rm SOUL.md IDENTITY.md USER.md HEARTBEAT.md`
- [ ] Referenz-Verifikation wiederholen (identische Suche wie in der Ausgangslage):
      `git grep -n -E 'SOUL\.md|IDENTITY\.md|USER\.md|HEARTBEAT\.md|QWEN\.md' -- . ':!node_modules' ':!tmp' ':!k3d/docs-content-built' ':!openspec/changes' ':!docs/superpowers/specs'`
      Erwartung: genau ein Treffer — der Selbsttitel `# QWEN.md — Project Context`
      in QWEN.md. Weitere Treffer wären Referenz-Updates nötig machende Funde
      (aktueller Befund: keine).
- [ ] Guard-Lauf (GREEN):
      `tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/root-agent-md.bats`
      — Exit 0: alle drei Zusicherungen (Positiv-Anker, Negativ-Aussage,
      QWEN-Zeiger) grün.

## Task P1.5 — Design-Doc mitcommitten (atomarer Commit)

- [ ] Gezieltes Staging statt `git add -A` (so kann das Inventar nie in den Commit):
      `git add docs/agent-context/ QWEN.md tests/spec/repo-structure/root-agent-md.bats`
- [ ] Die untracked Design-Doc wird im selben Commit mitcommittet, unverändert (kein
      inhaltlicher Edit):
      `git add docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md`
- [ ] Commit (Scope `docs` ist gültig laut `validate-commit-msg.sh scopes`):
      `git commit -m "chore(docs): Persona-MDs nach docs/agent-context, QWEN.md als Zeiger [T006999]"`
- [ ] Sichtprüfung: `git show --stat HEAD` — es sind ausschließlich die Pfade aus der
      File Structure enthalten, insbesondere NICHT `website/src/data/test-inventory.json`.

## Task P1.6 — Finale Verifikation

- [ ] Die drei mandatory Verify-Commands ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `task test:changed`: erwartet grün — Änderungen unter `tests/spec/` setzen
      RUN_SPEC (Taskfile-Bucket-Logik), `find-changed-tests.sh spec` selektiert den
      neuen Guard, und der Lauf enthält ihn.
- [ ] `task freshness:regenerate`: regeneriert alle generierten Artefakte inklusive
      `website/src/data/test-inventory.json`. D1: genau dieser Diff ist der EINZIGE
      erwartete — das Inventar bekommt einen Eintrag mit Fallback-ID
      `repo-structure/root-agent-md` (Pfad-abgeleitet, T002445) und wird in diesem
      Partial NICHT committet.
- [ ] `task freshness:check`: erwartet als einzigen Drift die Datei
      `website/src/data/test-inventory.json`. Tritt darüber hinaus Drift auf, ist das
      ein Befund: Ursache klären; legitime regenerierte Artefakte (routes, learning,
      quality index, agent-guide, openspec-status) dürfen committet werden — das
      Inventar nie.
- [ ] Abschluss: `git restore website/src/data/test-inventory.json` und
      `git status --short` — Arbeitsbaum sauber bis auf das wiederhergestellte
      Inventar. Die einmalige Regenerierung und der Commit von
      `website/src/data/test-inventory.json` erfolgen in p4-website für alle vier
      Guards (D1).
