# p5 — Finale Verifikation (Tests-Rolle)

## Ziel
Endzustands-Beweis: keine direkten Cross-Imports mehr, alle Gates grün,
`get_architecture`-Beleg für `goal: od1-website-sink`.

## Schritte
1. Boundary-Test VERSCHÄRFEN: Allowlist auf leer setzen (Red-phase-Bezug aus p0:
   mit leerer Allowlist war der Lauf expected: FAIL — das Gate erkennt den
   Bestand, bevor es ihn schützt; bzw. nur noch
   dokumentierte Config-Ausnahmen aus p4.2) → `pytest` MUSS grün sein.
   Jeder Treffer ab hier = echter Regressions-Fail, kein Inventur-Artefakt.
2. Negativ-Assert ergänzen: `ports/*.ts` importieren weder `db-pool`
   noch `pages/*` noch `components/*` direkt (statischer Scan) — Fassade
   bleibt dünn.
3. Voll-Lauf:
   - `npm run typecheck`
   - `task test:changed`
   - `task freshness:check`
   - `task workspace:validate`
   - `python3 -m pytest tests/py/spec/website_sink/ -q`
4. `get_architecture(aspects=[boundaries])` neu abfragen, Tabelle
   Vorher (p0) / Nachher ins `phase-events.log` + als Kommentar in den
   Boundary-Test-Kopf (Zahlen direkt am Gate).
5. Goal-Evidenz: `task test:changed` + `task freshness:check` +
   `task workspace:validate` grün (exakte Goal-Kriterien).

## Gates (planDone = Goal-Kriterien)
- [ ] Boundary-Test verbietet neue `website`-Importe aus
      `llm|coaching|code-quality` (CI grün).
- [ ] `getSession` + `isAdmin` hinter Interface, Request-Cache,
      Negativ-Tests (`null/garbage/expired`) grün (W2-A-Erbe, hier nur
      Regression: `auth.test.ts`-Nachbarn in `test:changed` enthalten).
- [ ] `get_architecture(boundaries)`: `llm → website` strikt fallend,
      Direkt-Import-Count 0 (ports-mediiert ausgenommen und ausgewiesen),
      kein neuer Cross-Import.
- [ ] `task test:changed` + `task freshness:check` +
      `task workspace:validate` grün.

## Übergabe an Primary (stagen, NICHT in diesem Task)
- Commit + Push des Branches (Worker darf weder committen noch pushen).
- In `.agents/goals/od1-website-sink/GOAL.md` exakt diese Zeile ergänzen:
  `plan_refs: [.agents/plans/call-site-migration/tasks.md]`
  (hinter bestehendes `plan_refs:`-Feld, Datei sonst unverändert).
