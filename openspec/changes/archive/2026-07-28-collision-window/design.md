---
ticket_id: T002444
plan_ref: openspec/changes/collision-window/tasks.md
status: active
date: 2026-07-28
---

# Design: agent-collision.sh — Sichtfenster reparieren

_Ticket: T002444 · Spec: `openspec/specs/software-factory.md` → Requirement „Agent-Kollisionserkennung bei parallelen Edits"_

## Problem

`scripts/agent-collision.sh` (T000882) läuft im `.githooks/pre-commit` und soll warnen, wenn eine
andere lebende Session dieselbe Datei in Arbeit hat. Er meldet praktisch nie etwas — nicht weil es
keine Kollisionen gibt, sondern weil zwei unabhängige Filter sich zu einer Trefferquote nahe null
multiplizieren.

Das blieb unbemerkt, weil ein stiller Detektor nicht von einem sauberen Repo zu unterscheiden ist.
Erst der belegte Vorfall vom 2026-07-28 — drei Worktrees gleichzeitig an `scripts/agent-lock.sh` —
machte sichtbar, dass die Warnung nie kam.

## Befunde

Alle vier Punkte sind gemessen, nicht abgeleitet. Messbasis: 23 aktive Worktrees, 11 Lock-Dateien
mit Worktree-Pfad, Stand 2026-07-28.

### D1 — Harness-SIDs gelten als tot

`scripts/agent-collision.sh:_sid_alive` ist eine Kopie von `scripts/agent-lock.sh:_sid_alive`, die
den Fix aus **T001268** nicht mitbekommen hat. Das Original behandelt nicht-numerische SIDs als
lebendig, weil `pgrep -s` nur POSIX-Session-IDs auflöst und Harness-SIDs (`CLAUDE_SESSION_ID`)
UUIDs sind:

```bash
# scripts/agent-lock.sh:64 — mit Fix
case "$1" in *[!0-9]*) return 0;; esac
pgrep -s "$1" >/dev/null 2>&1

# scripts/agent-collision.sh:26 — Kopie ohne Fix
pgrep -s "$1" >/dev/null 2>&1
```

Wirkung: **jeder** Claude-Code-Peer wird als tot klassifiziert und übersprungen. Gemessen meldet
`agent-collision.sh` null von elf Peers als lebendig, während `agent-lock.sh list` dieselben als
`live` führt.

Der Kopf von `agent-collision.sh` erklärt ausdrücklich, dieselben Overrides wie `agent-lock.sh` zu
ehren. Die Absicht war Spiegelung; T001268 patchte nur eine der beiden Kopien.

### D2 — Sichtfenster umfasst nur uncommitted Arbeit

Die Peer-Menge stammt aus `git -C "$wt" diff --name-only HEAD` plus `--cached`, also ausschließlich
dem Working Tree. Die `dev-flow-*`-Skills committen jedoch früh und mehrfach (Scaffold-Commit,
Plan-Stage-Commit, dann Implementierung). Wenige Minuten nach Arbeitsbeginn ist ein Peer wieder
unsichtbar.

| Messung über 23 Worktrees | Dateien |
|---|---|
| `main...HEAD` — tatsächliche in-flight Arbeit | 154 |
| `diff HEAD` + `--cached` — was der Detektor sieht | 3 |

Für den belegten Vorfall: die drei Kollidenten an `scripts/agent-lock.sh`
(`chore/fix-ticket-tracking-T002279`, `chore/mishap-T002341`, `chore/mishap-T002374`) haben
sämtlich **null** uncommitted Änderungen an der Datei. Sichtbar waren 0 von 3.

### D3 — Squash-gemergte Branches warnen weiter

Nach einem Squash-Merge sind die Branch-Commits keine Ancestors von `main`; `main...HEAD` listet die
Dateien unverändert weiter, obwohl die Arbeit längst in `main` steht. Gemessen sind **3 von 11**
Kandidaten-Paaren blob-identisch zu `main` — reine Fehlalarme, also genau die Sorte Rauschen, die
Warnungen unglaubwürdig macht.

### D4 — nur reaktiv

Der Detektor greift im pre-commit-Hook, also nachdem geschrieben wurde. Für die Frage „arbeitet
gerade jemand an dem, was ich anfassen will?" — der Zeitpunkt in `dev-flow-plan` Schritt −1 —
existiert kein Aufruf.

## Lösung

Alle Änderungen bleiben in `scripts/agent-collision.sh`. `scripts/agent-lock.sh` wird **nicht**
angefasst: dort arbeiten aktuell drei Worktrees, eine Extraktion in eine gemeinsame Bibliothek
würde einen Vier-Wege-Konflikt provozieren. Die Drift-Ursache wird stattdessen durch einen
Guard-Test adressiert.

### D1 — Nicht-numerisch-Zweig spiegeln

Die drei Zeilen aus `agent-lock.sh:64` werden übernommen, mit Verweis auf T001268 und auf den
Guard-Test. Der Zweig greift ausschließlich für nicht-numerische SIDs; numerische SIDs bleiben
`pgrep`-verifiziert, damit tote Sessions weiterhin tot sind.

### D2 — Peer-Menge erweitern

