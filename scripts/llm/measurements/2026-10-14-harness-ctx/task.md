# Aufgabe: slugify implementieren

Implementiere `slugify(input)` in
`scripts/llm/measurements/2026-10-14-harness-ctx/sandbox/slug.mjs`.

Regeln:
1. Ergebnis ist kleingeschrieben.
2. `ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss` (auch Grossbuchstaben `Ä`/`Ö`/`Ü`).
3. Jede Folge von Zeichen ausserhalb `a-z0-9` wird zu genau einem `-`.
4. Kein `-` am Anfang oder Ende.

Aendere nur diese eine Datei. Der Test steht daneben in `slug.test.mjs` und darf
nicht veraendert werden.

Pruefe dein Ergebnis mit:

```bash
node --test scripts/llm/measurements/2026-10-14-harness-ctx/sandbox/slug.test.mjs
```

Beende deine Antwort mit genau einer Zeile:
`PLAN-RUNNER-RESULT: success <kurzfassung>` oder `PLAN-RUNNER-RESULT: failure <grund>`.
