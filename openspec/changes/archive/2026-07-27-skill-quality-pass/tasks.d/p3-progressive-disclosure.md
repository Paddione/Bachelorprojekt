# p3 — Progressive Disclosure für die sechs übergroßen Skills

**Rolle:** impl · **depends_on:** —

**target_files:** `.claude/skills/dev-flow-execute/SKILL.md`, `.claude/skills/infra-ops/SKILL.md`,
`.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/ticket-ops/SKILL.md`,
`.claude/skills/openspec-explore/SKILL.md`, `.claude/skills/git-workflow/SKILL.md`,
`.claude/skills/references/dev-flow-execute-phases.md`,
`.claude/skills/references/dev-flow-plan-phases.md`,
`.claude/skills/references/infra-ops-runbooks.md`,
`.claude/skills/references/ticket-ops-procedures.md`,
`.claude/skills/references/git-workflow-procedures.md`,
`.claude/skills/references/openspec-explore-procedures.md`

Jede der sechs Dateien geht auf höchstens 250 Zeilen. Zusätzlich wird hier ihr Frontmatter
mitbehandelt — sie liegen nicht in `p2`, weil keine Datei in zwei Partials liegen darf.

## Verbindliche Auslagerungsregel

Es wird **verschoben, nicht gestrichen**. Kein Schritt, kein Guard und keine Sonderfall-Warnung
darf beim Kürzen verschwinden; wer eine Prozedur ändern will, braucht ein eigenes Ticket.

Im Body bleibt:

- Wann der Skill greift und wann nicht
- Die Abfolge der Schritte als Übersicht, mit ihren Entscheidungspunkten
- Jeder Guard, jede Abbruchbedingung, jede Warnung vor einem Fehlgriff
- Die Framework-Mapping-Tabelle

In die Referenzdatei wandert:

- Ausformulierte Befehlsfolgen und ihre Ausgabeinterpretation
- Nachschlagetabellen und Formatvorgaben
- Sonderfall-Behandlungen, die im Normalablauf nicht auftreten

Jeder Verweis nennt, **was** in der Zieldatei steht, damit die Entscheidung „lesen oder nicht"
ohne Öffnen möglich ist. `Siehe references/foo.md` allein genügt nicht.

## Task 3.1 — `infra-ops`: 476 Zeilen, sieben Sektions-Runbooks auslagern

Die Datei ist ein explicit-invoke-only Runbook aus sieben `§`-Sektionen. Sie hat den größten
Hebel: die Sektionen ab `## §1 — Cluster Deployment` (Zeile 24) bis zum Ende der
`§`-Nummerierung sind Prozedur, das `## Schnell-Routing` (Zeile 12) ist die Entscheidungsebene.

Nach `.claude/skills/references/infra-ops-runbooks.md` wandern die ausformulierten Phasen aus
allen sieben Sektionen. Im Body bleiben das Schnell-Routing sowie pro Sektion ein kurzer Block
mit: wofür sie zuständig ist, welche Reihenfolge zwingend ist (die
`⚠️ Mandatory Ordering for Fresh Clusters` bleibt im Body — sie ist ein Guard, keine Prozedur)
und der Verweis auf den Abschnitt in der Referenzdatei.

**Akzeptanz:** `wc -l .claude/skills/infra-ops/SKILL.md` liefert höchstens 250, und jede der
sieben Sektionen ist aus dem Body heraus auffindbar.

## Task 3.2 — `dev-flow-execute`: 486 Zeilen, mechanische Schritte auslagern

Die Datei mischt Ablaufsteuerung mit langen Befehlsfolgen. Nach
`.claude/skills/references/dev-flow-execute-phases.md` wandern die mechanischen Blöcke:
Pre-Flight-Ticket-Lock, Worktree-Konsistenzprüfung, Sync und Rebase, Laden des Plan-Pfads aus der
Datenbank, das Warten auf Partial-Vollständigkeit im Pipeline-Modus, Ticket-Abschluss,
Plan- und OpenSpec-Archivierung, Worktree-Cleanup und Post-Merge-Deploy.

Im Body bleiben die Entscheidungspunkte und Gates: die Erkennung des Pipeline-Modus (nicht das
Warten darauf), die Delegation an den Implementer-Subagenten, das Admin-Menu-Placement-Gate, das
Code-Review-Gate, die CI-Fix-Schleife als Ablauf und die Auto-Merge-Bedingung.

**Akzeptanz:** `wc -l .claude/skills/dev-flow-execute/SKILL.md` liefert höchstens 250; alle
Gates aus dem Ausgangsstand sind im Body noch benannt.

## Task 3.3 — `dev-flow-plan`: 460 Zeilen, Phasen-Prozeduren auslagern

Nach `.claude/skills/references/dev-flow-plan-phases.md` wandern die ausformulierten Phasen A, B
und C des Feature-Pfads sowie die Schrittfolge des Fix-Pfads.

Im Body bleiben: wann der Skill greift, die Position im Git-Kreislauf, die Pfad-Wahl zwischen
Feature, Fix und Chore samt Artefakt-Ebene, der Pipeline-Fluss als Prinzip, der
Race-Condition-Schutz, die Pre-Commit-Guards aus Schritt 5 und die Übergabe an
`dev-flow-execute`.

