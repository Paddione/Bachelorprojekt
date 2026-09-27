# Auftrag: Wirkungslosen Link-Guard hart machen

`check-links.sh <dir>` soll die Symlinks in `<dir>` absichern, faerbt aber nie
rot: Es ueberspringt Nicht-Verzeichnis-Ziele still und zaehlt nur. Kaputte
Links, geloschte Links und Fremdlinks bleiben unentdeckt.

Haerte den Guard:

1. Exakter Mengenabgleich gegen `links/manifest.txt` — jeder fehlende UND
   jeder ueberzaehlige Link faerbt rot (Exit ungleich 0).
2. Kaputte Links (Ziel existiert nicht) faerben rot.
3. Links, die auf kein Verzeichnis zeigen, faerben rot — mit einer Ausnahme:
   `README` darf auf eine Datei zeigen.

Nur `check-links.sh` aendern.
