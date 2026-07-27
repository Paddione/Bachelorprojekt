---
title: "p6 — Konventions- und Dokumentations-Drift schließen"
ticket_id: T002375
domains: [agent-config, devtooling, plan-authoring]
status: active
partial_id: p6
role: impl
target_files: ["CLAUDE.md", "scripts/batch-workflow-gen.sh", "scripts/brain-ingest.sh", "scripts/plan-lint.sh", ".githooks/pre-commit", ".claude/skills/references/ticket-ops-procedures.md"]
depends_on: []
---

# p6 — Konventions-Drift

_Ticket: T002375 · Partial p6 · Mishaps: T002342-M1/M2/M3, T002355-M1/M2, T002338-M1, T002341-M2_

## File Structure

| Datei | Änderung |
|---|---|
| `CLAUDE.md` | `plan-frontmatter-hook.sh` → `scripts/vda.sh frontmatter`; BATS-Konventionsblock um Positiv-Anker- und CRLF-Regel ergänzen |
| `scripts/batch-workflow-gen.sh` | `chore(batch)` → `chore(factory)` (Zeilen 93, 135) |
| `scripts/brain-ingest.sh` | `chore(ingest)` → `chore(agents)` (Zeilen 452, 470 und der PR-Titel) |
| `scripts/plan-lint.sh` | W3 erkennt `datei.sh:6-31`-Referenzen |
| `.githooks/pre-commit` | Branch-Naming-Meldung nennt die Großschreibung; Kollisionswarnung schließt nicht mehr von einer geteilten generierten Datei auf den ganzen Commit |
| `.claude/skills/references/ticket-ops-procedures.md` | `AND is_test_data = false`; Beschreibungen ungekürzt vor dem Dispatch |

## Kontext

Sieben Einzelbefunde, die kein gemeinsames Laufzeitverhalten teilen, aber dieselbe Wirkung haben:
sie trainieren Agenten darauf, Warnungen und Anweisungen zu ignorieren.

**T002342-M3 — nie registrierte Commit-Scopes.** `scripts/batch-workflow-gen.sh` (Zeilen 93, 135)
generiert Anweisungen für `git commit -m "chore(batch): …"`, `scripts/brain-ingest.sh` (Zeilen 452,
470) setzt `chore(ingest)` bzw. einen PR-Titel mit demselben Scope. **Weder `batch` noch `ingest`
stand jemals in der `namedScopes`-Allowlist** — auch nicht in der alten 95-Einträge-Fassung. Diese
Commits scheitern also am `commit-msg`-Hook bzw. am CI-Job, sobald sie in einem PR landen.

Verifiziert: die Allowlist führt `website, infra, db, security, ops, test, plans, factory, agents,
ci, scripts, docs, mcp, deps`. `factory` und `agents` sind vorhanden, `agents` trägt sogar den
Sub-Scope `knowledge-ingest`. **`commitlint.config.cjs` wird deshalb nicht angefasst** — der Fehler
liegt in den beiden Skripten, nicht in der Allowlist.

Wichtige Abgrenzung aus dem Ticket: `chore(brain)` in `scripts/brain-bootstrap.sh` ist **kein**
Defekt. Das Skript committet in ein frisch per `git init` erzeugtes Temp-Repo, das als
`Paddione/brain` gepusht wird; dort gilt unsere Allowlist nicht.

**T002342-M2 — CLAUDE.md verlangt ein deprecatetes Skript.** `CLAUDE.md:49` weist an,
`bash scripts/plan-frontmatter-hook.sh <plan-file>` zu laufen. Das Skript gibt aus:
`⚠ DEPRECATED: plan-frontmatter-hook.sh is deprecated. Use 'vda.sh frontmatter' instead.` Jeder
Planlauf erzeugt damit eine Deprecation-Warnung an genau der Stelle, an der die Projektanweisung
dieses Skript verlangt.

**T002342-M1 — `plan-lint` W3 falsch positiv.** W3 meldete
``W3: `scripts/register-scope.sh` is listed in File Structure but no task references it``, obwohl
Task 5 die Datei in seinem `**Files:**`-Block führt und in drei Steps nennt. Die Referenz stand als
`` - Modify: `scripts/register-scope.sh:6-31` ``. Ein Umschreiben auf `(Zeilen 6–31)` beseitigte
die Warnung **nicht** — die Ursache liegt also nicht allein am Zeilensuffix. Zum Vergleich: Task 4
referenziert `scripts/preflight-pr-scope.sh:6` im selben Stil und wird nicht bemängelt.

Die Auswirkung ist gering (Warnung, kein Hard-Fail) — und genau darin liegt der Schaden: sie
trainiert Plan-Autoren darauf, W-Meldungen generell zu ignorieren.

