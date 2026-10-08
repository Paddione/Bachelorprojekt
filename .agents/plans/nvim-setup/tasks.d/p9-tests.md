# p9 — Tests und Gesamtverifikation (Rolle tests)

Tickets: Traegt den T901044-Testanteil
(`tests/spec/neovim-dashboard.bats` auf neue Struktur umstellen) und das
Gesamt-Gate. Haengt ab von: p1, p2, p3, p4, p5, p6, p7, p8.

## Kontext

Befund I4: grosse Testzonen ohne Navigationseinstieg; `.agents/plans` und
Skills ohne Browser. Die BATS-Datei nutzt Output-Verifikation ueber headless
Proben und einen `NVIM_DASHBOARD_CONFIG_SRC`-RED-Hook.

## Task 1 — BATS auf neue Struktur, Plan-/Skill-Browser-Aktionen

Files:

- `tests/spec/neovim-dashboard.bats`
- `components/website/src/data/test-inventory.json`

BATS-Bloecke auf die neue Struktur umstellen (Module `core.*` und
`chapters.*`, Registrierung, Runbook-Index-Vollstaendigkeit:
Index-Parsen gegen registrierte Kapitel). Failing-Test-Schritt: RED-Lauf mit
`NVIM_DASHBOARD_CONFIG_SRC` auf ein leeres Verzeichnis — expected: FAIL
(`bats` meldet Fehler); danach GREEN gegen `dotfiles/nvim`.
Kapitel-Aktionen Test-zu-Datei (Graph-Kanten oder Namenskonvention),
Einzel-Test mit quickfix, Plan-Browser (`tasks.md` + `tasks.d`),
Skill-Browser (`SKILL.md`) gehoeren als eigene Bloecke ans Dateiende unter
eigenem Marker. Danach `task test:inventory` regenerieren (aendert
`test-inventory.json`, mitcommitten).

## Task 2 — Gesamtverifikation (STRUCT3)

Steps in dieser Reihenfolge:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:changed` deckt BATS-Selection, vitest und quality ab; der Plan
beruehrt keine `components/website/src/lib`- oder api-Dateien, daher ist
kein neuer Vitest-Test noetig.

<!-- vitest: kein neuer Test noetig, weil der Plan ausserhalb von
     components/website/src keine Produktdatei anlegt oder aendert. -->

## Akzeptanz

RED-Lauf schlaegt fehl wie erwartet, GREEN-Lauf vollstaendig gruen;
Index-Vollstaendigkeit geprueft; Inventar regeneriert; alle drei Gate-Kommandos
gruen.

## Pruefbefehl

```bash
NVIM_DASHBOARD_CONFIG_SRC=/tmp/nvim-empty bats tests/spec/neovim-dashboard.bats 2>&1 | tail -2
bats tests/spec/neovim-dashboard.bats 2>&1 | tail -2
```

Erwartung: erster Lauf meldet Fehler (expected: FAIL), zweiter Lauf ganz gruen.
