# Proposal: unsloth-eval-harness

## Why

Ein Trainingslauf ohne Bewertungsmaßstab ist nicht abnehmbar. Das ist keine Vorsichtsformel,
sondern das Ergebnis einer Vorab-Sitzung am 2026-08-03 auf der Zielhardware: drei aufeinander
aufbauende Finetunes eines Modells lagen sämtlich **unter** ihrem eigenen Basismodell.

| Lauf | Änderung | Verhaltensmessung |
|---|---|---|
| Basismodell | — | 9/10 |
| v1 | SFT auf externem Korpus | 8/10 |
| v2 | zusätzlich 327 Negativbeispiele | 6/10 |
| v3 | zusätzlich assistant-only Loss | 8/10 |

Die Trainings-Loss fiel in allen drei Läufen sauber (1,28 / 1,29 / 0,52). Sie misst die Passung an
die Datenverteilung — kodiert die Verteilung das falsche Verhalten, misst sie Fortschritt in die
falsche Richtung. Ohne die Base-gegen-Tuned-Messung hätte jeder der drei Läufe nach Erfolg
ausgesehen, und v2 wäre ausgeliefert worden.

Drei Eigenschaften dieser Messung waren dabei entscheidend und fehlen einem naiven Testset:

1. **Negativfälle.** Die gefährlichste Regression trat dort auf, wo die korrekte Antwort das
   *Ausbleiben* einer Aktion ist: das Modell erfand fehlende Pflichtargumente, statt nachzufragen.
   In einem Agentenstack ist ein erfundenes Zielobjekt kein Textfehler, sondern eine Operation am
   falschen Ziel.
2. **Ungesehene Aufgaben.** Ein erster Testdurchlauf mit einfachen Fällen ergab 20/20 zu 20/20 —
   ein Nullresultat, weil das Basismodell dort bereits gesättigt war. Erst schwierigere,
   generalisierende Fälle trennten überhaupt.
3. **Sprachkontrolle.** Trainingskorpus englisch, Testset deutsch war ein unkontrollierter
   Störfaktor. Gemessen: Basismodell 10/10 englisch gegenüber 9/10 deutsch. Das erklärt einen
   Punkt — nicht die Rangfolge, aber ohne den Gegentest wäre die Aussage nicht belastbar gewesen.

## What

Ein wiederverwendbarer Harness, der jeden Adapter gegen sein Basismodell misst und ein hartes
Abnahme-Gate liefert:

- **Paarweiser Vergleich** Base gegen Tuned auf identischem Testset, identischen Decoding-Parametern
  (greedy) und identischem Prompt-Pfad. Ergebnis maschinenlesbar als JSON, je Fall und aggregiert.
- **Testset mit mindestens 40 Fällen**, unterteilt in positive Fälle (eine Aktion ist korrekt),
  Negativfälle (keine Aktion ist korrekt) und unterspezifizierte Fälle (Rückfrage ist korrekt).
  Jeder Fall existiert in Trainings- und Zielsprache.
- **Regressions-Gate:** liegt der Adapter unter seinem Basismodell, endet der Lauf mit Exit ungleich
  null. Damit ist die Bedingung maschinell prüfbar, statt in einem Bericht zu stehen, den niemand
  liest.
- **Testfälle als Daten, nicht als Code**, damit neue Fälle ohne Codeänderung hinzukommen und der
  Umfang wachsen kann.

**Abgrenzung:** Keine Trainingslogik und kein Modell-Serving — beides liegt in T002587
(`unsloth-training-env`). Der Harness ist bewusst unabhängig vom Trainingspfad, damit er auch
Adapter bewerten kann, die außerhalb dieses Setups entstanden sind.

_Ticket: T002606_
