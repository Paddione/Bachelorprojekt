# Proposal: t001393-lavish-reload

## Why

Beim iterativen Fixen von overflow/overlapping-text Layout-Warnings auf einem
Lavish-Board wiederholt der Agent das Muster "HTML editieren → `npx -y
lavish-axi <html-file>` erneut ausführen". Dieser erneute Aufruf navigiert den
bestehenden Browser-Tab neu (Reload). Enthält das Board ein `input`-Playbook
(Formular), existiert eine getroffene, aber noch nicht per Submit-Button
bestätigte Auswahl (z. B. Radio vor "Antwort senden") ausschließlich im
clientseitigen DOM — sie wird erst beim Submit an den Lavish-Server
übermittelt. Ein Reload in diesem Zeitfenster löscht die Auswahl unbemerkt.

Beobachtetes Symptom (Mishap aus T001373 M3): User meldet "ich habe
geantwortet", der nächste `poll` liefert aber weiterhin `prompts: []`, weil ein
zwischenzeitlicher Layout-Fix-Reload die Auswahl gelöscht hat, bevor der Submit
ankam.

`lavish-axi` selbst ist ein externes npm-Paket (nicht in diesem Repo
vendored) — der Fix muss auf Protokoll-Ebene ansetzen: in
`.claude/skills/lavish/SKILL.md`, der SSOT für alle Agenten, die
Lavish-Boards mit Formularen öffnen (u. a. `dev-flow-plan`/`dev-flow-execute`
Brainstorming- und Grilling-Boards).

## What

- Neue Sektion "Reload Safety" in `.claude/skills/lavish/SKILL.md`, die
  folgende Sequenzregel dokumentiert:
  1. Vor jedem erneuten `npx -y lavish-axi <html-file>`-Aufruf (Reload) MUSS
     der Agent das Ergebnis des zuletzt laufenden `poll` zuerst
     abwarten/konsumieren.
  2. Niemals reloaden, während ein `poll`-Aufruf noch aussteht.
  3. Enthält das Board ein `input`-Playbook-Formular und deutet die
     Poll-Historie oder eine User-Nachricht ("ich habe geantwortet") auf eine
     möglicherweise ungespeicherte Auswahl hin, MUSS der Agent den User
     explizit warnen, bevor er den nächsten Reload auslöst, und um
     Bestätigung/Re-Submit bitten.
  4. Layout-Fixes werden bevorzugt zunächst nur als Datei-Edit vorgenommen;
     der nächste Reload wird mit dem ohnehin fälligen Poll-Zyklus
     zusammengelegt statt zusätzliche Ad-hoc-Reloads während eines offenen
     Formulars zu erzwingen.
- Querverweis-Eintrag in `.claude/skills/references/dev-flow-gotchas.md`
  unter der Lavish-Rubrik, der auf die neue Reload-Safety-Regel verweist.
- Neue Test-Spec `tests/spec/lavish.bats` (grep-basiert, analog zum
  M1-Testmuster in `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats`), die
  das Vorhandensein und den Inhalt der Reload-Safety-Sektion erzwingt.

_Ticket: T001393_
