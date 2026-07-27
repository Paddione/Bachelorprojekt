# Proposal: auto-chore-plan-script

## Why

Der Ticket-Durchsatz hat drei Stufen. Zwei davon sind automatisiert, eine nicht:

```
triage  ──???──▶  plan_staged  ──queue.sh──▶  in_progress  ──pipeline──▶  merged
        ^^^^^^
        keine Automatik
```

`triage → plan_staged` hat keinen automatischen Ausgang. Jedes Ticket braucht einen Menschen
oder Orchestrator, der `dev-flow-plan` fährt. Das ist der verbliebene Engpass, nachdem T002333
den Dispatcher-Typfilter und T002386 die Pod-Auswahl behoben haben.

**Für eine Ticketklasse ist die Automatik längst vollständig spezifiziert.**
`.claude/skills/mishap-tracker/SKILL.md` Schritt 3.5 („Non-critical bundle → auto-chore-plan")
beschreibt den ganzen Weg: Gate auf `has_critical`, Slug und Branch bilden,
`openspec.sh propose`, Plan-Authoring delegieren, `plan-lint` als Hard Gate, `stage-plan`,
Commit und Push.

Nur ist das **Prosa in einer SKILL.md, kein ausführbarer Code**.
`scripts/hooks/mishap-tracker.sh` ist mit 46 Zeilen ein reiner Friction-Recorder
(`--friction` / `--ticket`); `grep -rln "auto-chore-plan" scripts/` liefert nichts.

Der Schritt läuft also nur, wenn ein Agent `mishap-tracker` ausführt **und** an 3.5 denkt.
In der Praxis passiert das nicht. Belegt an der eigenen Session vom 2026-07-28: T002381 und
T002382 entstanden per `report_mishap`/`flush_mishap_buffer` (Schritte 1–3), Schritt 3.5 wurde
übersprungen, beide blieben in `triage` liegen.

**Messung des Triage-Stapels am 2026-07-28** (31 Tickets):

| Klasse | Anzahl | braucht menschliches Urteil |
|---|---|---|
| Mishap-Bundles `severity=minor` | **8** | **nein** — Schritt 3.5 deckt sie ab |
| Mishap-Bundles `severity=major` | 10 | ja — enthalten `broken`/`security`, Gate hält sie bewusst zurück |
| echte Tickets | 13 | ja |

Acht Tickets sind reine Automatisierungsschuld: T002273, T002341, T002351, T002352, T002356,
T002373, T002374, T002382.

## What

Schritt 3.5 wird ein ausführbares Skript (`scripts/factory/auto-chore-plan.sh`), das ein
Bundle-Ticket entgegennimmt und den dokumentierten Ablauf fährt. Die SKILL.md beschreibt
weiterhin das Warum, verweist für das Wie aber auf das Skript, statt den Ablauf zu duplizieren —
sonst driften Prosa und Code auseinander, und genau diese Drift ist die Ursache dieses Tickets.

Der Aufruf wird im Factory-Tick verankert (`wakeup.sh`, analog zu `auto-enqueue` und
`auto-triage`), damit er nicht wieder überspringbar ist.

Zwei Fallen aus Schritt 3.5 werden mit übernommen, weil beide live gestolpert wurden:

- **Slug lowercase, Branch mit unveränderter Ticket-ID.** `.githooks/pre-commit` erzwingt
  `T[0-9]{6,}` case-sensitive. Ein aus dem lowercase-Slug abgeleiteter Branch
  (`chore/mishap-t002382`) matcht nicht, der Commit wird abgelehnt, und der Schritt kann nie
  durchlaufen (T002240).
- **`git commit && git push` verkettet.** Ein abgelehnter Commit verhindert einen Push auf
  eigener Zeile nicht — der Branch wäre dann ohne Plan gepusht.

Das `has_critical`-Gate bleibt: `severity` in (`major`, `critical`) heißt keine Auto-Planung.
Diese Bundles enthalten `broken`- oder `security`-Einträge und gehören vor menschliche Augen.

## Abgrenzung

Nicht Teil dieses Changes: die 10 `major`-Bundles (bewusst manuell), die Emissionsrate selbst
(T002383) und die 13 echten Triage-Tickets (brauchen echte Planung, keine Schablone).

_Ticket: T002390_