**T002355-M1 — Branch-Naming-Meldung nennt die Ursache nicht.** Der Guard in
`.githooks/pre-commit:113-146` prüft `[[ "$_bn" =~ T[0-9]{6,} ]]` — case-sensitiv, weil bash `=~`
ohne `nocasematch` läuft. Ein Branch `test-mishap-t002338` reißt beide Bedingungen (kein gültiges
Typ-Präfix, kleines `t`), die Meldung sagt aber nur "does not follow naming convention".

**T002341-M2 — Kollisionswarnung falsch positiv.** Der Guard meldete sechs COLLISION-Warnungen,
darunter Dateien, die die meldende Session Minuten zuvor selbst angelegt hatte. Die einzige echte
Überschneidung war `website/src/data/openspec-status.json` — ein generiertes Artefakt, das jeder
`propose`-Lauf anfasst. Der Detektor schließt von dieser einen gemeinsamen generierten Datei auf
**sämtliche** Dateien des Commits. Damit feuert die Warnung bei jedem parallelen Lauf, und echte
Kollisionen gehen darin unter.

**T002355-M2 — ticket-ops sieht E2E-Testdaten als offene Tickets.** T002348 tauchte im Triage auf
und kostete eine volle Untersuchungsschleife. Es war kein Fehler: Titel und Beschreibung stammen
wörtlich aus `tests/e2e/specs/fa-26-bug-report-form.spec.ts:45`, der Marker-Mechanismus aus T001453
hatte korrekt gegriffen (`is_test_data = true`). Die Phase-1-Query in `ticket-ops-procedures.md`
filtert `is_test_data` nicht, obwohl der Produktivcode das durchgängig tut — etwa
`website/src/pages/api/admin/cockpit/container-count.ts:16`.

**T002338-M1 — Triage liest gekürzt.** Die Beschreibungen wurden mit `left(description, 700)`
abgefragt. Bei T002308 stand der entscheidende Hinweis jenseits der 700 Zeichen: der Fix sei bei
einem anderen Ticket ohnehin mit abzuhandeln. Genau das trat ein — Kosten: ein Worktree, ein
Agent-Lauf, rund 134k Token. Die Lehre aus dem Ticket: Tickets tragen ihre wichtigsten
Einschränkungen typischerweise am **Ende** der Beschreibung.

## Schritte

- [ ] **RED zuerst.** Für die maschinell prüfbaren Punkte (Scopes, `CLAUDE.md`, W3) einen Test in
      der Datei anlegen, die dem jeweiligen Thema entspricht — `p6` besitzt keine eigene
      Spec-Datei, die Tests gehören zu `p7` und werden dort geschrieben. Hier gilt der RED-Nachweis
      über die direkte Prüfung:

```bash
grep -c 'plan-frontmatter-hook' CLAUDE.md
grep -c 'chore(batch)' scripts/batch-workflow-gen.sh
# expected: FAIL (rot — beide liefern einen Wert groesser 0)
```

- [ ] **Schritt 1 — Commit-Scopes korrigieren.** `chore(batch)` → `chore(factory)` in
      `batch-workflow-gen.sh` (Zeilen 93, 135). `chore(ingest)` → `chore(agents)` in
      `brain-ingest.sh` (Zeilen 452, 470 und der PR-Titel). `agents` trägt den Sub-Scope
      `knowledge-ingest`, was den Zweck präziser trifft als `docs`.

      **`scripts/brain-bootstrap.sh` bleibt unverändert** (Begründung oben).

- [ ] **Schritt 2 — CLAUDE.md Zeile 49.** `scripts/plan-frontmatter-hook.sh` durch
      `bash scripts/vda.sh frontmatter <plan-file>` ersetzen. Das deprecatete Skript selbst wird
      **nicht** gelöscht — es kann externe Aufrufer haben, und das Löschen wäre ein eigener
      Vorgang mit eigener Prüfung (vgl. die Warnung in T002269: vor dem Löschen prüfen, ob
      systemd-Units, Cron oder externe Aufrufer daran hängen).

