# p1 — Kernpfade Buchung bis Rechnung

Ziel: `docs/parity/mentolder-flows-core.md` mit belegten Kernpfaden.

## Target (neu, kein S1-Limit — `.md` nicht in gates.yaml)

- `docs/parity/mentolder-flows-core.md`: neu, Kernpfade mit Evidenz.

## Tasks

- [x] **1. Buchungs-Pfad kartieren.** Öffentlichen POST
  `components/website/src/pages/api/booking.ts` (Zeitfenster-Validierung,
  Inbox-Anlage, Bestätigungs- und Admin-Mail) mit Symbol- und Zeilen-Evidenz
  beschreiben. Vor-Evidenz aus Checkout 0ff76b4 am aktuellen Stand
  verifizieren; Abweichungen notieren.
- [x] **2. Verfügbarkeit und Claiming kartieren.**
  `components/website/src/lib/appointments-db.ts` (brand-scoped Fenster,
  atomares Whitelist-Claiming) beschreiben und belegen, ob der öffentliche
  POST das Claiming nutzt oder nicht. Keine Race-Safety behaupten, die der
  Code nicht zeigt.
- [x] **3. Rechnung- und Zahlungs-Pfad kartieren.**
  `components/website/src/lib/invoice-payments.ts` (Transaktionen,
  Rechnungs-Lock, Zahlungsdatensätze, manuelle Methoden) plus angrenzende
  Rechnungs-Module (`invoices.ts`, Storno, Dunning, PDF) mit Evidenz
  beschreiben.
- [x] **4. Test-Referenzen je Pfad notieren.** Zu jedem kartierten Pfad die
  existierenden Tests nennen (z.B. `appointments-db.test.ts`,
  `invoice-payments.test.ts`) oder explizit `kein Test` vermerken.
- [x] **5. Verify.** Datei existiert, jeder Eintrag trägt Pfad + Symbol +
  Zeilenbereich + Befund + Test-Referenz. Keine unbelegten Behauptungen.
