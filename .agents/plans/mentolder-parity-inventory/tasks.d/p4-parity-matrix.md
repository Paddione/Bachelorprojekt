# p4 — Migrationen, Assets, Klassifikation, Mom-MVP, Baseline

Ziel: `docs/parity/mentolder-parity-matrix.md` als Entscheidungs-Artefakt.

## Target (neu, kein S1-Limit — `.md` nicht in gates.yaml)

- `docs/parity/mentolder-parity-matrix.md`: neu, Matrix mit Evidenz.

## Tasks

- [ ] **1. Migrationen kartieren.** Alle Schema-Migrationen (Brand-CHECKs,
  Invoice-/Booking-Tabellen) mit Pfad und Zweck listen; partielle
  K3-Abdeckung durch Voll-Lektüre schließen.
- [ ] **2. Asset-Konsumenten kartieren.** Verbraucher von Mail-Templates,
  PDF-Layouts, statischen Assets und generierten Dateien mit Quelle
  beschreiben.
- [ ] **3. Klassifikation vergeben.** Jeden Inventur-Eintrag aus p1–p3 als
  retain, extract, replace oder defer einstufen und die Einstufung in der
  Matrix-Tabelle mit Evidenz-Verweis festhalten.
- [ ] **4. Mom-MVP-Vergleich erstellen.** Mom-MVP-Funktionsumfang gegen den
  kartierten Mentolder-Bestand stellen; Delta pro Funktion mit Quelle.
- [ ] **5. Staging-Baseline-Verfahren beschreiben.** Klon ohne Echtdaten,
  Seed-/Synthetikdaten, Verbot jeder Prod-Berührung; konkrete Schritte ohne
  echte Zugangsdaten.
- [ ] **6. Verify.** Matrix vollständig, jede Zeile mit Evidenz-Verweis,
  Baseline-Verfahren ohne Echtdaten-Annahme.