- [ ] **Schritt 3 — CLAUDE.md BATS-Konvention erweitern.** Der Block enthält bereits die
      `$output`-Matching-Regel. Zwei Regeln kommen dazu:

      (a) **Positiv-Anker-Pflicht.** Jeder Negativtest ("X darf nicht vorkommen") braucht im
      selben Test einen Positiv-Anker, der bei fehlender Implementierung rot wird. Sonst besteht er
      vakuos — bei fehlender Funktion ist die Kandidatenliste leer, und "1 ist nicht in []" gilt
      trivial (T002356-M1).

      (b) **CRLF-tolerante Anker.** Guards auf `scripts/llm/*.ps1` müssen `[[:space:]]*$` statt
      eines bloßen `$` verwenden: die Dateien sind durchgehend CRLF, und `\r` gehört zur
      POSIX-Klasse `[[:space:]]`. Bemerkenswert und deshalb erwähnenswert: derselbe Ausdruck
      matchte in der interaktiven Shell, aber nicht unter BATS (T002338-M2).

      (c) **`bats --count` als Syntax-Check.** `bash -n` ist auf `.bats`-Dateien nutzlos
      (`@test "name" { … }` ist keine gültige Bash-Syntax) und meldet einen irreführenden Fehler.
      Brauchbar ist `tests/unit/lib/bats-core/bin/bats --count <datei>` (T002351-M2).

      (d) **Append-Konflikte sind normal.** Die Konvention "eine `.bats`-Datei pro SSOT-Spec"
      führt dazu, dass Parallelarbeit an derselben Spec am Dateiende kollidiert. Die Auflösung ist
      nicht "eine Seite wählen", sondern beide Blöcke behalten und die geteilte schließende
      Klammer duplizieren (T002351-M2).

- [ ] **Schritt 4 — `plan-lint` W3.** Die Ursache zuerst **reproduzieren**: einen Fixture-Plan mit
      `` `datei.sh:6-31` `` im `**Files:**`-Block bauen und W3 auslösen. Erst dann die
      Token-Extraktion in `plan-lint.sh:335-348` anpassen. Der Vergleich mit Task 4
      (`scripts/preflight-pr-scope.sh:6` wird **nicht** bemängelt) legt nahe, dass nicht das
      Zeilensuffix an sich das Problem ist, sondern der Bereich mit Bindestrich — das ist die
      erste zu prüfende Hypothese, nicht die feststehende Ursache.

- [ ] **Schritt 5 — Branch-Naming-Meldung.** In `.githooks/pre-commit` die Fehlermeldung des
      Guards um den expliziten Hinweis ergänzen, dass die Ticket-ID **groß** geschrieben sein muss
      (`T002338`, nicht `t002338`), und die gültigen Typ-Präfixe nennen. Der Guard selbst bleibt
      case-sensitiv — das ist gewollt, nur die Meldung erklärt es bisher nicht.

- [ ] **Schritt 6 — Kollisionsdetektor.** Die Warnung so einschränken, dass eine Überschneidung
      **je Datei** gemeldet wird statt für den ganzen Commit. Generierte Artefakte, die praktisch
      jeder Lauf anfasst — allen voran `website/src/data/openspec-status.json` — werden von der
      Kollisionsprüfung ausgenommen; die Liste in `.gitattributes` (`merge=ours
      linguist-generated=true`) ist die passende Quelle dafür und muss nicht dupliziert werden.

- [ ] **Schritt 7 — ticket-ops-Query.** `AND is_test_data = false` in die Phase-1-Query aufnehmen,
      analog zu `container-count.ts:16`. Zusätzlich die Regel notieren: die Übersichtstabelle darf
      gekürzte Beschreibungen zeigen, **vor jedem Dispatch** wird die Beschreibung aber
      vollständig gelesen — die wichtigsten Einschränkungen stehen am Ende.

## Verifikation

```bash
grep -c 'plan-frontmatter-hook' CLAUDE.md                  # 0
grep -c 'chore(batch)' scripts/batch-workflow-gen.sh       # 0
grep -c 'chore(ingest)' scripts/brain-ingest.sh            # 0
grep -c 'is_test_data' .claude/skills/references/ticket-ops-procedures.md   # > 0
bash -n scripts/batch-workflow-gen.sh scripts/brain-ingest.sh scripts/plan-lint.sh .githooks/pre-commit
bash scripts/plan-lint.sh openspec/changes/mishap-consolidation-T002375/tasks.md
```

Gegenbeweis für Schritt 1: die generierten Commit-Nachrichten gegen den Hook prüfen —
`echo 'chore(factory): probe' | bash scripts/validate-commit-msg.sh /dev/stdin` muss durchlaufen.

## Abgrenzung

- **`commitlint.config.cjs` wird nicht angefasst.** `factory`, `agents` und `docs` sind bereits
  registriert; der Defekt liegt in den zwei Skripten.
- **`scripts/plan-frontmatter-hook.sh` wird nicht gelöscht** (Schritt 2).
- `scripts/agent-lock.sh` gehört `p1`; die Guard-Aufrufe in `.githooks/pre-commit` bleiben
  unverändert, damit `p1` und `p6` sich nicht überschneiden.
