# p0 — Fan-in-Baseline + Gate grün VOR Änderung (Tests-Rolle, zuerst)

## Ziel
Verbindliche Zählbasis für den `getSession`/`isAdmin`-Fan-in + Beleg, dass
alle Gate-Tests VOR der Änderung grün sind (Nachher-Vergleich in p2).

## Schritte
1. Fan-in zählen (lesend, Commit-SHA `f0e00b7ff` notieren):
   `rg -n "getSession\b" components/website/src --type ts -g '!*.test.*' | wc -l`
   (≈ 496–509 erwartet) sowie
   `rg -n "isAdmin" components/website/src --type ts -g '!*.test.*' | wc -l`
   (≈ 457–470 erwartet). Caller-Familien gruppieren
   (`pages/api/admin`, `pages/sdlc/api`, Rest) — Rest > 10 Sites → STOP an
   Primary (Rescope nötig, vgl. STOP-Regel in `tasks.md`).
2. Cache-Semantik gegenlesen (`auth.ts:349-399`): Key = Session-Id aus eigenem
   Cookie-Header, Negative NICHT cachen, Evict bei Delete/Expiry,
   `useCache=true` nur in `getSession`, Injektionspunkt `useCache=false`.
   Abweichung vom Bestand oben → STOP an Primary.
3. Baseline-Gates grün belegen (je Befehl + Ergebnis in `phase-events.log`):
   - `task test:changed` (Repo-Root, Smart-Selection muss `auth.test.ts`
     enthalten) — erwartet: grün.
   - `pnpm --dir components/website test:unit src/lib/auth.test.ts`
     (Ziel-Runner `vitest run`) — erwartet: grün.

## Gates (p0Done)
- `phase-events.log`: Fan-in-Counts + Commit-SHA + beide Testergebnisse.
- STOP: Count-Abweichung > ±25 % oder ein Gate rot → an Primary zurückgeben,
  NICHT mit p1 beginnen.
