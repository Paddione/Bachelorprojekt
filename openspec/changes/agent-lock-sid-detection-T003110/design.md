---
ticket_id: T003110
plan_ref: openspec/changes/agent-lock-sid-detection-T003110/tasks.md
status: active
date: 2026-08-10
---

# Design: agent-lock Ownership, Persistenz und Sichtbarkeit

_Tickets: T003110 (führend), T002826, T003098_

## Symptom vs. Hypothese (Bug-Triage, T002448-M5)

Alle drei Tickets enthalten Symptom **und** vermutete Ursache in einem Satz. Diese Sektion
trennt beides und belegt die Ursache mit einem Reproducer, bevor die Lösung entworfen wird.

| # | Beobachtetes Symptom (Fakt) | Vermutung im Ticket | Befund |
|---|---|---|---|
| 1 | `check ticket <id>` meldet aus einem Worktree „held", `update-status` bricht mit Exit 7 ab, `TICKET_LOCK_OVERRIDE=1` hilft (T003110) | `_my_sid()` löse in Worktrees anders auf, weil `.git` dort eine Datei ist | **widerlegt** — `_my_sid` ist korrekt |
| 2 | `claim ticket` liefert Exit 0, `check` sagt danach „free" (T002826) | verwandt mit 1 | **bestätigt als eigener Defekt**, andere Ursache |
| 3 | `list` zeigt nur die Kopfzeile, obwohl fremde Sessions arbeiten (T003098) | Claim entsteht erst im pre-commit-Hook | **bestätigt**, Ursache korrekt benannt |

### Befund 1 — die Ursache liegt nicht in `_my_sid`

Gemessen im Worktree `.worktrees/agent-lock-sid-detection-T003110`:

```
$ bash scripts/agent-lock.sh mine
d082485d-6fcb-47d1-bc6e-c716d7c685f3      # korrekt, keine Drift
$ bash scripts/agent-lock.sh claim ticket TTEST001 --worktree . ; echo $?
0
$ bash scripts/agent-lock.sh check ticket TTEST001 ; echo $?
mine … 0                                   # aus der Worktree-WURZEL: korrekt
```

Die Hypothese des Tickets ist damit widerlegt: `git rev-parse --show-toplevel` und
`--git-common-dir` lösen im Worktree korrekt auf, `_lock_dir()` trifft dasselbe Registry.

Die tatsächliche Ursache ist das **Ownership-Prädikat in `cmd_check`**. Es entscheidet in
zwei Stufen: SID-Gleichheit, und danach — als Auffangnetz gegen SID-Drift (T002392-M1) —
**exakte String-Gleichheit von `$PWD` mit dem Feld `worktree`**. Diese zweite Stufe ist an
das *aktuelle Arbeitsverzeichnis* gebunden, nicht an den Arbeitsbaum:

```
# identischer Lock, identische Session, nur ein anderes cwd:
$ (cd $WT       && AGENT_LOCK_SID=session-B agent-lock.sh check ticket TTEST001) ; echo $?   # 0  (mine)
$ (cd $WT/scripts && AGENT_LOCK_SID=session-B agent-lock.sh check ticket TTEST001) ; echo $? # 3  (held)
```

Damit ist auch die im Ticket richtig beobachtete Asymmetrie erklärt: **`check-and-claim`
funktioniert, weil es dieses Prädikat gar nicht benutzt** — es delegiert an `cmd_claim`, und
das entscheidet ausschließlich über die SID und ist idempotent. Es gibt schlicht zwei
verschiedene Antworten auf dieselbe Frage „gehört dieser Lock mir?".

Der vollständige gemeldete Fehlerfall ist damit wortgetreu reproduzierbar:

```
$ cd <worktree>/scripts && _ticket_lock_guard TTEST001
ERROR: Ticket TTEST001 ist gesperrt (agent-lock) — Status-Schreibvorgang verweigert.
       Eigene SID: <nicht gesetzt> (Shell-PID 3726084)
       Falls der Halter diese Session ist, gezielt durchlassen: TICKET_LOCK_OVERRIDE=1
rc=7
```

