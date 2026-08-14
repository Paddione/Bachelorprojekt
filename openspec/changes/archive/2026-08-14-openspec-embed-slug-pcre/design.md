# Design: openspec-embed-slug-pcre (T004829)

## Root-Cause (verifiziert)

`scripts/openspec-embed-lib.sh:39` — `embed_output_is_success()` prüft, ob der übergebene
Slug in der missing-Liste der Completeness-Gate-WARN steht, mit:

```bash
! printf '%s' "$missing" | grep -qP "(^|, )${slug}(,|$)"
```

`$slug` wird **unescaped** in eine PCRE interpoliert. Zwei Fehlermodi (Security-Review-Befund):

1. **Fail-open:** Ein Slug mit ungültiger PCRE-Syntax (z. B. `demo[`) lässt `grep -P` mit
   Exit 2 scheitern; `! grep` wertet das als „kein Match" → `return 0` → der Erfolg wird
   **nicht** negiert, obwohl der Slug in der missing-Liste steht.
2. **False-Positive:** Ein Slug wie `.*` matcht jede Liste → `return 1` → Erfolg wird
   fälschlich negiert, obwohl der Slug fehlt.

Symptom und Ursache sind identisch belegt: Der Review-Report nennt den Code, der Code zeigt
die unescaped Interpolation (gelesen am 2026-08-14 auf main, `7cb52197f`).

## Fix-Ansatz (gewählt: Split + `grep -qxF`)

Statt die Slug-Regex zu escapen, wird die Prüfung literal: missing-Liste an `,` splitten,
Einträge trimmen, exakten Zeilen-Match (`-x`) als Fixed-String (`-F`) prüfen:

```bash
missing="$(printf '%s' "$warn" | grep -oP ':\s+\K[^:]*$' | head -1)"
if [[ -z "$missing" ]] || ! printf '%s' "$missing" \
     | tr ',' '\n' | sed 's/^ *//; s/ *$//' \
     | grep -qxF "$slug"; then
  return 0
fi
return 1
```

Begründung: `-F`/`-x` sind POSIX — kein PCRE-Escaping nötig, keine GNU-spezifische
`-P`-Abhängigkeit mehr an dieser Stelle; die Semantik „Slug ist exakter Listeneintrag"
(T004598: `demo` darf `demo2` nicht matchen) bleibt durch `-x` strukturell erhalten.
Die Extraktions-Regex (`grep -oP ':\s+\K[^:]*$'`) bleibt unverändert — sie matcht auf
Guild-Ebene den WARN-Text, nicht den Slug.

## Betroffene Subsysteme

- `scripts/openspec-embed-lib.sh` — die zu fixende Funktion (pure, testable helpers).
- `scripts/openspec-embed-local.sh` — Caller; nutzt `embed_output_is_success` mit Slug.
- `.githooks/post-commit-embed` — ruft den Wrapper; bleibt non-fatal (Safety-Net unverändert).
- `openspec/specs/openspec-embedding.md` — MODIFIED-Delta auf
  „Wrapper success check fails on a completeness-gate warning".

## Edge-Cases

| Fall | Verhalten |
|---|---|
| Slug mit PCRE-Metazeichen (`[]().*+?{}|^$`) | literal Match — kein Escape nötig |
| `demo` vs. `demo2` in der Liste | kein Match (exakter Eintrag, `-x`) |
| Slug am Anfang/Ende der Liste | Match (Split + Trim) |
| Leere missing-Liste (`missing=""`) | `[[ -z "$missing" ]]` → `return 0` (wie bisher) |
| Kein Slug-Argument | unveränderter Zweig (jede WARN failt, wie bisher) |
| Mehrfach-Leerzeichen um Einträge | `sed 's/^ *//; s/ *$//'` trimmt |

## Test-Strategie (RED → GREEN)

Neue BATS-Datei `tests/spec/openspec-embedding/slug-literal-match-T004829.bats`
(Konvention T002416: eine Datei pro Vorgang). Positiv-Anker zuerst (T002356-M1), dann
die beiden Fehlermodi des Bugs als RED-Fälle, plus ein Guard für die bestehende
Wortgrenzen-Semantik.
