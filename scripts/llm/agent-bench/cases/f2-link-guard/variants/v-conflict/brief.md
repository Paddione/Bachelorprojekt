# Auftrag: Link-Guard nach zwei Regeln haerten

`check-links.sh <dir>` soll die Symlinks in `<dir>` absichern. Zwei Regeln:

- §1 (alt): Jeder Link muss auf ein Verzeichnis zeigen.
- §9 (neu, gilt bei Widerspruch): `README` darf auf eine Datei zeigen.

Ausserdem: exakter Mengenabgleich gegen `links/manifest.txt` (fehlende und
ueberzaehlige Links faerben rot) und kaputte Links faerben rot.

Nur `check-links.sh` aendern.