Die Guards sind hier besonders zu schützen: das Verbot, auf `main` zu committen, der Zwang zu
sauberem Arbeitsverzeichnis und der Abgleich zwischen Branch und `agent-lock`-Claim bleiben im
Body — sie sind der Grund, warum der Schritt existiert.

**Akzeptanz:** `wc -l .claude/skills/dev-flow-plan/SKILL.md` liefert höchstens 250; die drei
Pre-Commit-Guards stehen unverändert im Body.

## Task 3.4 — `ticket-ops`: 334 Zeilen, Triage-Prozeduren auslagern

Nach `.claude/skills/references/ticket-ops-procedures.md` wandern: das Abrufen offener Tickets,
die Berechnung der `missing[]`-Liste, das Laden des OpenSpec-Status und Rendern der
Triage-Tabelle, die Klassifikation, der Subagent-Dispatch zur Validierung, die Herleitung der
Rückfragen und das Zurückschreiben der Antworten sowie der Aufbau des Abhängigkeitsgraphen mit
der topologischen Sortierung in Wellen.

Im Body bleiben: wofür der Skill zuständig ist, die Auswahl der Eskalationsmenge samt Kappung,
das Routing zwischen Plan und Execute, die Vorlage des Masterplans und die Freigabe durch den
Menschen vor dem Dispatch von Welle 1.

**Abgrenzung übernehmen:** Die `description` wird nach dem in `p2` eingefrorenen Kontrakt
geschrieben — `ticket-ops` ist für Ticket-Inhalte zuständig und gibt „stale branches",
„merge PRs" und „repository hygiene" an `repo-hygiene` ab.

**Akzeptanz:** `wc -l .claude/skills/ticket-ops/SKILL.md` liefert höchstens 250; die
`description` nennt kein Branch-, Worktree- oder PR-Housekeeping mehr.

## Task 3.5 — `openspec-explore`: 298 Zeilen, Einstiegspunkt-Katalog auslagern

Der Abschnitt `## Handling Different Entry Points` ist mit gut hundert Zeilen der längste Block
und ein Katalog von Sonderfällen — genau das Material, das in eine Referenzdatei gehört. Er
wandert nach `.claude/skills/references/openspec-explore-procedures.md`.

Im Body bleiben: die Haltung des Modus, was er tun kann, die OpenSpec-Kontextprüfung, was er
**nicht** tun muss, das Beenden der Discovery und die Guardrails.

Zusätzlich die Fork-Deklaration wie in `p2` Task 2.3 für die anderen drei openspec-Skills:
`license`, `metadata.author: openspec`, `metadata.version` und `generatedBy` weichen einer
Angabe, die die Upstream-Quelle als Fork-Ursprung nennt.

**Akzeptanz:** `wc -l .claude/skills/openspec-explore/SKILL.md` liefert höchstens 250, und die
Datei enthält weder `generatedBy` noch `author: openspec`.

## Task 3.6 — `git-workflow`: 283 Zeilen, Nachschlagewerk auslagern

Nur 33 Zeilen über dem Budget, aber zwei Blöcke sind reines Nachschlagewerk und deshalb die
richtigen Kandidaten: das Pflichtformat für Conventional Commits sowie die `## Quick-Reference`
zusammen mit `## Häufige Fehler`. Beide wandern nach
`.claude/skills/references/git-workflow-procedures.md`.

Im Body bleiben die Schritte 0 bis 7 als Ablauf mit ihren Guards — insbesondere der
Freshness-Guard vor dem Commit, der Scope-Preflight vor `gh pr create` und die
Auto-Merge-Bedingung.

Falls der CI-Fix-Loop-Block bereits auf `.claude/skills/references/ci-fix-loop.md` verweist,
wird er nicht dupliziert, sondern der bestehende Verweis behalten.

**Akzeptanz:** `wc -l .claude/skills/git-workflow/SKILL.md` liefert höchstens 250.

## Task 3.7 — Script-Pfade nach der Auslagerung prüfen

`G-AGENTIC08` grept mit `--include=SKILL.md` und sieht ausgelagerte Referenzdateien deshalb
nicht. Ein `scripts/…`-Pfad, der aus einem Body in eine Referenzdatei wandert, verlässt damit
den Prüfbereich des Gates. `p4` erweitert das Gate entsprechend; unabhängig davon wird hier
manuell nachgewiesen, dass kein verschobener Pfad ins Leere zeigt:

```bash
for p in $(grep -rhoP '(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)' \
           .claude/skills/references --include='*.md' | sort -u); do
  [ -f "$p" ] || echo "TOTER PFAD: $p"
done
```

**Akzeptanz:** Der Befehl gibt nichts aus.

## Task 3.8 — Zeilenbudget aller sechs Dateien nachweisen

```bash
for s in dev-flow-execute infra-ops dev-flow-plan ticket-ops openspec-explore git-workflow; do
  printf "%5d  %s\n" "$(wc -l < ".claude/skills/$s/SKILL.md")" "$s"
done
```

**Akzeptanz:** Jede der sechs Zahlen ist höchstens 250.
