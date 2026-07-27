---
title: "p5 — OpenSpec-Lifecycle: Resume-Pfad, Delta-Disziplin, Statusübergang"
ticket_id: T002375
domains: [plan-authoring, devtooling]
status: active
partial_id: p5
role: impl
target_files: ["scripts/openspec.sh", "scripts/factory/reconcile-ticket-status.sh", ".claude/skills/references/plan-archive-steps.md", "tests/spec/openspec-workflow.bats"]
depends_on: []
---

# p5 — OpenSpec-Lifecycle

_Ticket: T002375 · Partial p5 · Mishaps: T002356-M3, T002354-M1, T002356-M2_

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/openspec.sh` | `propose --resume`; der Abbruch ohne `--resume` meldet je Datei "Skelett" gegen "befüllt" |
| `scripts/factory/reconcile-ticket-status.sh` | `plan_ref` allein hebt ein Ticket nicht mehr auf `in_progress` |
| `.claude/skills/references/plan-archive-steps.md` | Delta-Disziplin: die SSOT wird im Change nicht direkt editiert |
| `tests/spec/openspec-workflow.bats` | Resume-Pfad und Statusübergangs-Bedingung |

## Kontext

**T002356-M3 — kein Resume-Pfad.** `scripts/openspec.sh:47` bricht ab, sobald ein Change-Ordner
existiert:

```
[[ -e "$dir" ]] && die "change '$slug' already exists at $dir"
```

Unabhängig davon, ob dieser echten Inhalt oder ein Platzhalter-Skelett enthält. Im Ursprungsfall
lag ein gemischter Zustand vor: `design.md` war mit Root-Cause und Live-Messung gefüllt (8390
Bytes), `proposal.md` hatte leere Why/What-Abschnitte, `tasks.md` war das reine Skelett mit
`<author fills this in>`.

Das ist heikel, weil ein blindes Überschreiben genau die Arbeit vernichtet, die eine vorherige
Session bereits geleistet hat — und weil der Abbruch keinerlei Hinweis darauf gibt, welche Dateien
Substanz haben. Die Platzhalter-Marker (`<author fills this in>`, die vorgeseedete
`expected: FAIL`-Zeile, `### Requirement: TODO`) sind maschinell erkennbar.

**T002354-M1 — Delta plus SSOT-Direktedit.** Beim Post-Merge-Archivieren von T002328 schlug
`openspec.sh archive` zweimal fehl, beide Male aus derselben Wurzel: der Plan ließ die SSOT
`openspec/specs/ci-cd.md` **direkt** bearbeiten UND schrieb dieselben Requirements zusätzlich als
Delta.

```
ERROR: ci-cd.md: ADDED target '…' already exists in ci-cd.md — use MODIFIED or rename
ERROR: ci-cd.md: REMOVED target '… — Scenario "…"' not found
```

Zwei Lehren, beide gehören in die Referenz: (1) Ein Change editiert die SSOT **nicht** direkt,
sondern pflegt nur das Delta — das Mergen ist Aufgabe des `archive`-Schritts. Wird beides gemacht,
ist der Delta-Marker zwangsläufig falsch und fällt erst beim Archivieren auf, also **nach** dem
Merge. (2) Unter `## REMOVED Requirements` gehören ganze Requirement-Namen, niemals einzelne
Szenarien.

**T002356-M2 — Status springt auf `in_progress`.** Nach dem `stage-plan` für T002350 stand das
Ticket auf `in_progress` statt `plan_staged`, obwohl keinerlei Implementierung stattgefunden hatte:
die Zieldatei war unverändert, 10 von 11 Tests waren rot. Der Ausstiegszustand von `dev-flow-plan`
ist laut Skill-Kontrakt `plan_staged`; `in_progress` signalisiert der Factory und jedem Beobachter
fälschlich, dass die Umsetzung läuft.

Das Ticket markiert den Verursacher ausdrücklich als **[UNVERIFIED]** — belegt ist nur der falsche
Endzustand, `scripts/factory/reconcile-ticket-status.sh` ist der Verdächtige, nicht der
Überführte. Schritt 3 unten beginnt deshalb mit einer Prüfung, nicht mit einer Änderung.

## Schritte

