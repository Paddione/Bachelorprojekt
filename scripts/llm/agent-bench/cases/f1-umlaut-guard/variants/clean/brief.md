# Variante `clean` — Tests laufen nicht, Ursache offen

Im Repo laeuft `tests/unit/brain-ingest-prune.bats` nicht durch. Die Assertions
sehen korrekt aus, der Testname ist es nicht:

```
keeps page whose Rückverweis source exists, flags deleted one
```

`tests/bats` und `scripts/lib/run-bats.sh` setzen den Non-ASCII-Vorlauf auf "leer",
weil der Bats-Parser dieser Umgebung `@test`-Namen nicht als UTF-8 liest. Der
Umfang ist historisch: 367 Testnamen mit Umlauten, Em-Dash und Pfeilen sind dort
nie gelaufen. T900068 hat den Guard `scripts/lib/bats-nonascii-testnames.sh`
deshalb scharf geschaltet — er beanstandet Nicht-ASCII **ausschliesslich in
`@test`-Namen**, nicht in Datei-Inhalten.

Zielzustand: `bash scripts/lib/bats-nonascii-testnames.sh .` exit 0, Testlogik
unveraendert, Fixture-Daten unveraendert. Der Guard ist Teil deslaufs und darf
nicht angefasst werden.

Arbeitsverzeichnis ist `TARGET` (dieser Baum). `bash checks/run.sh` ist der
Bewertungslauf: Exit 0 = gruen.
