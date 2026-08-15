# p1 — Implementierung: --auto-kill in scripts/runtime-drift-check.sh

Ziel: Der Guard erhaelt einen opt-in Auto-Kill-Modus. Ohne Flag bleibt alles unveraendert
(meldend, read-only, Exit 1 bei Drift) — der Bestandstest
`tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats` (Test „Guard beendet den
driftenden Prozess NICHT") muss gruen bleiben. Design-Entscheidungen: siehe
`openspec/changes/runtime-drift-auto-kill/proposal.md` (schriftliches Brainstorming) und
`design.md`.

## Task 1.1 — Argument-Parsing

Vor dem Hauptlauf (nach den Override-Zuweisungen, vor `echo "runtime-drift-check: …"`) einen
Arg-Loop einfuehren:

- `--auto-kill` → `AUTO_KILL=1`
- `--help` / `-h` → Usage auf stdout + Exit 0
- alles andere → Usage auf stderr + Exit 2 (bisher wurde `$@` still ignoriert — das
  unbekannte-Flag-Verhalten ist ein beabsichtigter Vertrag, siehe Delta-Spec-Szenario)

Randbedingung: der Guard wird ohne Argumente (Bestandstests) und mit `$@`-leerem Aufruf
(`run "$GUARD"`) genauso behandelt wie heute — der Loop muss ohne Argumente ein No-op sein.
Achtung `set -u`: der Loop darf keine uninitialisierten Variablen referenzieren.

## Task 1.2 — Kill-Logik in _check_binary

In `_check_binary` (beide Drift-Zweige: deleted-Inode und sha256-Mismatch) bleibt `report`
bestehen; bei `AUTO_KILL=1` folgt danach:

1. `kill "$pid"` (SIGTERM — derselbe sanfte Befehl wie der dokumentierte Operator-Hinweis
   `kill $pid`).
2. Kurze Poll-Schleife (bis ~1 s, z.B. `for _ in 1 2 3 4 5; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done`):
   - Prozess weg → geheilt: `DRIFT_COUNT=$((DRIFT_COUNT - 1))` und Meldung
     `automatisch beendet (--auto-kill): $pid` auf stdout.
   - Prozess lebt nach Frist → ungeheilt: `report "Prozess $pid konnte nicht beendet werden (--auto-kill)"`
     (Befund bleibt, Exit 1).

Sicherheitsgrenzen (strukturell, nicht verhandelbar):

- Nur Prozesse, die in `_check_binary` bereits als Drift gegen eine **registrierte**
  stdio-Binary identifiziert wurden, sind Kill-Kandidaten. Es gibt keinen
  „kill alle mit deleted-exe"-Pfad — Fremdprozesse sind per Konstruktion nie Kandidat.
- Nur `transport: stdio`-Eintraege werden geprueft (bestehende Logik in `check_processes`
  unveraendert) — http/sse-Server werden nie beendet.
- Kein Kill ausserhalb der beiden Drift-Zweige.

## Task 1.3 — DB-Pruefer unveraendert lassen

`check_db` wird nicht angefasst: Migrationen werden nie automatisch angewendet;
DB-Befunde bleiben Befunde (residualer Drift, Exit 1). Die bestehende Skip-Semantik
(unerreichbare DB) bleibt.

## Task 1.4 — Header-Kommentar aktualisieren

Den Kopfkommentar des Skripts („Der Guard MELDET nur, er greift nicht ein") um den
Auto-Kill-Modus ergaenzen: ohne `--auto-kill` meldend/read-only; mit `--auto-kill` beendet
der Guard driftende Prozesse der eigenen Registry (SIGTERM); der Server startet beim
naechsten Tool-Aufruf neu (bestehende Neustart-Semantik, kein Selbst-Neustart durch den
Guard); DB-Drift wird in beiden Modi nur gemeldet.