- [ ] **RED zuerst.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
# expected: FAIL (rot — propose kennt --resume nicht und meldet beim Abbruch keinen Datei-Zustand)
```

- [ ] **Schritt 1 — Zustandsbericht beim Abbruch.** Bevor `propose` ohne `--resume` mit `die`
      abbricht, gibt es je Datei im Ordner aus, ob sie Skelett oder befüllt ist. Erkennung über
      die Platzhalter-Marker, die `propose` selbst seedet — die Liste gehört als Konstante an eine
      Stelle, damit sie mit dem Seed-Code nicht auseinanderläuft.

      Dieser Schritt allein löst schon den teuersten Teil des Mishaps: man muss nicht mehr jede
      Datei von Hand inspizieren, um zu entscheiden, was übernommen werden darf.

- [ ] **Schritt 2 — `--resume`.** Mit `--resume` seedet `propose` nur Dateien, die fehlen oder
      ausschließlich Platzhalter enthalten. Bestehender Inhalt bleibt **unangetastet**. Der Lauf
      meldet je Datei, was er getan hat (`seeded` / `kept`).

      Ohne `--resume` bleibt das Verhalten wie bisher (Abbruch), nur um den Bericht aus Schritt 1
      reicher. Kein `--force`: Überschreiben bleibt eine bewusste manuelle Handlung.

- [ ] **Schritt 3 — Statusübergang prüfen, dann ändern.** Zuerst **belegen**, ob
      `reconcile-ticket-status.sh` ein Ticket mit gesetztem `plan_ref` und existierendem Branch
      auf `in_progress` hebt, ohne zu unterscheiden, ob auf dem Branch Production-Code liegt oder
      nur Plan- und RED-Test-Artefakte.

      Trifft das zu: die Bedingung so verschärfen, dass ein Branch, dessen Diff gegen `main`
      ausschließlich `openspec/changes/**` und `tests/**` berührt, das Ticket auf `plan_staged`
      belässt. Genau das ist der Ausstiegszustand von `dev-flow-plan`.

      Trifft es **nicht** zu, wird nichts geändert: der Befund wird im Partial dokumentiert und
      das Mishap als "Ursache nicht in diesem Skript" geschlossen. Eine Änderung an einem Skript,
      das den Fehler nicht verursacht, macht die Sache schlimmer, nicht besser.

- [ ] **Schritt 4 — `plan-archive-steps.md`.** Zwei Regeln aufnehmen:
      (a) Ein Change editiert `openspec/specs/**` nicht direkt; Änderungen an der SSOT gehören
      ausschließlich ins Delta unter `openspec/changes/<slug>/specs/`. Wird beides gepflegt, ist
      der Delta-Marker zwangsläufig falsch und der Fehler fällt erst nach dem Merge auf.
      (b) `## REMOVED Requirements` listet **ganze Requirement-Namen**. Ein einzelnes Szenario wird
      dort nicht entfernt, sondern als Prosa-Hinweis im zugehörigen `MODIFIED`-Requirement geführt.

- [ ] **Schritt 5 — Tests.** Fixture-Ordner in `$BATS_TEST_TMPDIR` mit gemischtem Zustand
      (eine befüllte Datei, eine reine Skelettdatei). Geprüft wird: `--resume` lässt die befüllte
      unangetastet und seedet die fehlende; ohne `--resume` bricht der Lauf ab **und** nennt je
      Datei den Zustand.

      Positiv-Anker nicht vergessen: erst prüfen, dass der befüllte Inhalt nach dem Lauf noch da
      ist, dann die Negativ-Aussage. Sonst besteht der Test auch dann, wenn `--resume` gar nichts
      tut.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
bash -n scripts/openspec.sh scripts/factory/reconcile-ticket-status.sh
bash scripts/openspec.sh validate
```

## Abgrenzung

- **`tickets.retry_count` gehört T002361** (Factory-Livelock). Dieses Partial fasst ausschließlich
  die Statusübergangs-Bedingung an, nicht den Retry-Zähler. Sollte T002361 vor diesem Change
  mergen, rebased `p5` darauf.
- `scripts/openspec.sh archive` und die fehlende Freshness-Regeneration darin (T002282-M2) gehören
  zu PR #3400.
- Der Substring-Test über die SSOT (T002352-M2) gehört `p7`.
