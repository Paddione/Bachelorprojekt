"""Einstieg fuer `python3 -m devflow <verb>` (T901630).

Ohne diese Datei lehnt Python `-m devflow` ab (`No module named
devflow.__main__`); sie ist die notwendige Ergänzung zum Paketmarker und
reicht an cli.main durch. Aufrufkontext: Repo-Root, PYTHONPATH=scripts.
"""

from devflow.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
