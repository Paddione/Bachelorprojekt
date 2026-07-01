---
ticket_id: T001393
plan_ref: openspec/changes/t001393-lavish-reload/tasks.md
status: draft
---

# T001393 — Lavish-Reload-Protokoll kann In-Flight-Formulareingaben verwerfen

## Problem / Root Cause

Beim iterativen Fixen von Layout-Warnings (overflow / overlapping text) auf einem
Lavish-Board wird das Muster "HTML-Datei editieren → `npx -y lavish-axi <html-file>`
erneut ausführen, um die gefixte Ansicht im Browser zu prüfen" wiederholt angewendet.
`npx -y lavish-axi <html-file>` navigiert den bestehenden Browser-Tab neu (Reload),
um die editierte Datei frisch zu laden.

Das Lavish-`input`-Playbook rendert Formulare (z. B. Radio-Auswahl + "Antwort
senden"-Button) rein clientseitig im DOM. Eine Radio-Auswahl, die der User trifft,
aber noch nicht per Submit bestätigt hat, existiert ausschließlich im DOM des
Browser-Tabs — sie wird erst beim Klick auf den Submit-Button an den Lavish-Server
übermittelt und taucht danach im nächsten `poll`-Ergebnis auf.

Ein Reload während dieses Zeitfensters (Auswahl getroffen, noch nicht submitted)
navigiert die Seite neu, das DOM wird frisch aufgebaut, und die ungespeicherte
Auswahl geht verloren — ohne dass Poll oder Server das bemerken, weil die Auswahl
nie serverseitig ankam.

**Beobachtetes Symptom (T001373 M3):** User meldet "ich habe geantwortet"
(er hat eine Option angeklickt), aber der nächste `poll` liefert weiterhin
`prompts: []`, weil das iterative Layout-Fixing zwischen Auswahl und Submit-Klick
einen Reload ausgelöst hat, der die Auswahl gelöscht hat, bevor der User den
Submit-Button erreichen konnte.

Der Bug ist ein **Protokoll-/Prozessfehler auf Agent-Seite**, kein Bug in der
`lavish-axi`-CLI selbst (die ist ein externes npm-Paket, nicht Teil dieses Repos).
Der Fix muss daher auf Ebene des Agenten-Workflows ansetzen: der
`.claude/skills/lavish/SKILL.md`-Datei, die das Verhalten aller Agenten steuert,
die Lavish-Boards mit `input`-Playbooks (Formularen) verwenden — insbesondere im
`dev-flow-plan`/`dev-flow-execute`-Kreislauf, wo Lavish für Brainstorming- und
Grilling-Boards PFLICHT ist.

## Fix-Ansatz

Von den drei im Ticket vorgeschlagenen Optionen (Warnung vor laufendem Poll /
Formular-State persistieren / Poll-Status vor Reload prüfen) wird die dritte
gewählt, ergänzt um eine explizite Sequenz-Regel:

**Poll-Status vor Reload prüfen + Reload-Sequenzierung dokumentieren.**

Begründung: Formular-State persistieren würde eine Änderung an der externen
`lavish-axi`-CLI erfordern (außerhalb unseres Repo-Scopes). Eine reine "Warnung"
ohne Sequenzregel wäre zu vage, um deterministisch getestet zu werden. Eine klare
Sequenzregel ist selbst-dokumentierend, grep-testbar (analog zum M1-Testmuster in
`tests/spec/dev-flow-plan-ticket-sh-mishaps.bats`) und verlangt kein Vertrauen in
Agenten-"Vorsicht" ohne konkrete Handlungsanweisung.

Neue Regel für `.claude/skills/lavish/SKILL.md` (Workflow-Abschnitt, Schritt 4/"Commands & rules"):

1. Enthält das Board ein `input`-Playbook-Formular, MUSS der Agent vor jedem
   erneuten `npx -y lavish-axi <html-file>`-Aufruf (der einen Reload auslöst)
   zuerst das Ergebnis des zuletzt laufenden `poll` abwarten bzw. konsumieren.
2. Der Agent darf NIEMALS einen Reload auslösen, während ein `poll`-Aufruf noch
   aussteht (kein "reload-über-laufenden-poll-hinweg").
3. Zeigt das letzte Poll-Ergebnis, dass Prompts weiterhin offen sind
   (`prompts` nicht leer) UND der User zuletzt signalisiert hat, geantwortet zu
   haben (z. B. Chat-Nachricht "ich habe geantwortet"), MUSS der Agent den User
   explizit warnen, dass ein bevorstehender Reload (Layout-Fix) eine
   möglicherweise nicht abgeschickte Auswahl verwerfen könnte, und um
   Bestätigung/Re-Submit bitten, BEVOR er den nächsten `lavish-axi`-Reload
   auslöst.
4. Layout-Fixes (overflow/overlapping text) sollen nach Möglichkeit zunächst nur
   als Datei-Edit vorgenommen werden; der nächste Reload wird mit dem nächsten
   ohnehin fälligen Poll-Zyklus zusammengelegt, statt zusätzliche
   Ad-hoc-Reloads während eines offenen Formulars zu erzwingen.

## Betroffene Subsysteme

- `.claude/skills/lavish/SKILL.md` (Quelle der Wahrheit für alle Agenten, die
  Lavish-Boards öffnen — dev-flow-plan, dev-flow-execute, grilling, etc.)
- `.claude/skills/references/dev-flow-gotchas.md` (Querverweis-Eintrag, damit die
  Regel auch bei Gotchas-Suche auffindbar ist)
- Test: neue Spec-Datei `tests/spec/lavish.bats` (grep-basiert, analog zum
  M1-Testmuster in `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats`)

## Edge Cases

- Board ohne `input`-Playbook (reine Anzeige-Boards wie plan/diagram/table):
  Regel greift nicht — Reload jederzeit sicher, da kein Formular-State
  existiert, der verloren gehen könnte.
- Poll bereits beendet (`end` aufgerufen) bevor der Layout-Fix passiert:
  kein Risiko mehr, da keine aktive Session mehr besteht.
- User antwortet SEHR schnell zwischen zwei Fix-Iterationen: die Sequenzregel
  (immer erst Poll konsumieren, dann erst reloaden) deckt auch diesen Fall ab,
  weil der Agent das aktuelle Poll-Ergebnis ohnehin vor dem nächsten Reload lesen
  muss.

## Non-Goals

- Keine Änderung an der `lavish-axi`-CLI selbst (externes npm-Paket, nicht in
  diesem Repo vendored).
- Keine automatisierte Erkennung von "User hat Radio angeklickt, aber nicht
  submitted" — das ist clientseitiger Browser-State, den der Agent nicht
  serverseitig einsehen kann. Die Lösung ist prozedural (Reload-Sequenzierung),
  nicht technisch-detektierend.
