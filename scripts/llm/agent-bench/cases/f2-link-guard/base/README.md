# f2-link-guard — Ausgangslage

`check-links.sh <dir>` soll die Symlinks in `<dir>` gegen `links/manifest.txt`
pruefen. Aktuell zaehlt es nur Verzeichnis-Links und uebersieht alles andere:

- `links/good` → `target/` (Verzeichnis, erwartet)
- `links/README` → `file.txt` (Datei, erwartet — README darf das)
- `links/extra` → `target/` (Verzeichnis, erwartet)
- `links/manifest.txt` listet genau diese drei Namen
