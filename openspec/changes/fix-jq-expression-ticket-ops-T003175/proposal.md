# Fix jq expression in ticket-ops-procedures.md Step 1.1

## Purpose

Der in ticket-ops-procedures.md §Step 1.1 dokumentierte jq-Ausdruck `jq -r '.result[]'` scheitert am tatsächlichen mcp-postgres-Ausgabeformat `[{"result":"<json-string>"}]`. Der korrekte Ausdruck ist `jq -r '.[0].result'`.

## Scope

- `.claude/skills/references/ticket-ops-procedures.md` Zeile 79: jq-Ausdruck korrigieren und den doppelten Parse-Schritt dokumentieren

## Out of scope

- T003174 (Query-Token-Limit) — separat
- Das mcp-postgres-Ausgabeformat selbst — das ist korrekt, nur die Dokumentation weicht ab
