# p4 — Konventions-Guard (Tests-Rolle)

**Dateien (disjunkt):** `tests/spec/agent-skills/guard-semantics-konvention.bats` (neu)
**Traegt den Failing-Test-Step (STRUCT2).**

Der Guard sichert die Konvention aus p1 in **beiden** Formen ab: die zwei Regeln, die ausfuehrbar
pruefbar sind, werden ausgefuehrt; nur der Drift-Schutz fuer den Konventionstext ist ein
Textabgleich. Der Dateikopf dokumentiert diesen Mischmodus ausdruecklich — die
Test-Resultats-Konvention (T002448-M4) verlangt das, weil Source-Grep sonst als Nachlaessigkeit
gelesen wird statt als der begruendete Ausnahmefall, der er hier ist.

- [ ] **Fall 1 — Options-Parsing ausfuehrbar zusichern (T003108).** Kein Grep auf die Regel,
      sondern ihr Nachweis:

      ```bash
      run bash -c "printf '%s\n' 'text mit --draft drin' | grep -qF '--draft'"
      [ "$status" -eq 2 ]     # Werkzeugfehler, NICHT 1 (nicht gefunden)
      run bash -c "printf '%s\n' 'text mit --draft drin' | grep -qF -e '--draft'"
      [ "$status" -eq 0 ]     # Positiv-Anker: mit -e wird gefunden
      ```

      Der Positiv-Anker steht bewusst an zweiter Stelle, aber er ist der wichtigere Teil: ohne ihn
      wuerde der Test auch dann bestehen, wenn `grep` gar nicht vorhanden waere.

      **Vorsicht bei der Erwartung `status -eq 2`:** der Exit-Code stammt vom jeweiligen
      grep-Werkzeug. Auf dem Entwicklungshost ist `grep` ein `ugrep`-Alias, auf dem CI-Runner ist es
      GNU grep. Beide liefern hier 2, aber der **Meldungstext** unterscheidet sich — deshalb nur auf
      den Exit-Code pruefen, nie auf den Wortlaut (T002716).

- [ ] **Fall 2 — Positions-Guard ausfuehrbar zusichern (T003104).** Ein Fixture in `BATS_TMPDIR`
      anlegen, das den Suchbegriff zweimal enthaelt: einmal unter `## 3.` (unverwandt), einmal unter
      `## 4.` (die gemeinte Regel).

      ```
      ## 3.
      ... dedup ...          <- Zufallstreffer, steht oben
      ## 4.
      ... dedup-Regel ...    <- die gemeinte Stelle
      ```

      Zusichern: die bereichsbeschraenkte Suche (awk-Range ab `## 4.`) findet die Regel, die
      dokumentweite `head -1`-Suche liefert die falsche Zeilennummer. Der Test faellt damit um, wenn
      jemand auf die dokumentweite Form zurueckwechselt — und er ist unabhaengig davon, welche
      Bestandsdatei gerade wie aussieht.

- [ ] **Fall 3 — Drift-Schutz fuer den Konventionstext.** Zusichern, dass `CLAUDE.md` alle vier
      Spielarten benennt (Dokumentposition, Options-Parsing, Konfiguration-statt-Laufzeit,
      Prozesslisten-Format). Reiner Textabgleich, im Dateikopf als Ausnahme begruendet: die Regel
      manifestiert sich ausschliesslich im Text, ein Verhaltenstest ist hier nicht moeglich.

      **Formatfrei pruefen (T002716):** `grep -qF` ohne Zeilenanker, auf inhaltstragende Begriffe
      statt auf den exakten Wortlaut. Ein Guard, der die Formulierung festschreibt, bricht bei der
      naechsten redaktionellen Ueberarbeitung und meldet dann einen Defekt, den es nicht gibt —
      genau die Fehlerklasse, die dieser Vorgang behebt. Und: die gesuchten Begriffe beginnen nicht
      mit `-`, hier greift Fall 1 also nicht; falls doch je ein Flag-Name geprueft wird, `-e`
      verwenden.

- [ ] **RED-Lauf nachweisen.** Vor p1/p2/p3 ausfuehren — der Test MUSS rot sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/guard-semantics-konvention.bats
# expected: FAIL (rot — Konventionstext fehlt, Guards noch nicht repariert)
```

      **Ist er gruen, ist das ein Befund am Test, kein "schon erfuellt"** — das ist genau die Regel
      aus T003548, die dieser Vorgang aufnimmt. In dem Fall klaeren, ob die Zusicherung die Groesse
      misst, in der der Defekt sitzt, bevor irgendein Schritt abgehakt wird.

- [ ] **Beide Testformen erfassen (T002696).** Nach GREEN nicht nur die neue Datei laufen lassen:
      Sammeldatei und Verzeichnis sind gleichzeitig gueltig, eine gezielte Suche findet nur die
      Haelfte.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
```
