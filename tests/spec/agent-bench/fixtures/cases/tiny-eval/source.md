# tiny-eval — Quelle

Konstruierte Begebenheit (Test-Fixture, keine echte): `base/app.sh` gibt
"broken" aus und scheitert mit Exit 1. Richtig waere "fixed" mit Exit 0.

Rot/Gruen-Nachweis (manuell, 2026-09-27): `checks/run.sh` der Variante v1 ist
gegen `base/` rot (Exit 1) und nach `printf '#!/usr/bin/env bash\necho fixed\n'
> app.sh` gruen (Exit 0).
