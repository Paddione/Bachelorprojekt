# P1: Backend-Core — Paket, CLI, Sandbox

Ticket T901630 · Partial p1 zu `tasks.md` · Role impl · Depends: keine

Ziel: lauffähiges Python-Paket `scripts/devflow/` mit einzigem Einstieg
`python3 -m devflow <verb>` (JSON rein/raus, Exit 0 grün / 1 Hard-Fail /
2 Umgebung) plus `sandbox.py` mit Manifest `.devflow/sandbox.json`.

Budgets: alle drei Zieldateien sind neu und nicht gebaselined. Das
`.py`-Limit 800 aus `docs/code-quality/gates.yaml` (`s1.limits`) gibt jeder
Datei volles Budget mit Wachstumsreserve. Reine Python-Stdlib, keine neuen
Dependencies. Die S4-Erreichbarkeit stellt p3 über
`taskfiles/Taskfile.llm.yml` her. Aufrufkontext ist der Repo-Root mit
`PYTHONPATH=scripts`.

## Task 1: Paketmarker und CLI-Einstieg

Steps:

1. `scripts/devflow/__init__.py` als Paketmarker anlegen.
2. `scripts/devflow/cli.py` mit `main(argv=None) -> int` anlegen: Dispatch
   auf `<verb>` per `argparse`, JSON-Eingabe von stdin, Ergebnis-JSON nach
   stdout, Fehler als `{"error": {"code", "message"}}` nach stderr. Der
   Dispatch reicht übrige argv an `main(argv)` des Verb-Moduls durch, sodass
   `python3 -m devflow <verb> --help` funktioniert.
3. Exit-Konvention: 0 grün, 1 Hard-Fail, 2 Umgebung (Pfad fehlt, Manifest
   unlesbar). Vorbild für fail-closed mit Exit 1 bei Hard-Fail ist
   `scripts/plan-lint.sh` (Kopf Z. 1–6).
4. In `cli.py` nur Stdlib importieren (`argparse`, `json`, `sys`).

Verify:

- `python3 -m py_compile scripts/devflow/__init__.py scripts/devflow/cli.py`
- `PYTHONPATH=scripts python3 -m devflow --help` endet mit Exit 0 und
  listet das Verb `sandbox`
- `echo '{}' | PYTHONPATH=scripts python3 -m devflow sandbox; echo
  "exit=$?"` zeigt Exit 2, weil Pflichtfelder fehlen

## Task 2: Sandbox-Modul mit Manifest

Steps:

1. `scripts/devflow/sandbox.py` mit den Funktionen `create`, `activate`,
   `destroy` anlegen. Jede Funktion nimmt Pfad plus Manifest-Felder als
   Parameter und gibt ein Dict für den JSON-Output von `cli.py` zurück.
2. `create` schreibt `.devflow/sandbox.json` mit den Schlüsseln `ticket`,
   `branch`, `plan`, `intel-snapshot`. `activate` liest und validiert das
   Manifest. `destroy` entfernt den `.devflow`-Eintrag.
3. In `sandbox.py` nur Stdlib importieren (`json`, `pathlib`).

Verify:

- `python3 -m py_compile scripts/devflow/sandbox.py`
- `create`/`activate`/`destroy` einmal gegen ein Temp-Verzeichnis
  ausführen: Manifest enthält alle vier Schlüssel, `activate` nach
  `destroy` meldet einen Fehler

## Task 3: Verdrahtung, Rauchtest, Commit

Steps:

1. Das CLI-Verb `sandbox` in `cli.py` an `create`/`activate`/`destroy`
   aus `sandbox.py` anschließen. Die Aktion steht im JSON-Feld `action`
   (`create`, `activate`, `destroy`), Fehler folgen dem Envelope aus
   Task 1 Schritt 2.
2. Rauchtest Ende-zu-Ende: `sandbox create` mit Ticket T901630 in ein
   Temp-Verzeichnis, dann `activate`, dann `destroy`, jeweils JSON auf
   stdout prüfen.
3. Stdlib-Nachweis: `grep -rn "^import \|^from " scripts/devflow/` zeigt
   nur Stdlib-Module.
4. S1-Nachweis: `wc -l scripts/devflow/*.py` bleibt je Datei deutlich
   unter dem `.py`-Limit 800.
5. Commit mit gültigem Scope, z. B. `feat(scripts): devflow backend core
   [T901630]`.

Verify:

- `echo '{"action":"create","ticket":"T901630","branch":"x","plan":"y","intel-snapshot":"z","worktree":"/tmp/df-p1"}' | PYTHONPATH=scripts python3 -m devflow sandbox` endet mit Exit 0 und schreibt `.devflow/sandbox.json`
- `grep -rn "^import \|^from " scripts/devflow/` listet ausschließlich Stdlib
- `wc -l scripts/devflow/__init__.py scripts/devflow/cli.py scripts/devflow/sandbox.py`
