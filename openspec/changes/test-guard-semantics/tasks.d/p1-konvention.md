# p1 — Konvention erweitern

**Dateien (disjunkt):** `CLAUDE.md`, `docs/superpowers/references/gotchas-footguns.md`
**Deckt:** T003104, T003108, T003548, Konventionsteil aus T003230

- [ ] **CLAUDE.md — T002716 auf vier Spielarten erweitern.** Der Abschnitt "Semantik statt
      Darstellung [T002716]" nennt bisher nur das Ausgabeformat eines Werkzeugs. Die vier Faelle
      ergaenzen, jeweils mit dem Fehlermodus und der Form, die stattdessen traegt:

      1. **Dokumentposition (T003104).** `grep -n … | head -1` misst die Position des ersten
         Zufallstreffers im ganzen Dokument. Eine unverwandte Einfuegung oberhalb der gemeinten
         Stelle faerbt den Guard rot, ohne dass sich das Geprueefte geaendert hat. Stattdessen die
         Suche auf den Abschnitt eingrenzen (awk-Bereichsmuster, sed-Range).
      2. **Options-Parsing (T003108).** `grep -qF '--flag'` endet mit **Exit 2**, nicht 1 — `-F`
         macht das Muster literal, verhindert aber nicht, dass das Argument als Option geparst
         wird. In einer `if`-Bedingung sind Werkzeugfehler und "nicht gefunden" ununterscheidbar.
         `-e` oder `--` verwenden. Betrifft jeden Guard, der ein CLI-Flag im Text sucht.
      3. **Konfiguration statt Laufzeit (T003548).** Sitzt der Defekt in der Laufzeit, taugt eine
         Konfigurationsaussage nicht als Stellvertreter. Regel: **ein RED-Lauf, der gruen ist, ist
         ein Befund am Test, kein "schon erfuellt".** Vor dem Abhaken klaeren, ob die Zusicherung
         die Groesse misst, in der der Defekt sitzt.
      4. **Prozesslisten-Format (T003230).** `ps -eo pid=` polstert rechtsbuendig auf die Breite
         von `pid_max`. Ein Test, der das Format vorfindet statt es zu erzwingen, haengt an der
         Uptime der Maschine — lokal gruen, auf frischem Runner rot. Format erzwingen
         (`tr -d '[:blank:]'`, blankes `read -r` ohne `IFS=`).

      Knapp halten: je Fall zwei bis vier Zeilen mit Ticket-Referenz. Die Langfassung kommt in die
      Referenzdatei; CLAUDE.md traegt die Regel, nicht die Fallgeschichte.

- [ ] **`gotchas-footguns.md` — Langfassungen anhaengen.** Je Fall der belegte Vorgang, warum der
      Fehler lokal unsichtbar war und was ihn sichtbar gemacht hat. Besonders lohnend, weil
      untypisch:

      - T003548: Der Autor hatte die Grenze zwischen "aktiviert" und "geladen" im Dateikopf des
        Tests **selbst notiert** und trotzdem darauf aufgebaut. Das Aufschreiben der Abgrenzung
        ersetzt die Pruefung nicht. Sichtbar wurde es allein durch den vorgeschriebenen RED-Lauf.
        Geholfen hat am Ende nicht ein besserer Offline-Test, sondern den vorhandenen
        Laufzeit-Guard (`scripts/llm/routing-check.sh`) ueberhaupt aufzurufen — er lag ungenutzt im
        Repo.
      - T003230: Alle vier Vorab-Hypothesen waren falsch; jede Sonde meldete den erwarteten Wert.
        Gefunden wurde die Ursache erst per Diagnose-Commit im CI. Lokal gruen war es, weil eine
        lang laufende WSL-Instanz bereits 7-stellige PIDs vergibt — exakt Feldbreite, also keine
        Polsterung.
      - T003108: Die Fehlermeldung stammte von `ugrep`, nicht von GNU grep — auf dem Entwicklungs-
        host ist `grep` ein ugrep-Alias. Der Meldungstext unterscheidet sich damit zwischen lokaler
        Shell und CI-Runner, was einen Guard auf den Meldungstext seinerseits unzuverlaessig macht.

      **Budget beachten:** die Datei steht bei 305 von 500 Zeilen. Bleiben die vier Langfassungen
      zusammen unter 195 Zeilen, passt es. Andernfalls eine eigene Referenzdatei anlegen und aus
      `gotchas-footguns.md` darauf verweisen — **nicht** Bestandstext kuerzen, um Platz zu machen.
