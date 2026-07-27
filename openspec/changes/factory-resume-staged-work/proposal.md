# Proposal: factory-resume-staged-work

## Why

Die Factory kann ein bereits angefangenes Ticket heute nicht zu Ende bearbeiten — sie fängt den
Plan von vorne an. `scripts/factory/pipeline.js` erkennt zwar über `FACTORY-PLAN-REF`, dass ein
Mensch den Plan schon geschrieben hat (Zeile 112–127), und `scripts/worktree-create.sh` checkt den
existierenden Branch samt seiner Commits aus. Die Implementierungsschleife in Zeile 357 iteriert
danach aber bedingungslos über **alle** Tasks des Plans. Liegt auf dem Branch bereits die Arbeit für
Partial p1 und p2, implementiert die Factory sie ein zweites Mal.

Damit ist der Übergang zwischen „Plan fertig" und „Ausführung läuft" faktisch binär: entweder der
Mensch führt aus, oder die Factory beginnt neu. Der Rückholweg `ticket.sh reclaim` (T002267) ist
deshalb heute der Regelweg, obwohl er als Notausstieg gedacht war.

Zwei Nebenbefunde derselben Ursache: `read-partials` liest in Zeile 320 aus dem Worktree-Pfad,
obwohl `setupWorktree` erst in Zeile 345 läuft — das geplante Partial-Manifest ist zum Lesezeitpunkt
nicht vorhanden, und der Reuse-Pfad fällt still auf einen LLM-Decompose zurück. Und ist der Branch
bereits in einem Worktree einer lebenden Session ausgecheckt, scheitert `git worktree add` und die
Factory eskaliert das Ticket auf `blocked`, statt die fremde Zuständigkeit zu erkennen.

## What

`dev-flow-execute` wird factory-tauglich gemacht — **kein neuer Skill**. Es bleibt ein
Ausführungspfad für Mensch und Factory, damit beide nicht auseinanderlaufen.

- Die Pipeline ermittelt vor der Implementierung, welche Plan-Tasks auf dem Reuse-Branch bereits
  erledigt sind, und überspringt sie. Grundlage sind die abgehakten Checkboxen im Plan sowie die
  Partial-Marker in den Commit-Nachrichten des Branches.
- Das Partial-Manifest wird erst gelesen, nachdem der Worktree bereitsteht, damit der geplante
  Partial-Fan-out den LLM-Decompose tatsächlich ersetzt.
- Ist der Branch in einem anderen Worktree ausgecheckt, erkennt die Factory das als fremde
  Zuständigkeit und stellt zurück, statt `blocked` zu setzen.
- Das Hold-Gate aus T002272 bleibt unverändert: `execution_released=false` ist weiterhin der
  Default, die Factory greift erst nach `ticket.sh release-hold`. Fortsetzungsfähigkeit ersetzt die
  Freigabe nicht, sie macht sie nur folgenlos für bereits geleistete Arbeit.
- `ticket.sh reclaim` bleibt unangetastet als manueller Notausstieg für entgleiste Ausführungen.

_Ticket: T002327_
