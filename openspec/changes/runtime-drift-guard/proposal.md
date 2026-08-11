# Proposal: runtime-drift-guard

## Why

CI und Tests vergleichen den Repo-Stand mit sich selbst. Beide sind grün, während die
Laufzeit alten Code ausführt — ein CI-Runner hat weder die Prozessliste noch die Datenbank
der Entwicklungsmaschine und kann diese Fehlerklasse strukturell nicht sehen.

Am 2026-08-11 traf sie zweimal gleichzeitig zu und ließ den Backlog in drei Tagen von ~50
auf 187 Tickets wachsen, wovon 168 Selbstrauschen waren:

**Instanz 1 — ersetzte Binary, alter Prozess.** T003553 stellte die Mishap-Sammlung von
Einzeltickets auf einen Rollup-Container um, gemergt 2026-08-10 22:36. Zwei
`ticket-mcp-go`-Prozesse hielten die ersetzte Binary über ihren offenen Inode-Handle und
liefen rund 18 Stunden mit dem Vor-Fix-Code weiter — sie erzeugten in dieser Zeit 77
überflüssige Tickets in exakten Zehnerblöcken (`MISHAP_TRIGGER = 10`). Der Quellcode war
dabei durchgehend korrekt: `createFactoryFixTicket` hatte keinen Aufrufer mehr. Wer den
Defekt im Repo suchte, fand nichts.

**Instanz 2 — Migration im Repo, nie angewendet.** `scripts/one-shot/purge-fn-v8.sql`
(T002894, 2026-08-09) behebt nachweislich genau den Abbruch, der lokal auftritt — die Datei
zitiert die Fehlermeldung in ihren Zeilen 401–431 wörtlich. Angewendet wurde sie nie. Die
installierte Funktion bricht deshalb bei der ersten Anweisung ab, kein einziger Sweep läuft,
und die 91 Testdaten-Tickets der Factory-Testläufe blieben liegen. Es existiert **kein**
Task, der `scripts/one-shot/*.sql` anwendet: die Lücke ist ein fehlender Mechanismus, kein
Versäumnis.

Eine dritte Instanz ist als T003071 bereits erfasst („Stale factory-mcp binary deployed via
systemd"). Die Klasse wiederholt sich, weil nichts sie sichtbar macht.

## What

`scripts/runtime-drift-check.sh` vergleicht den Repo-Stand mit dem laufenden Stand. Zwei
Prüfer, aufgerufen vom `repo-hygiene`-Skill:

**Prüfer 1 — MCP-Prozesse.** Quelle ist die bestehende SSOT
`docs/agent-guide/registry/mcp.yaml`; jeder `transport: stdio`-Eintrag nennt sein `command`.
Für jeden laufenden Prozess wird `readlink /proc/<pid>/exe` auf die Endung `" (deleted)"`
geprüft und die Prüfsumme der Prozess-Binary gegen die Datei auf der Platte gestellt. Es
entsteht keine zweite Liste: ein neu registrierter Server wird automatisch mitgeprüft.

**Prüfer 2 — DB-Funktionen.** Ein Quelltextvergleich gegen `pg_proc.prosrc` wäre spröde,
weil `CREATE OR REPLACE` den Text normalisiert. Stattdessen deklariert jede Migration ihren
eigenen Nachweis-Marker als Kommentarzeile:

```sql
-- RUNTIME-CHECK: function=tickets.fn_purge_test_data marker=to_regclass
```

Der Prüfer liest die Marker aus `scripts/one-shot/*.sql` und stellt fest, ob `prosrc` sie
enthält — genau die Prüfung, mit der die Ursache belegt wurde. Die Deklaration lebt bei der
Migration; wer eine neue schreibt, macht sie damit prüfbar, ohne eine zweite Datei
anzufassen.

**Verhalten.** Exit 0 ohne Drift, Exit 1 mit Drift, schreibt nie — das Muster von
`task mcp:check`. Der Guard meldet und nennt den Reparaturbefehl; er beendet keine Prozesse
und spielt keine Migrationen ein, weil beides Eingriffe sind, über die der Betreiber
entscheidet. Ohne DB-Zugriff meldet Prüfer 2 `übersprungen` und Exit 0: ein Guard, der ohne
Cluster rot wird, misst die Ausstattung der Umgebung statt den Zustand des Systems.

**Mitgeführter Einzelschritt.** `purge-fn-v8.sql` wird auf die lokale k3d-DB angewendet.
Ohne diesen Schritt wäre der Guard ab seinem ersten Lauf rot — und ein Guard, der von
Anfang an rot ist, wird ignoriert.

_Ticket: T003825_
