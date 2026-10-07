# p2-tests: Rot-Gruen-Nachweis Env-Entkopplung (T900922)

Scope: verify-only. Manifest-Target ist die Guard-Datei
(`tests/spec/ci-cd/spec-tracked-file-guard.bats`, kein Edit);
zusaetzlich werden die drei p1-Dateien schreibfrei ausgefuehrt.
Laeuft nach p1 (`depends_on: p1`). Alle Befehle im Worktree-Root.

## Steps

1. Rot-Seite des Nachweises: p1-Aenderung kurz zur Seite stellen,
   alle drei Tests muessen fehlschlagen mit expected: FAIL —
   benoetigt eine Shell MIT abweichendem Token-Env (falls
   `BGE_MCP_TOKEN` leer ist: `export
   BGE_MCP_TOKEN=poisoned-value-for-t900922`, Platzhalter, kein
   echter Credential):
   `git stash push tests/spec/mcp-tooling.bats
   tests/spec/mcp-gateway.bats
   tests/spec/mcp-gateway/authenticated-http-headers.bats &&
   tests/unit/lib/bats-core/bin/bats
   tests/spec/mcp-tooling.bats -f "erkennt Drift" ;
   tests/unit/lib/bats-core/bin/bats
   tests/spec/mcp-gateway.bats -f "check passes" ;
   tests/unit/lib/bats-core/bin/bats
   tests/spec/mcp-gateway/authenticated-http-headers.bats -f
   "stays green" ; rc=$? ; git stash pop` —
   erwartet: dreimal `not ok`. Schlaegt `git stash pop` fehl,
   sofort stoppen und melden (Arbeitsbaum nicht per Hand
   rekonstruieren). Danach `unset BGE_MCP_TOKEN`, falls in
   diesem Schritt exportiert.
2. Gruen-Seite (wieder MIT Token-Env wie in Schritt 1): alle drei
   Filter-Laeufe muessen `ok` melden. Damit ist bewiesen, dass
   der Fix die Env-Abhaengigkeit entfernt, nicht die Drift-
   Erkennung (T002398 enthaelt weiter die injizierte
   `drift-probe`-Negativpruefung).
3. Volle Dateien laufen lassen:
   `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats
   tests/spec/mcp-gateway.bats
   tests/spec/mcp-gateway/authenticated-http-headers.bats` —
   alle Tests gruen (Skips zaehlen nicht als Fehler).
4. Knock-on-Guard: `tests/unit/lib/bats-core/bin/bats
   tests/spec/ci-cd/spec-tracked-file-guard.bats -f "unberuehrt"`
   muss `ok` melden. Bleibt er rot, stoppen und melden — Guard
   nicht stillschweigend anpassen.
5. Ergebnis als Kommentar im Ticket festhalten (Rot-/Gruen-Output);
   kein Commit noetig, da keine Datei geaendert wurde.

## Acceptance

- Rot-Gruen-Paar belegt: `not ok` ohne Fix, `ok` mit Fix, beide
  mit denselben Runner-Aufrufen aus Schritt 1 und 2.
- Volle Dateien gruen, T002779-Guard gruen.
