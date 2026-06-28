# g-cq05-todo-cleanup

## Purpose

Stellt sicher, dass unverlinkte `TODO`-Kommentare im Quellcode nicht unkontrolliert akkumulieren. Jeder TODO-Marker, der keinem Ticket zugeordnet ist, verdeckt ungerledigte Arbeit und erhöht die Schuld ohne Sichtbarkeit im Ticket-System. Das Ziel hält den Bestand bei ≤ 1, indem der Measure-Command Falsch-Positive aus OpenSpec-Tooling-Dateien ausschließt und neue echte TODOs durch einen CI-Gate sichtbar werden.

## Requirements

- REQ-1: Der Measure-Command ist reproduzierbar — er liefert auf jedem Checkout mit aktuellem Stand dasselbe Ergebnis ohne externe Abhängigkeiten (kein Netz, kein laufender Cluster).
- REQ-2: Der Measure-Command schließt Dateien aus, die `TODO` ausschließlich als Erkennungs-Pattern verwenden (`openspec-validate.ts`, `openspec-validate.test.ts`, `openspec-merge.mjs`), sowie die bereits ausgeschlossenen Tooling-Dateien (`plan-lint.sh`, `plan-qa-check.sh`, `openspec.sh`).
- REQ-3: `scripts/health-goals-check.sh` enthält eine `row target G-CQ05`-Zeile, die den korrekten Measure-Command inline ausführt und gegen das Target `le 1` vergleicht.
- REQ-4: Der verbleibende Treffer in `website/src/lib/assistant/actions/admin/sendInvoice.ts` ist als Pre-Baseline-Stub dokumentiert und wird in einem separaten Feature-Ticket (Rechnungsversand-Pipeline) adressiert.
- REQ-5: Neue `TODO`-Marker, die nach diesem Change hinzugefügt werden, ohne eine Ticket-Referenz im Format `TODO(TxxxxxxXX)` zu tragen, werden durch den Health-Check sichtbar (Zähler steigt über 1) und lösen bei `--strict`-Modus einen Fehler aus.

## Acceptance Criteria

- THEN liefert der Measure-Command `grep -rnE "\bTODO\b" --include=*.ts --include=*.svelte --include=*.astro --include=*.sh --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh|openspec-validate|openspec-merge" | wc -l` den Wert `1`.
- THEN gibt `bash scripts/health-goals-check.sh --only=G-CQ05` den Status grün aus (Ist-Wert 1 ≤ Ziel 1).
- THEN enthält `scripts/health-goals-check.sh` genau eine Zeile, die mit `row target G-CQ05` beginnt.
- THEN schließt der Measure-Command in der `row`-Zeile die Dateien `openspec-validate` und `openspec-merge` aus dem grep aus.
