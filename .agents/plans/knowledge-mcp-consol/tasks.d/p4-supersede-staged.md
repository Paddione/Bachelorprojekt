# P4 — Supersedete staged Plaene archivieren (T900985, T900983)

## Ziel
- Die staged Plaene `.agents/plans/devflow-mcp/` (T900985, plan_staged) und `.agents/plans/toolset-tool-level/` (T900983, plan_staged) als superseded archivieren.
- Alle Referenzen auf den Konsolidierungs-Plan T900998 umbiegen, keine Inhalte doppelt pflegen.
- Ticket-Status per `scripts/ticket.sh` nachziehen (Kommentar + Status, kein stilles Schliessen).

## Betroffene Dateien (NUR diese)
- `.agents/plans/devflow-mcp/tasks.md`
- `.agents/plans/devflow-mcp/design.md`
- `.agents/plans/toolset-tool-level/tasks.md`
- `.agents/plans/toolset-tool-level/design.md`

## Concrete-Steps
- [ ] `tasks.md` in beiden Plaenen oben als `SUPERSEDED durch T900998 (.agents/plans/knowledge-mcp-consol/)` kennzeichnen, Datum 2026-10-04 setzen.
- [ ] `design.md` in beiden Plaenen Status-Zeile auf `superseded-by: T900998` setzen, Spec-Verweis auf `knowledge-mcp-consol/design.md`.
- [ ] Pruefen dass keine aktiven Branch-Arbeiten auf T900985/T900983 laufen (`scripts/agent-lock.sh list`, Worktree-Liste).
- [ ] T900985: `scripts/ticket.sh add-comment --id T900985 --body "Superseded durch T900998 knowledge-mcp-consol"` ausfuehren.
- [ ] T900983: `scripts/ticket.sh add-comment --id T900983 --body "Superseded durch T900998 knowledge-mcp-consol"` ausfuehren.
- [ ] T900985 + T900983 per `scripts/ticket.sh update-status` auf den von T900998 vorgegebenen Supersede-Status setzen.
- [ ] Keine Dateien loeschen oder verschieben, nur Status-Header aendern (Historie bleibt lesbar).

## Gate
- [ ] Kein File-Overlap mit P1-P3: nur die vier Dateien oben angefasst (`git status --porcelain` pruefen).
- [ ] `bash scripts/plan-lint.sh .agents/plans/knowledge-mcp-consol` gruen.
- [ ] Beide Tickets referenzieren T900998 im Kommentarverlauf.
