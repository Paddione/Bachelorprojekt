# Proposal: domains-live-probe

## Symptom / Lücke
Goal `frontend-domain-ssot`, Kriterium 4 ist offen: Es gibt keinen
wiederholbaren Lauf, der je live Registry-Host DNS, TLS, erwarteten Status
bzw. Redirect und Ziel prüft. Die Registry (`domains.yaml`, 19 Domains, PR
#7040) beschreibt den Soll-Zustand, aber nichts verifiziert ihn periodisch.

## Angenommen → verworfen
- Erwartungen in separater Datei: verworfen (B1) — ein zweiter SSOT driftet;
  die Registry trägt `expect` je live Eintrag.
- Platzhalter zur Laufzeit aus `environments/` mischen: verworfen (B2) —
  `PROD_DOMAIN` kollidiert zwischen `fleet-mentolder`/`fleet-korczewski`/`dev`;
  feste Datei je Cluster (`fleet` → `fleet-mentolder.yaml`, `devmesh` → `dev.yaml`).
- Devmesh in CI strikt: verworfen (B3) — Runner haben kein Tailnet; statt
  Dauer-Rot: SKIP-mit-Grund bei ENOTFOUND, FAIL bei jeder anderen Abweichung.

## Lösung
p1 Script (DNS→TLS→Status, `--validate-only` für CI-sichere Tests) →
p2 `expect`-Daten + Guard-Pflicht in `domains-check.mjs` →
p3 Task + Nightly-/Dispatch-Workflow (04:00 UTC, kein Required Check) →
p4 Offline-Tests + Golden-/Inventory-Refresh (Lehre #7040) + manueller
Live-Voll-Lauf ab Tailnet-Host als K4-Beleg im PR-Body.
