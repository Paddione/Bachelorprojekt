# p2 — Billing-Routen härten + Vitest-Coverage (impl)

## Ziel

Beide Admin-Billing-Routen beantworten DB-Fehler strukturiert (JSON + 500 +
Server-Log) statt unbehandelt zu werfen. Erfolgsantworten bleiben byte-identisch;
keine neuen `any`-Typen (CQ02-Limit ≤ 200).

## Steps

- [ ] `components/website/src/pages/api/admin/billing/dunning/run.ts` (Ist 28,
      Budget 872): `POST`-Handler-Rumpf in try/catch fassen — Muster
      `components/website/src/pages/api/admin/sessions/purge.ts:34-40`
      (`requestLogger`/`console`-Log + strukturierte 500-Antwort). `GET` ist
      lesend/ungefährdet und bleibt unverändert. Voll typisiert, kein `as any`.
- [ ] `components/website/src/pages/api/admin/billing/create-monthly-invoices.ts`
      (Ist 65, Budget 835): Top-Level-DB-Calls (`getUnbilledBillableEntriesByCustomer`
      und alles vor der Pro-Kunde-Schleife) in try/catch fassen mit
      `locals.requestLogger.error` + `Response.json({ error }, { status: 500 })`;
      bestehende Pro-Kunde-Fortsetzung (`created`/`skipped`) unverändert lassen.
- [ ] Colocated Vitest-Tests anlegen (Muster:
      `components/website/src/pages/api/cron/error-log-retention.test.ts`):
  - `components/website/src/pages/api/admin/billing/dunning/run.test.ts` (neu):
    wirft die DB-Schicht → Antwort 500 + JSON-Fehlerkörper; Erfolgsfall unverändert.
  - `components/website/src/pages/api/admin/billing/create-monthly-invoices.test.ts` (neu):
    wirft `getUnbilledBillableEntriesByCustomer` → 500 + Fehlerkörper;
    Pro-Kunde-Teilfehler zählen weiter als `skipped`.
  - Beide Dateien klein schneiden (Wachstumsreserve unter .ts-Limit 900).
- [ ] CQ02 prüfen:
  `bash -c "count=\$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"`

## Akzeptanz

- `tests/spec/workspace-staging-db-tables.bats` Tests 3+4 sind grün.
- Neue Vitest-Dateien laufen im Website-Paket grün; Erfolgsantworten unverändert.
