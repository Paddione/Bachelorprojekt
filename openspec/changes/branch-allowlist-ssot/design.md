---
ticket_id: T002817
plan_ref: openspec/changes/branch-allowlist-ssot/tasks.md
status: active
date: 2026-08-09
---

# Design: SSOT für ticketlose Branches

## Purpose

Die Regel „welche Branches sind von der Ticket-ID-Pflicht befreit" ist heute an drei Stellen
unabhängig kodiert. Sie ist auseinandergelaufen, und das Auseinanderlaufen hat die gesamte
Mishap-Auswertung stillgelegt. Dieser Change zieht die Regel in eine einzige Quelle, die alle
drei Guards lesen.

## Symptom und Ursache

Die beiden werden hier getrennt gehalten, weil die Ticket-Beschreibung sie in einem Satz führt.

**Symptom** (beobachtet, reproduzierbar): `BRAND=mentolder bash scripts/factory/mishap-rollup.sh`
erzeugt den Plan, lintet ihn erfolgreich und bricht dann am Commit ab:

```
mishap-rollup: plan-lint OK
mishap-rollup: commit + push ...
✗  pre-commit: branch 'chore/mishap-incident-rollup' does not follow naming convention.
   ✗ keine Ticket-ID gefunden. Sie muss GROSS geschrieben sein: T002338, nicht t002338.
```

**Ursache** (durch Lesen der Guards belegt, nicht vermutet):

| Guard | Stelle | Kennt den Branch? | Wirkung |
|---|---|---|---|
| `scripts/worktree-create.sh` | Zeile 49, `_unattended_allowlist` | ja, explizit | Worktree entsteht |
| `.githooks/pre-commit` | Zeile 130, `case`-Exemptions | nein | **blockiert** — Exit 1 |
| `.githooks/pre-push` | Zeile 144, `case`-Exemptions | nein | warnt irreführend, `exit 0` |

Der Branch ist per Konstruktion ticketlos und persistent — `.claude/skills/mishap-tracker/SKILL.md`
schreibt fest, dass er nie gelöscht wird und das Container-Ticket dauerhaft offen bleibt. Er *kann*
die geforderte Ticket-ID nicht tragen. Der Guard verlangt also etwas strukturell Unmögliches.

Belegt wurde die Ursache zusätzlich durch den Zustand des Worktrees: `.worktrees/mishap-incident-rollup`
führte vor dem aktuellen Lauf bereits `proposal.md` und `tasks.md` im Status `A ` — **staged**, nie
committet. Das Fossil eines früheren Laufs, der an derselben Stelle scheiterte. Die Blockade ist
nicht neu.

## Abgrenzung

Nicht dasselbe wie T002783 (Container-Auflösung via `ticket.sh` und `--unattended`-Worktree-Modus,
PR #3911 gemergt). Das war der vorige Blocker derselben Kette; dieser hier ist der nächste.

## Lösung

### Eine Quelle

Neue Datei `scripts/lib/branch-allowlist.sh`: eine Variable `TICKETLESS_BRANCHES` mit exakten
Branch-Namen und eine Funktion `branch_is_ticketless()`, die exakt vergleicht.

**Exakter Vergleich statt Glob-Muster.** Ein Glob wie `chore/mishap-*` würde bei einem Tippfehler
eine ganze Präfix-Klasse von der Ticket-Pflicht befreien, ohne dass es auffällt. Die Liste ist
kurz und ändert sich selten; exakte Namen kosten hier nichts und können nicht überschießen.

### Drei Konsumenten

`.githooks/pre-commit`, `.githooks/pre-push` und `scripts/worktree-create.sh` sourcen die Datei
und fragen `branch_is_ticketless` ab, statt eigene Listen zu führen. Beide Hooks sind bereits
`bash` und definieren bereits `repo_root` — das Sourcen ist je eine Zeile.

`worktree-create.sh` behält seine `--unattended`-Semantik unverändert; nur die Herkunft der
Allowlist wechselt.

### Verhalten bei fehlender Quelldatei

Das Sourcen ist bedingt (`[ -f … ] && . …`). Fehlt die Datei — etwa in einem alten Worktree oder
auf einem Branch von vor diesem Change — bleibt die Allowlist leer und beide Hooks verhalten sich
exakt wie heute.

Diese Richtung ist bewusst gewählt: ein fehlendes SSOT kann dann höchstens einen erlaubten Branch
blockieren, aber nie einen unerlaubten durchlassen. Ein `set -u`-Fehler oder ein harter Abbruch
beim fehlenden File hätte dagegen jeden Commit auf jedem alten Branch lahmgelegt.

### Treiber scheitert laut

`scripts/factory/mishap-rollup.sh` prüft die Exit-Codes von `git commit` und `git push` und bricht
mit sprechender Meldung und Exit ≠ 0 ab. Ohne das bleibt die nächste Blockade derselben Kette
wieder still — und genau so entstand das Fossil: ein `git add` ohne folgenden `commit` sieht im
Index aus wie fertige Arbeit, ist aber nirgends dauerhaft.

## Testansatz

Rot-Grün ist im Fix-Pfad Pflicht. Der Test ruft die Guards **auf** und prüft deren Ergebnis
(Output-Verifikation nach T002448-M4) — kein `grep` auf die Guard-Quelltexte, denn ein Treffer im
Quelltext belegt nur, dass Text existiert, nicht dass der Commit durchgeht.

Jeder Negativ-Aussage steht ein Positiv-Anker gegenüber (T002356-M1):

1. **Positiv-Anker zuerst:** ein ticketloser Branch, der *nicht* in der Liste steht, wird weiterhin
   blockiert. Ohne diesen Anker bestünde der Test auch dann, wenn der Guard komplett ausgehängt wäre.
2. **Dann die Aussage:** `chore/mishap-incident-rollup` darf committen.

Ablage nach der Verzeichniskonvention T002416: `tests/spec/ci-cd/branch-allowlist-ssot.bats` —
eigene Datei, kein Anhängen an die Sammeldatei `tests/spec/ci-cd.bats`.

## Nicht in diesem Change

- Ein CI-seitiger Branch-Namen-Guard. Es gibt heute keinen (`.github/workflows/` enthält keine
  Branch-Namens-Prüfung); einen einzuführen ist ein eigener Vorgang mit eigener Abwägung.
- Weitere Einträge in `TICKETLESS_BRANCHES`. Die Liste startet mit genau dem einen Branch, der
  sie braucht.