Die Zeile `Eigene SID: <nicht gesetzt>` hat eine **zweite, eigenständige** Ursache: die
Rettungsklausel in `_ticket_lock_guard` (T002498-M10) baut die SID-Auflösung nach und liest
dabei nur `CLAUDE_CODE_SESSION_ID` und `CLAUDE_SESSION_ID`. `openspec/specs/active-sessions-hub.md`
(„Harness-Stable Session Identity for agent-lock") schreibt aber die Reihenfolge
`AGENT_LOCK_SID` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID` → `OPENCODE_SESSION_ID` →
Unix-SID vor. Gemessen:

```
$ OPENCODE_SESSION_ID=oc-123 bash scripts/agent-lock.sh mine   → oc-123
$ OPENCODE_SESSION_ID=oc-123 <guard-Ausdruck>                  → (leer)
```

Unter opencode kann die Rettungsklausel deshalb nie greifen, und die Diagnosezeile behauptet
„keine Session", während das Werkzeug daneben die Session kennt. Genau diese Zeile hat die
Untersuchung im Ticket in die falsche Richtung (`_my_sid`) geschickt.

### Befund 2 — `claim` meldet Erfolg, ohne ihn zu prüfen

`cmd_claim` endet auf `CREATED="$(_now)"; _write_lock "$f"; return 0`. Das `return 0` ist
unbedingt; der Rückgabewert von `_write_lock` wird nie ausgewertet. Zwei voneinander
unabhängige Wege zum gemeldeten Symptom, beide reproduziert:

```
# (a) Lock-Dir nicht beschreibbar
$ AGENT_LOCK_DIR=<unwritable> agent-lock.sh claim ticket TTEST002 ; echo $?   → 0
$ AGENT_LOCK_DIR=<unwritable> agent-lock.sh check ticket TTEST002            → free

# (b) stiller Registry-Wechsel: _lock_dir fällt ohne Hinweis auf /tmp/agent-locks
$ (cd <non-git-dir> && agent-lock.sh claim ticket TTEST003) ; echo $?         → 0
$ (cd <repo>        && agent-lock.sh check ticket TTEST003)                   → free
```

Beide liefern exakt die Ticketbeschreibung: Exit 0, kein Hinweis auf stdout, `check` „free".
Weg (b) erklärt zusätzlich, warum der Befund im Worktree-Betrieb auffiel: dort wechseln
Arbeitsverzeichnisse häufiger, und ein Aufruf aus einem gelöschten oder noch nicht
initialisierten Verzeichnis schlägt still in ein anderes Registry um.

### Gemeinsame Ursache?

**Nein — zwei getrennte Code-Defekte, aber ein gemeinsames Muster.** T003110 und T002826
teilen keine einzelne Zeile. Sie teilen die Bauform: *jede* Frage nach Ownership und *jede*
Bestätigung eines Schreibvorgangs wird an ihrer Aufrufstelle neu beantwortet, statt einmal.
`cmd_check`, `cmd_claim`, `cmd_release`, `cmd_refresh`, `cmd_check_and_claim` und
`_ticket_lock_guard` beantworten „ist das mein Lock?" auf vier verschiedene Arten — und
`claim` bestätigt einen Erfolg, den niemand nachgesehen hat. Der Fix behebt beide Defekte
und zieht die Antwort auf **ein** Prädikat zusammen, damit die Klasse nicht wiederkehrt.
Das ist zugleich die Linie, die der Kommentar zu T002424 in `_ticket-core.sh` bereits zieht:
„Wer die Pfadkonvention nachbaut, erbt sie nicht — er dupliziert sie und läuft auseinander."

## Entscheidungen

### E1 — `cmd_claim` verifiziert die Persistenz und scheitert laut (Exit 4)

Nach `_write_lock` wird gelesen, was geschrieben wurde: existiert die Datei, und nennt sie
uns als Halter? Wenn nein: Meldung auf stderr und **Exit 4** (neuer, freier Code; 1 bleibt
„von anderer Session gehalten", 2 „Argumentfehler", 3 „held" bei `check`). Ein eigener Code
statt 1, weil beide Fälle gegensätzliche Reaktionen verlangen: bei 1 koordiniert man, bei 4
ist die Umgebung kaputt. Alle bestehenden Aufrufer prüfen `|| { … }` auf „nicht 0" und
verhalten sich damit unverändert korrekt.

Zusätzlich wird der `/tmp/agent-locks`-Fallback in `_lock_dir()` **sichtbar**: er bleibt
erlaubt (die Spec lässt ihn bei echtem `git rev-parse`-Fehler zu), meldet sich aber auf
stderr. Ein stiller Registry-Wechsel ist der Unterschied zwischen „Lock gehalten" und „Lock
nirgends" — das darf nicht ohne Spur passieren.

### E2 — Ein Ownership-Prädikat, cwd-unabhängig

`_lock_is_mine()` wird die einzige Antwort auf „gehört dieser Lock mir?" und von `cmd_check`,
`cmd_release`, `cmd_refresh` und `cmd_check_and_claim` benutzt. Die Regel:

1. `owner_sid` == `_my_sid` → eigener Lock. (unverändert)
2. sonst: der aufrufende Arbeitsbaum ist der im Lock genannte — geprüft über den
   **Git-Toplevel des cwd** und über Pfad-Containment (`$PWD` liegt unterhalb von
   `worktree`), nicht über String-Gleichheit mit `$PWD`.

Punkt 2 ist eine echte **Lockerung** gegenüber heute und damit rechtfertigungspflichtig: sie
macht aus manchen „held" ein „mine". Sie ist auf denselben Arbeitsbaum begrenzt, den das
Lock selbst nennt — wer dort arbeitet, ist per Konstruktion die Session, für die der Lock
angelegt wurde. Der Test `check still reports a foreign worktree's lock as held` sichert die
Grenze ab: ein Lock, der einen *anderen* Baum nennt, bleibt fremd. Nicht geändert wird
`cmd_release`s Sonderregel (fremder toter Owner darf freigegeben werden) und nicht die
Reap-Logik — `_reapable` bleibt unangetastet.

### E3 — `_ticket_lock_guard` fragt statt nachzubauen

Die Rettungsklausel ermittelt die eigene SID über `bash "$lock_sh" mine` statt über eine
private Zwei-Namen-Liste. Damit gilt automatisch die in `active-sessions-hub.md` festgelegte
Reihenfolge inklusive `AGENT_LOCK_SID` und `OPENCODE_SESSION_ID`, und die Diagnosezeile nennt
eine Session, wenn es eine gibt. Das ist keine Umkehr einer früheren Entscheidung, sondern
deren Fortführung: T002424 hat bereits festgehalten, dass die Entscheidung bei `agent-lock.sh`
bleibt und hier nicht nachgebaut wird — die SID-Auflösung ist die letzte Stelle, an der der
Nachbau noch stand.

### E4 — T003098: Claim NICHT vorziehen, Evidenzquelle ergänzen

Zwei Wege standen offen. Der Claim wird **nicht** auf den Session-Start vorgezogen:

- `openspec/specs/software-factory.md` („main-checkout lock is self-claimed on every commit")
  legt den Zeitpunkt ausdrücklich fest. Ihn zu verschieben, wäre eine Umkehr dieser
  Entscheidung mit `MODIFIED`-Delta — und sie hätte gute Gründe.
- Die Reaper-Semantik spricht dagegen: ein `main-checkout`-Lock trägt eine nicht-numerische
  Harness-SID, gilt damit laut `_sid_alive` **immer** als lebendig und wird erst nach
  `AGENT_LOCK_TTL` (30 min) geerntet. Ein Claim beim Session-Start überlebt also jede
  gestartete und wieder verworfene Sitzung um eine halbe Stunde — und `guard-precommit`
  blockiert in dieser Zeit fremde Commits im Haupt-Checkout (`software-factory.md`). Man
  tauschte ein Falsch-Negativ („niemand arbeitet hier") gegen ein Falsch-Positiv, das aktiv
  blockiert. Das ist der schlechtere Tausch.

Stattdessen bekommt das Werkzeug die Evidenzquelle, die im gemeldeten Fall tatsächlich
verlässlich war: `agent-lock.sh activity` listet die Claims **und** laufende Prozesse, deren
`cwd` im Haupt-Checkout oder einem verknüpften Worktree liegt (ohne den eigenen Prozess).
Damit beantwortet das Werkzeug die Frage, die der Vorab-Check wirklich stellt. `list` bleibt
unverändert — sein Ausgabeformat wird von anderen Stellen gelesen, und ein zweiter Befehl ist
billiger als ein geändertes Format. Ergänzend wird die Lücke dort dokumentiert, wo sie
zuschlägt (`dev-flow-chore` Schritt 1, `session-coordination.md`): eine leere Claim-Liste
beweist nicht, dass niemand arbeitet.

## Offene Punkte für den Operator

- **E2** lockert das Ownership-Prädikat bewusst. Wer das enger haben will, müsste stattdessen
  die SID-Drift an der Wurzel beseitigen und die Worktree-Heuristik ganz entfernen — das
  wäre ein größerer Eingriff mit Regressionsrisiko für alle Nicht-Harness-Aufrufer.
- **E4** liefert bewusst keinen Schutz, nur Sichtbarkeit. Ein Guard, der auf Prozess-Evidenz
  hin blockiert, wäre ein eigener Vorgang mit eigener Abwägung.
