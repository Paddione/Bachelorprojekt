# Proposal: agent-lock-scope-regelwerk

_Ticket: T003116 (Ursache) · T003102 · T003131 · T003132_

## Why

Vier Tickets aus demselben ticket-ops-Welle-1-Lauf am 2026-08-09 beschreiben eine einzige
gebrochene Annahme: **„eine Session = eine SID"** hält nicht, sobald MCP-Server, Subagenten und
CI-Workflows im selben Vorgang schreiben. In T003102 verhindert sie den **Abschluss**, in T003131
den **Schutz**.

### Symptom vs. Hypothese (Bug-Triage, T002448-M5)

Alle vier Ticketbeschreibungen mischen Beobachtung und Vermutung. Gegen den Quellcode geprüft:

| Aussage | Status | Beleg |
|---|---|---|
| ticket-ops Step 3.6 schreibt `claim ticket` vor | **Symptom, bestätigt** | `.claude/skills/references/ticket-ops-procedures.md:328` |
| dev-flow-plan fordert `ticket__<id>.json` fail-closed | **Symptom, bestätigt** | `.claude/skills/dev-flow-plan/SKILL.md:216-217` |
| worktree-write-guard Regel 2 blockt ohne eigenen Claim | **Symptom, bestätigt** | `scripts/hooks/worktree-write-guard.sh:147-165` |
| Regel 2 unterscheidet nebenläufige Subagenten nicht | **Symptom, bestätigt** | Ebd. — `MY_WTS` matcht auf `owner_sid`, alle Subagenten erben dieselbe Harness-SID |
| Worktrees erscheinen doppelt in der Meldung | **Symptom, bestätigt** | Ebd. Zeile 138: `MY_WTS+=("$wt")` ohne Existenzprüfung; im RED-Test reproduziert |
| Der Fehlertext nennt nur den Override, nicht `release` | **Symptom, bestätigt** | `scripts/vda/ticket/_ticket-core.sh:178` |
| Eine Vererbungskennung (Parent-SID) würde beide Fälle lösen | **Hypothese — widerlegt** | siehe Entwurfsentscheidung |

### Die Auflösung, die bisher nirgends steht

`bash scripts/agent-lock.sh claim branch <branch> --worktree <pfad> --branch <branch>` befriedigt
den Write-Guard, erfüllt den Kollisionsschutz und erzeugt die Abschluss-Blockade **nicht**. Sechs
Agenten mussten ihn in einem einzigen Lauf viermal unabhängig voneinander neu herleiten; zwei
griffen daneben.

## What

### Entwurfsentscheidung: die Vererbungskennung wird begründet verworfen

T003131 schlägt „Parent-SID plus Actor-Kennung" als gemeinsame Lösung vor. Diese Richtung wird
**nicht** eingeschlagen — drei am Code verifizierte Gründe:

1. **Für zwei der drei Akteure existiert keine Abstammung, die man vererben könnte.** `ticket-mcp`
   ist in `.mcp.json` als nacktes, langlebiges Kommando (`ticket-mcp-go`) ohne Env-Durchreichung
   registriert: es *überdauert* Sessions und bedient sie, statt von einer abzustammen.
   `post-merge.yml` läuft auf einem GitHub-Runner ganz ohne Session-Kennung. Eine Parent-SID lässt
   sich nur dort weiterreichen, wo ein Eltern-Kind-Spawn existiert — und genau dieser Fall
   (Bash-Subprozesse) ist in `_ticket_lock_guard` bereits gelöst, durch explizite
   Env-Durchreichung (T002422) und den SID-Gleichheits-Durchlass (T002498-M10).

2. **Die beiden Tickets ziehen das Identitätsmodell in entgegengesetzte Richtungen.** T003102
   braucht eine **gröbere** Halter-Identität (mehr Akteure sollen als derselbe Halter gelten, damit
   der Abschluss-Write durchgeht). T003131 braucht eine **feinere** (nebenläufige Subagenten sollen
   unterscheidbar werden, damit der Fremd-Write abgelehnt wird). Ein einzelner Bezeichner kann
   beides nicht leisten.

3. **Scope und Worktree sind der zweiteilige Schlüssel, der bereits existiert.** Der *Branch*-Scope
   benennt die Arbeitseinheit, das `worktree`-Feld den Arbeitsplatz des Akteurs. Beide stehen schon
   auf jedem Claim und sind für jeden Akteur einschließlich CI lesbar. Richtig verwendet lösen sie
   beide Symptome ohne neuen Identitätsmechanismus.

### Abgrenzung: Regel 2 wird NICHT verengt

Die naheliegende Verengung von Regel 2 („nur der eigene Worktree statt aller Worktrees meiner SID")
würde eine **bewusste frühere Entscheidung umkehren**: T002412 hat `MY_WT` genau deshalb zu
`MY_WTS` erweitert, weil eine Session legitim mehrere Worktrees hält, und die frühere Fassung sie
aus allen bis auf den zuerst gefundenen aussperrte — welcher das war, entschied die Glob-Reihenfolge.
Der Guard liest seine SID zudem aus der **Umgebung**, nicht aus der Hook-Nutzlast; ein belastbarer
Actor-Schlüssel ist damit derzeit gar nicht verfügbar.

Deshalb wird hier die **Zusicherung ehrlich gemacht** statt die Mechanik geraten: die Meldung
benennt die Herkunft des Besitzes, die Liste wird dedupliziert, und der SSOT-Spec schreibt die
Grenze der Zusicherung fest (schützt gegen fremde *Sessions*, nicht gegen nebenläufige Subagenten
*einer* Session). Die Verengung selbst gehört in ein eigenes Ticket, dem ein gemessener
Actor-Schlüssel vorausgeht.

### Drei Achsen der Änderung

| Achse | Ticket | Änderung |
|---|---|---|
| **Koordination** | T003116 #1, T003132 | ticket-ops Step 3.6 schreibt `claim branch` vor und nennt wörtlich den Prompt-Baustein für den Subagenten |
| **Koordination** | T003116 #2, #3 | dev-flow-plan Pre-Commit-Guard akzeptiert `branch__<slug>.json`; beide Stellen verweisen auf T003102 |
| **Schutz** | T003131 | `MY_WTS` dedupliziert; Meldezeile benennt die Herkunft des Besitzes |
| **Diagnose** | T003102 | Fehlertext nennt den regulären `release`-Pfad **vor** `TICKET_LOCK_OVERRIDE` |

### Prior Art, die diese Änderung berührt

- `openspec/specs/active-sessions-hub.md` → *Pre-Commit Guards in dev-flow-plan* fordert heute den
  Abgleich gegen den **ticket**-Claim → wird als `MODIFIED` erweitert, nicht danebengeschrieben.
- `openspec/specs/active-sessions-hub.md` → *Mandatory Worktree Scoping for File-Writing Tools* ist
  durchgängig in der Einzahl formuliert („the session holds a branch claim") → wird als `MODIFIED`
  um die Mehrfach-Claim-Realität und die Grenze der Zusicherung ergänzt.