```
peer_files = union(
  git -C $wt diff --name-only $base...HEAD,   # committete Branch-Divergenz
  git -C $wt diff --name-only HEAD,           # unstaged
  git -C $wt diff --name-only --cached        # staged
)
```

**Drei-Punkt ist Pflicht.** Der naheliegende Zwei-Punkt-Diff (`git diff main HEAD`) wurde gemessen
und verworfen: er zieht alles mit, was `main` seit dem Fork dazubekommen hat, und liefert 52–386
Dateien pro Worktree statt 0–13.

`$base` wird als `main` aufgelöst. Schlägt das fehl (detached HEAD, fehlender Branch), entfällt nur
der committete Anteil; der Working-Tree-Anteil läuft weiter. Degradation statt Ausfall.

### D3 — Blob-Filter

Für jede Datei, die nach Schnittmengenbildung übrig ist, wird `HEAD:<datei>` im Peer-Worktree gegen
`main:<datei>` verglichen. Bei Gleichheit ist nichts offen, der Eintrag entfällt. Der Vergleich
läuft nur auf der kleinen Schnittmenge, nicht auf allen Peer-Dateien — die Kosten sind
vernachlässigbar.

### D4 — `--branch`-Modus

Ein weiterer Modus neben `--staged` und `--all`. Die eigene Dateimenge wird zu
`main...HEAD ∪ diff HEAD ∪ --cached`, die Peer-Seite bleibt identisch. Damit ist der Detektor vor
Arbeitsbeginn nutzbar, ohne ein zweites Skript.

### Unverändert

- **fail-open** bleibt das Grundprinzip: jeder Git-Aufruf, der fehlschlägt, gilt als „keine Daten"
  und blockt nie. `AGENT_COLLISION_STRICT=1` bleibt der einzige Weg zum harten Block.
- Der `linguist-generated`-Filter aus **T002375-p6** bleibt, Quelle bleibt `.gitattributes`.
- Keine Cluster- oder DB-Abhängigkeit; das Skript bleibt reines lokales Bash und damit CI-tauglich.
- `scripts/factory/conflict-check.sh` bleibt unberührt. Es beantwortet eine andere Frage
  (Factory-Dispatch-Gate über deklarierte `touched_files`) und wird hier nicht mitverändert.

## Restrauschen

Nach dem Fix und nach dem bestehenden Generated-Filter bleiben repo-weit **5 Dateien in 7 von 23
Worktrees** übrig:

| Datei | Worktrees |
|---|---|
| `scripts/agent-lock.sh` | 3 |
| `tests/spec/ci-cd.bats` | 2 |
| `scripts/vda/ticket/update-status.sh` | 2 |
| `.claude/skills/references/ticket-ops-procedures.md` | 2 |
| `.claude/skills/references/mcp-tool-guide.md` | 2 |

Das ist Signal, kein Rauschen. Eine zusätzliche Drossel ist nicht nötig.

## Test-Strategie

Zwei Eigenschaften dieses Bugs bestimmen den Testaufbau.

**Der bestehende Test umgeht die brechende Zeile.** `tests/unit/agent-collision.bats` setzt in jedem
Fall `AGENT_LOCK_FAKE_ALIVE`; dieser Override greift in `_sid_alive` vor dem `pgrep`-Pfad. Der
D1-Test muss ihn deshalb weglassen und mit einer echten UUID arbeiten — sonst prüft er erneut am
Defekt vorbei.

**Der Drift-Guard muss verhaltensbasiert sein.** Ein Grep auf `*[!0-9]*` bliebe grün, wenn jemand
die Bedingung umformuliert. Stattdessen bekommen beide Skripte dieselbe UUID-SID vorgelegt und
müssen dasselbe Urteil fällen: `agent-lock.sh list` meldet `live`, `agent-collision.sh` meldet die
Kollision. Bricht eine der Kopien, divergieren die Urteile.

Ergänzend gilt die Positiv-Anker-Pflicht aus **T002356-M1**: Der D3-Fall („identischer Blob warnt
nicht") wäre bei kaputtem Detektor trivial wahr. Der Anker — „divergenter Blob warnt sehr wohl" —
steht deshalb im selben Test und davor.

Neue Datei nach **T002416**: `tests/spec/software-factory/collision-window.bats`, ein Verzeichnis
pro SSOT-Spec, eine Datei pro Vorgang. Die Sammeldatei `tests/spec/software-factory.bats` wird nicht
erweitert.

## Abgrenzung

Nicht Teil dieses Changes:

- **Semantische Kollisionen** — zwei Worktrees, die in verschiedenen Dateien dasselbe oder
  Widersprüchliches tun. Seit T002416 („ein Verzeichnis pro Spec") mergen solche Fälle
  konfliktfrei und sind für jede pfadbasierte Erkennung unsichtbar. Eigenes Ticket, hängt
  sinnvollerweise an T002423.
- **Merge-Arbitrierung** — die kurative Auflösung bei ≥3 kollidierenden PRs ist T002423.
- **Dedup der Helferfunktionen** nach `scripts/lib/` — bewusst zurückgestellt wegen der drei
  offenen Worktrees an `agent-lock.sh`.
