# Fortsetzungs-Kontrakt für angefangene Tickets [T002327]

Referenz zu `dev-flow-execute`. Sie steht hier und nicht im Skill-Body, weil
`.claude/skills/dev-flow-execute/SKILL.md` exakt auf der 250-Zeilen-Grenze des
fail-closed Gates **G-AGENTIC09** liegt und keine einzige Zeile Spielraum hat.

Der Kontrakt gilt für **Mensch und Factory gleichermaßen**. Es gibt bewusst keinen
zweiten Ausführungs-Skill (Design-Entscheidung E1): zwei Pfade für dieselbe Aufgabe
laufen auseinander, und dann ist unklar, welcher gilt.

## Fortsetzung statt Neubeginn

Liegt auf dem Branch bereits Arbeit, wird sie **fortgesetzt**, nicht wiederholt.

- **Erledigte Partials erkennt allein die `partial-done`-Phase-Event-Auswertung**
  (`tickets.factory_phase_events`, ausgewertet in `read-partials`). Es gibt **keine
  zweite Fortschrittsquelle**: wer zusätzlich Commit-Betreffs oder Plan-Checkboxen
  auswertet, baut Drift ein — zwei Quellen, die irgendwann widersprechen, ohne Regel,
  welche gewinnt.
- **Der Worktree entsteht, bevor das Partial-Manifest gelesen wird.** Ohne diese
  Reihenfolge liegt `openspec/changes/<slug>/tasks.d/` zum Lesezeitpunkt noch nicht auf
  der Platte, `readPartials` liefert nichts, und der Lauf fällt auf den LLM-Decompose
  zurück. Der kennt keine erledigten Partials und erzeugt die volle Taskliste — die
  Implementierungsschleife wiederholt dann bereits geleistete Arbeit.
- **Der Fehler war nicht einmal stabil.** Blieb `.worktrees/<slug>` von einem früheren
  Tick liegen, griff der Partial-Pfad plötzlich doch. Wiederaufnahme wirkte dadurch wie
  Zufall statt wie eine Zusage — der Grund, warum der Reihenfolgefehler so lange
  unentdeckt blieb.
- **Ein Rückfall auf den LLM-Decompose wird protokolliert**, ebenso ein Fehlschlag der
  Phase-Event-Abfrage und die Liste der übersprungenen Partials. Ein stiller Fallback
  sieht aus wie der Normalfall; genau das ist die Fehlersituation, die dieser Kontrakt
  beseitigt, und sie darf nicht in anderer Form zurückkehren.

## Der Branch ist anderswo ausgecheckt

Hält ein anderer Worktree den Branch, **stellt die Factory zurück**: sie gibt ihren Slot
frei, schreibt ein `deferred`-Phase-Event und lässt den Ticket-Status unangetastet.
Kein `blocked`, keine PushNotification — der nächste Tick greift das Ticket regulär
wieder auf.

Die Slot-Freigabe ist der kritische Teil: bleibt der Slot belegt, verhungert die Queue —
das wäre schlimmer als das `blocked`, das hier ersetzt wird.

Erkannt wird der Fall an der Markerzeile `branch in use` und **Exit-Code 3** aus
`scripts/worktree-create.sh`. Die Erkennung sitzt bewusst im Skript und nicht als Regex
auf der Fehlermeldung von `git worktree add`: deren Wortlaut wechselt zwischen
git-Versionen (`is already checked out at …` / `already used by worktree at …`), und ein
Regex darauf würde bei geändertem Wortlaut still in den generischen Fehlerpfad
zurückfallen — also wieder `blocked` setzen.

Für den menschlichen Ausführer heißt das: **ein Ticket, das kurz nicht anläuft, ist kein
Defekt, sondern eine belegte Ressource.**

## Das Hold-Gate bleibt unverändert

`readiness.execution_released=false` bleibt der **Default** (T002272). Fortsetzungs-
fähigkeit ersetzt die Freigabe **nicht** — sie macht sie nur folgenlos für bereits
geleistete Arbeit. Ob ein gestagtes Ticket laufen darf, bleibt eine menschliche
Entscheidung; neu ist allein, dass eine spätere Freigabe nicht mehr bedeutet, dass die
Factory von vorne anfängt. `scripts/factory/queue.sh` wird dafür nicht angefasst.

## `reclaim` ist der Notausstieg, nicht der Regelweg

`bash scripts/ticket.sh reclaim` ist für **entgleiste** Ausführungen gedacht. Keine
Automatik löst ihn aus. Dass er zeitweise zum Normalfall wurde, war ein Symptom der
fehlenden Fortsetzungsfähigkeit — mit dieser ist er wieder das, was er sein sollte.

## Was davon testbar ist

`tickets.factory_phase_events` ist in CI nicht erreichbar. Die Absicherung in
`tests/spec/software-factory/` prüft deshalb **Struktur und Verzweigung** im
Quelltext — Aufrufreihenfolge, Markerzeile, Exit-Code, Abwesenheit des `blocked`-Pfads
im Fremdbesitz-Zweig, Unverändertheit von `queue.sh` — nicht den Datenbank-Roundtrip.
Wer dort einen DB-Test sucht: es gibt keinen, und das ist Absicht.
