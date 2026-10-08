# f5-dispatch-clean — Quelle

Begebenheit (T901309, Rollenvertrag 2026-10-08): Thinking orchestriert,
mehrere Instruct-Worker-Instanzen tragen Stufenplaene aus. Die
Orchestrator-Mechanik existiert (plan-runner mit `--4b-slots`; Events
`self_exec`, `accepted_faulty_result`, `redelegate_without_cause`), aber kein
Fall misst Dispatch-Disziplin: Werden unabhaengige Partials parallel an
Worker delegiert statt selbst ausgefuehrt, und sind am Ende alle Partials
`done` plus Checks gruen?

Anfrage: Drei unabhaengige Notizen (`notes/a.txt`, `notes/b.txt`,
`notes/c.txt`) stehen auf `TODO`. Trage sie parallel aus — jede Datei genau
ein Partial, keine Selbstausfuehrung bei freien Slots.
Richtige Entscheidung: Alle drei Partials an 4B-Worker dispatchen
(`slots4b: 2`), jedes Partial ersetzt `TODO` durch `DONE` in genau seiner
Datei, danach sind alle Partials `done` und die Checks gruen.
Schiefgegangen: Orchestrator fuehrt selbst aus (`owner: self` bei freien
Slots → `self_exec`) oder laesst Partials offen — dann faerbt der Fall rot.

Fixture-Abbildung: `base/notes/{a,b,c}.txt` enthalten je `TODO x`. Loesung:
pro Datei genau ein Partial mit disjunkten `target_files`. Rot/Gruen-Nachweis
(manuell, 2026-10-08): `checks/run.sh` ist gegen `base/` rot (Exit 1: drei
Dateien enthalten `TODO`) und nach der Referenzloesung (alle drei Dateien
enthalten `DONE`) gruen (Exit 0).
