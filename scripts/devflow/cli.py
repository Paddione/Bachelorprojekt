"""Einziger Einstieg ins devflow-Backend: `python3 -m devflow <verb>` (T901630).

Der Dispatch reicht das uebrige argv an `main(argv)` des Verb-Moduls durch,
sodass `python3 -m devflow <verb> --help` funktioniert. Verben werden dynamisch
ueber vorhandene Module aufgeloest: p1 liefert `sandbox`, p2 ergaenzt
`turbolint` und `insta_ci` ohne Aenderung hier.

Exit-Konvention (wie scripts/plan-lint.sh): 0 gruen, 1 Hard-Fail,
2 Umgebung. Fehler als {"error": {"code", "message"}} nach stderr,
Ergebnis-JSON nach stdout. Stdlib-only.
"""

import argparse
import importlib
import json
import sys

# Verb -> Modulname (Route/Kontrakt: insta_ci, Datei: instaci.py).
VERBS = {"sandbox": "sandbox", "turbolint": "turbolint", "insta_ci": "instaci"}


def available_verbs():
    """Verben, deren Modul importierbar ist (p1: nur sandbox)."""
    found = []
    for verb, module in VERBS.items():
        try:
            importlib.import_module(f"devflow.{module}")
        except ImportError:
            continue
        found.append(verb)
    return found


def _envelope(code, message):
    return {"error": {"code": code, "message": message}}


def main(argv=None):
    """Dispatch auf <verb>; gibt den Exit-Code zurueck."""
    args = list(sys.argv[1:] if argv is None else argv)
    verbs = available_verbs()
    parser = argparse.ArgumentParser(
        prog="python3 -m devflow",
        description="Devflow-Sandbox: ein Verb, JSON rein/raus.",
    )
    parser.add_argument(
        "verb",
        nargs="?",
        choices=verbs,
        help="Verb-Modul; uebriges argv geht an <verb>.main",
    )
    ns, rest = parser.parse_known_args(args)
    if ns.verb is None:
        parser.print_help(sys.stderr)
        return 2
    try:
        module = importlib.import_module(f"devflow.{VERBS[ns.verb]}")
    except ImportError as exc:  # zwischen Help und Dispatch entfernt
        print(json.dumps(_envelope("devflow_env", f"verb module missing: {exc}")),
              file=sys.stderr)
        return 2
    try:
        return int(module.main(rest))
    except Exception as exc:  # fail-closed, nie ein Traceback als API
        print(json.dumps(_envelope("devflow_fail", str(exc) or repr(exc))),
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
