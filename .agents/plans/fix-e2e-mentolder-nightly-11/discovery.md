# p1 — Discovery: Live-Verhalten rekonstruiert (read-only)

Stand: 2026-11-04 ~20:40–20:45 UTC. Basis-Commit Worktree: `1a8c2909d` (= `origin/main` HEAD).
Methoden: Live-Probing nur lesende Requests + nightly-etablierte Test-Calls
(vergangene Slot-Daten `2020-01-01` → kein Schreib-Call erreicht je den Insert:
Vorher-Tag-Regel / Window-Check antworten vorher 409); unauthentifizierte
Billing-Probes (401 vor jeder Schreib-Operation); Nightly-Log-Analyse
(Run 41815883961, CI-authentifiziert via `secrets.CRON_SECRET`).
Rate-Limit live: 5 Req/min/IP (`429 Zu viele Anfragen` beobachtet 20:40:59Z).

## 1. Booking T6: AGB-Feld — VOLLSTÄNDIG VERIFIZIERT

- Exakter Feldname: **`agbAkzeptiert`** (boolean).
- Live-Probes `POST https://web.mentolder.de/api/booking` (Payload T6-Form mit
  `slotStart 2020-01-01T07:00:00.000Z`, alle Varianten sonst identisch):
  - ohne AGB-Feld → `400 {"error":"Bitte bestätigen Sie die AGB."}` (20:40:46Z)
  - `"agbAccepted":true`, `"agb":true`, `"termsAccepted":true`,
    `"acceptAgb":true`, `"agbConsent":true`, `"datenschutzAccepted":true`,
    `"privacyAccepted":true`, `"agbBestaetigt":true`, `"zustimmung":true`,
    `"einwilligung":true`, `"privacy":true`, `"consent":true`, `"terms":true`,
    `"gdprAccepted":true`, `"dsgvoAccepted":true`,
    `"agbAkzeptiert":false` → alle `400 Bitte bestätigen Sie die AGB.`
  - `"agbAkzeptiert":true` → `409 {"error":"Dieser Termin ist leider nicht
    mehr verfügbar."}` (20:43:57Z) = AGB-Check passiert, Slot-Check erreicht.
- Repo-Stand `main`: `components/website/src/pages/api/booking.ts:37`
  destrukturiert KEIN AGB-Feld; String `Bitte bestätigen Sie die AGB` hat
  0 Treffer im Produkt-Code (`git grep`, alle Refs). Nur Client-seitig kennt
  `components/website/src/components/BookingForm.svelte:41` ein
  `agbAccepted`-State (wird NICHT an `/api/booking` gesendet, Zeilen 154–167).
  → Prod läuft Code, der nicht auf `main` steht (Live-Drift, D3 bestätigt).
- Beispiel-Payload T6 (ergänzt, eine Zeile):
  `{"name":"Test User","email":"test@example.de","phone":"","type":"erstgespraech",
  "message":"","slotStart":"2020-01-01T07:00:00.000Z","slotEnd":"2020-01-01T08:00:00.000Z",
  "slotDisplay":"09:00 - 10:00","date":"2020-01-01","agbAkzeptiert":true}`
  → erwartet live `409` + `body.error` enthält `verfügbar` (T6-Asserts bleiben).
- Verifizierter Live-Status: AGB fehlt/falsch → `400`; `agbAkzeptiert:true` +
  Non-whitelisted-Vergangenheits-Slot → `409`. p3 freigegeben.

## 2. Billing Klientenakte: FeldNAME verifiziert, Wert-Shape = LÜCKE

- Exakter Feldname: **`klientId`** — Beleg: Nightly-Run 41815883961
  (04.11. 10:44:55Z + 10:44:57Z, CI-authentifizierte PR-A-Tests):
  `Error: create-invoice failed (400):
  {"error":"Rechnungen gibt es nur noch aus der Klientenakte (klientId fehlt).
  Fakturierung → Neue Rechnung → Klient wählen."}`
  (`tests/e2e/helpers/billing.ts:33`, Route
  `POST /api/admin/billing/create-invoice` mit `{name,email,lines,…}` ohne `klientId`).
- Repo-Stand `main`: `klientId`/`Klientenakte` = 0 Treffer im gesamten
  Produkt-Code (`git grep` über alle Branches/Refs; auch `origin/main` HEAD
  `1a8c2909d` enthält es nicht); `components/website/src/pages/api/admin/billing/create-invoice.ts:16-25`
  macht get-or-create per E-Mail ohne `klientId`. → Prod läuft Code, der nicht
  auf `main` steht (Live-Drift, D2 bestätigt).
- 401-vs-400-Ordering (T3, `POST /api/billing/create-invoice`, unauth, `{}`):
  - Nightly 04.11. 10:44:51Z: `Expected: 401, Received: 400` (Validierung vor Auth).
  - Eigene Live-Probe 04.11. 20:40:46Z: `401 {"error":"Unauthorized"}` für
    `/api/billing/create-invoice` UND `401 Unauthorized` für
    `/api/admin/billing/create-invoice` (unauth) = aktuell Auth-zuerst,
    passend zu `create-invoice.ts:14-19` bzw. `billing/create-invoice.ts:14-19`.
  - → Prod wurde zwischen 10:44Z und 20:40Z heute erneut deployed
    (Moving Target). T3-Erwartung `401` gilt live JETZT; vor p2-Grün
    erneut verifizieren.
- LÜCKE (risks[]): Welchen WERT `klientId` live akzeptiert (UUID aus
  `billing_customers`? CRM-`userId` aus `POST /api/admin/clients/create`?
  Kundennummer?) ist ohne Prod-Admin-Session NICHT verifizierbar:
  `environments/.secrets/fleet.yaml` enthält kein `CRON_SECRET`
  (nur Infra-Keys), das `dev.yaml`-Secret gilt nur für devmesh, deploytes
  Image-Digest ist parametrisiert (`${WEBSITE_IMAGE_DIGEST}`) und ohne
  Cluster-Zugriff nicht auflösbar, kein Branch/PR im Repo enthält die
  Klientenakte-Implementierung. P2 darf den Wert NICHT raten (Fail-Closed):
  Helper-Signatur `klientId?` optional vorsehen, aber erst mit
  Prod-Auth-Pfad (Parent/Eigner) Wert-Shape + Grün-Lauf verifizieren.

## 3. Risiken / Gaps

- `risks[]`: Klientenakte-Wert-Shape unverifiziert (s. Lücke oben) → p2
  wartet auf Prod-Auth-Pfad oder Eigner-Entscheidung.
- `risks[]`: Prod heute im Wandel (Ordering 400→401 zwischen Nightly und
  Discovery) → p2/p3-Grün-Läufe sind Momentaufnahmen; Gate bleibt Nacht-Nightly.
- Deployed-Image-Source-Branch unbekannt (Digest parametrisiert) →
  keine Source-Evidenz möglich, nur Live-Probing (dokumentiert wie erfolgt).
