# Proposal: openspec-embed-slug-pcre

## Why

Der Security-Review (security-guidance-Plugin) hat eine fail-open-Schwachstelle im
Embedding-Completeness-Gate gefunden: `embed_output_is_success()` in
`scripts/openspec-embed-lib.sh` interpoliert den übergebenen Change-Slug **unescaped** in
eine PCRE (`grep -qP "(^|, )${slug}(,|$)"`). Ein Slug mit Regex-Metazeichen kann die
Prüfung umgehen (ungültige PCRE → grep exit 2 → Erfolg bleibt trotz fehlendem Slug)
oder False-Positives erzeugen (`.*` negiert jeden Erfolg). Das Gate bewertet dann
„Slug fehlt in Warnliste" falsch — genau die Sicherheits-Zusicherung, die es geben soll.

## What

Die Slug-Prüfung wird literal statt per Regex ausgeführt: missing-Liste an `,` splitten,
Einträge trimmen, exakter Match per `grep -qxF "$slug"`. Damit sind beliebige
Slug-Zeichen ungefährlich, die Wortgrenzen-Semantik aus T004598 (`demo` ≠ `demo2`)
bleibt strukturell erhalten, und die GNU-spezifische PCRE-Abhängigkeit entfällt an
dieser Stelle. Dazu: RED-BATS-Test mit Positiv-Anker, MODIFIED-Delta auf
`openspec/specs/openspec-embedding.md`.

_Ticket: T004829_
