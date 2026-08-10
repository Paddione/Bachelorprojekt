# Proposal: agent-lock-sid-detection-T003110

## Why

Drei gemeldete Befunde an `scripts/agent-lock.sh` haben eine gemeinsame Wirkung: das Werkzeug,
mit dem Sessions ihre Arbeit gegeneinander abgrenzen, gibt Auskünfte, die nicht stimmen —
und zwar in beide Richtungen. Es meldet einen eigenen Lock als fremd (T003110), es bestätigt
einen Claim, den es nicht geschrieben hat (T002826), und es meldet „niemand arbeitet hier",
während zwei Sessions im Haupt-Checkout schreiben (T003098). Jeder dieser Fälle führt zu
einer eingeübten Umgehung: `TICKET_LOCK_OVERRIDE=1` bei jedem Status-Write, `--force` beim
Aufräumen, Arbeit inline im Haupt-Checkout. Umgehungen, die zur Gewohnheit werden, sind
teurer als der Defekt — `--force` ist das Werkzeug, mit dem man *fremde lebende* Locks
abräumt.

Die Ursachen wurden am Code gemessen, nicht übernommen; die Hypothese aus T003110
(`_my_sid()` löse in Worktrees anders auf) ist **widerlegt**. Belege, Reproducer und die
Trennung von Symptom und Vermutung stehen in `design.md`.

Belegt für diesen Lauf: `agent-lock.sh list` gab zu Beginn nur die Kopfzeile aus, während
zwei fremde Sessions (PID 1222889, PID 21146) seit Stunden im Haupt-Checkout arbeiteten.

## What

- **`claim` verifiziert seinen eigenen Schreibvorgang** und scheitert mit Exit 4, wenn der
  Lock nicht persistiert wurde. Der `/tmp/agent-locks`-Fallback von `_lock_dir()` meldet sich
  auf stderr, statt das Registry lautlos zu wechseln. (T002826)
- **Ein Ownership-Prädikat** `_lock_is_mine()` für `check`, `release`, `refresh` und
  `check-and-claim`, das den Arbeitsbaum statt der exakten Zeichenkette `$PWD` prüft. Damit
  liefert `check` aus jedem Unterverzeichnis dasselbe Urteil wie aus der Worktree-Wurzel, und
  die Asymmetrie zu `check-and-claim` verschwindet. (T003110)
- **`_ticket_lock_guard` fragt `agent-lock.sh mine`** statt die SID-Auflösung mit einer
  unvollständigen Namensliste nachzubauen; damit gilt die in `active-sessions-hub.md`
  festgelegte Reihenfolge inklusive `AGENT_LOCK_SID` und `OPENCODE_SESSION_ID`. (T003110)
- **`agent-lock.sh activity`** als neuer Lesebefehl: Claims plus laufende Prozesse, deren
  `cwd` im Repo liegt. Der `main-checkout`-Claim wird bewusst **nicht** auf den Session-Start
  vorgezogen (Begründung: `design.md` E4). `list` bleibt unverändert. (T003098)
- Die Sichtbarkeitslücke wird dort dokumentiert, wo der Vorab-Check stattfindet
  (`dev-flow-chore` Schritt 1, `session-coordination.md`).

Nicht Teil dieses Vorgangs: `_reapable()` und die Reap-Semantik bleiben unverändert; das
Ausgabeformat von `list` bleibt unverändert; es entsteht kein Guard, der auf Prozess-Evidenz
hin blockiert.

_Tickets: T003110 (führend), T002826, T003098_
