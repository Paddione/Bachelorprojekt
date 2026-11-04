# p3 — Booking T6: AGB-Feld ergänzen

## Ziel
In `tests/e2e/specs/fa-16-booking.spec.ts` (ist 73, nicht-baselined) T6-Payload um das AGB-Bestätigungsfeld aus
`discovery.md` (p1, verbindlich — exakter Name, kein Raten) erweitern, sodass der Non-whitelisted-Slot wieder
die 409-Slot-Prüfung erreicht (`booking.ts:127-140`, unverändert). Keine Handler-Änderung.

## Methode
1. RED-Lauf zuerst: `npx playwright test fa-16-booking -g "T6"` → `expected: FAIL` (400 statt 409).
2. Feld aus p1 in den T6-Payload übernehmen (nur T6; andere Tests unangetastet).
3. Grün-Lauf: `npx playwright test fa-16-booking` → 0 failed (keine 429-Flakes durch 4 Worker auf einer
   Egress-IP — bei Flakes seriell mit `--workers=1` wiederholen, kein Code-Change für Flakes).

## Gates
- RED vor Grün belegt; `npx playwright test fa-16-booking` Exit 0.
- Nur `fa-16-booking.spec.ts` geändert (S1: klein, nicht-baselined).
- <!-- vitest: kein neuer Test nötig, weil E2E-Payload-Update ohne Produkt-Code-Change (409-Pin existiert in booking-availability.test.ts:227-260) -->
