# Proposal: fix-devflow-ciwatch-ticket-path

## Why

### Beobachtetes Symptom (Fakt, reproduziert)

Beim CI-Watch für Archiv-PR #4533 brach `scripts/devflow-ci-watch.sh` mit **Exit 6** ab,
nachdem der Ticket-Worktree entfernt war. Der Watch-Teil selbst (gh-Aufrufe) funktionierte;
die Phase-Chain war bereits in einem früheren Lauf bestätigt.

Reproducer (Rot-Beweis, 2026-08-15, T006370):

```bash
# cwd ohne scripts/ — dieselbe Situation wie nach Worktree-Remove
cd /tmp/t006370-repro && PATH="/tmp/t006370-repro/fakebin:$PATH" \
  bash /home/patrick/Bachelorprojekt/scripts/devflow-ci-watch.sh \
    T006370 "https://github.com/Paddione/Bachelorprojekt/pull/4533"
```

Ausgabe (Fake-gh liefert `state=MERGED`, sofortiger MERGED-Preflight):

```
✅ PR bereits gemergt (state=MERGED) — Checks waren per Branch-Protection bereits grün. Überspringe Poll-Loop.
/home/patrick/Bachelorprojekt/scripts/devflow-ci-watch.sh: line 60: ./scripts/ticket.sh: No such file or directory
❌ Phase-Chain nicht vollständig — siehe Meldungen oben.
```

Exit-Code: **6**.

### Hypothese über die Ursache (aus dem Ticket)

Der Phase-Chain-Check ruft `./scripts/ticket.sh` **relativ** auf und scheitert nach
Worktree-Remove (cwd-Abhängigkeit).

### Verifikation der Hypothese (T002448-M5)

Die Hypothese ist durch den Reproducer belegt: Das Skript enthält vier Aufrufe mit dem
relativen Pfad `./scripts/ticket.sh` (einmal `phase … deploy entered` vor den Preflights,
einmal im MERGED-Preflight, einmal im grünen Pfad, einmal `phase … deploy entered` im
Poll-Loop). Der relative Pfad löst sich gegen das **cwd des Prozesses** auf, nicht gegen den
Skript-Speicherort. Existiert `./scripts/` im cwd nicht (Worktree entfernt — das cwd zeigt
ins Nichts oder auf ein Verzeichnis ohne scripts/), schlägt der Aufruf mit
`No such file or directory` fehl. Der `if !`-Guard um `assert-phase-chain` übersetzt genau
diesen Umgebungsfehler in **Exit 6 mit der irreführenden Meldung „Phase-Chain nicht
vollständig"** — obwohl die Chain nie geprüft wurde.

Der beobachtete Exit 6 sagt also **nichts** über die Phase-Chain aus; er ist ein
Umgebungsfehler, der als Gate-Verletzung getarnt wird. Aufrufer (dev-flow-execute,
Archiv-Flow) behandeln Exit 6 als hartes Chain-Gate (Spec M1, mishap-t002242) — der
fehlgeschlagene Archiv-Vorgang ist die Folge dieser Verwechslung.

## What

### Fix-Entscheidung

1. **cwd-unabhängige Auflösung von ticket.sh** — `SCRIPT_DIR` am Skriptanfang aus
   `BASH_SOURCE[0]` bestimmen (dasselbe Muster, das `scripts/ticket.sh` Zeile 361 und
   `scripts/vda/ticket/assert-phase-chain.sh` bereits nutzen) und `TICKET_SH` als
   `"${TICKET_SH:-$SCRIPT_DIR/ticket.sh}"` einführen. Alle vier `./scripts/ticket.sh`-
   Aufrufe werden auf `"$TICKET_SH"` umgestellt. Der `TICKET_SH`-Env-Override folgt dem
   bestehenden Muster des Skripts (`MAX_CI_ATTEMPTS`) und ist die Testbarkeits-Schnittstelle
   für BATS (echtes ticket.sh braucht die DB via kubectl).
2. **Guard statt falscher Gate-Behauptung** — vor `assert-phase-chain` (beide Stellen:
   MERGED-Preflight und grüner Pfad) prüft das Skript, ob `"$TICKET_SH"` existiert und
   ausführbar ist. Ist das Tool nicht erreichbar (genau der Worktree-Remove-Fall), meldet
   das Skript klar „ticket.sh nicht erreichbar — Phase-Chain kann nicht verifiziert werden"
   und endet mit **Exit 7**. Exit 6 bleibt exklusiv für eine **nachgewiesene**
   Chain-Verletzung (Spec M1 unverändert).
3. **Bestehende Tests auf den Override umstellen** — `tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats`
   schmuggelt sein Fake-ticket.sh als `$WORK/scripts/ticket.sh` ins cwd; nach der
   Pfadumstellung trifft es das echte ticket.sh (DB). Die Tests setzen künftig
   `TICKET_SH="$WORK/scripts/ticket.sh"` explizit — Verhalten bleibt identisch.

### Verworfen

- **`cd` in ein stabiles Verzeichnis als Ersatz** — löst den Fall „cwd zeigt ins Nichts"
  nicht, weil das Skript im Worktree liegt und git-Operationen (Rebase) das Repo brauchen;
  die Pfadauflösung ist der präzisere Eingriff.
- **Fail-open (grün melden, wenn ticket.sh fehlt)** — bricht das fail-closed-Gate
  (T002242-M1) auf; der Guard mit Exit 7 erhält die Fail-closed-Semantik und trennt nur
  die Fehlerklassen.

### Edge-Cases

- Worktree wird **während** des Laufs entfernt (der beobachtete Fall): `SCRIPT_DIR` zeigt
  auf einen nicht mehr existierenden Pfad → Guard greift → Exit 7 mit klarer Meldung.
- Skript aus beliebigem cwd gestartet (auch aus dem Haupt-Checkout oder einem fremden
  Verzeichnis): ticket.sh wird relativ zum Skript gefunden → Check läuft.
- `TICKET_SH` gesetzt, aber nicht ausführbar: Guard greift ebenfalls (Exit 7) — der
  Operator sieht die Ursache statt einer Gate-Behauptung.

_Ticket: T006370_
