# p2-tests: Rot-Gruen-Nachweis K3-Symbol (T900907)

Scope: verify-only auf `tests/spec/neovim-dashboard.bats` (der
RED-Test ist seit der Plan-Phase in der Branch; kein Edit) plus
`test-inventory.json`-Pflege. Laeuft nach p1 (`depends_on: p1`). Alle
Befehle im Worktree-Root. Voraussetzung: `nvim` und
`codebase-memory-mcp` vorhanden, sonst skippen die Tests per Guard
(wie T75; in CI ohne beide Binaries erwartet).

## Steps

1. Rot-Seite des Nachweises: p1-Aenderung kurz zur Seite stellen,
   beide Symbol-Tests muessen fehlschlagen mit expected: FAIL —
   `git stash push dotfiles/nvim/lua/config/repo-knowledge.lua &&
   tests/unit/lib/bats-core/bin/bats
   tests/spec/neovim-dashboard.bats -f "k3-symbol" ; rc=$? ;
   git stash pop ; echo "red rc=$rc"` —
   erwartet: `not ok` fuer T75 und den Treffer-Test (Marker mit
   `non-JSON output`). Schlaegt `git stash pop` fehl, sofort stoppen
   und melden (Arbeitsbaum nicht per Hand rekonstruieren).
2. Gruen-Seite: `tests/unit/lib/bats-core/bin/bats
   tests/spec/neovim-dashboard.bats -f "k3-symbol"` muss beide Tests
   mit `ok` melden. Seiteneffekt-Waechter:
   `tests/unit/lib/bats-core/bin/bats
   tests/spec/neovim-dashboard.bats -f "k3-status names"` muss `ok`
   bleiben.
3. Test-Inventar: `task test:inventory` laufen lassen; aendert es
   `components/website/src/data/test-inventory.json`, die Datei
   commiten als `fix(T900907): refresh test inventory for k3-symbol
   regression test [T900907]`.
4. Ergebnis als Kommentar im Ticket festhalten (Rot-/Gruen-Output).
   Falls die Gruen-Seite eine Guard-Anpassung zu erfordern scheint:
   stoppen und melden, Guard nicht stillschweigend anpassen.

## Acceptance

- Rot-Gruen-Paar belegt: `not ok` ohne Fix, `ok` mit Fix, beide mit
  demselben Runner-Aufruf aus Schritt 1 und 2.
- k3-status bleibt gruen; Inventar-Datei aktuell und committet.
