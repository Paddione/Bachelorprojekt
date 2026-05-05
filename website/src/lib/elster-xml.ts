import { pool, initBillingTables } from './website-db';

export interface UstvaData {
  year: number;
  period: number; // 1-12 for month, 41-44 for quarter
  brand: string;
}

export async function getUstvaKennzahlen(data: UstvaData) {
  await initBillingTables();
  // Simplified aggregation logic for demonstration
  // In a real app, this would query billing_invoices and eur_bookkeeping
  // filtered by brand, year and period.
  
  const r = await pool.query(
    `SELECT 
       SUM(CASE WHEN tax_rate = 19 THEN net_amount ELSE 0 END) as kz81_net,
       SUM(CASE WHEN tax_rate = 7 THEN net_amount ELSE 0 END) as kz86_net,
       SUM(CASE WHEN supply_type = 'eu_b2b_services' OR supply_type = 'eu_b2b_goods' THEN net_amount ELSE 0 END) as kz41_net,
       SUM(CASE WHEN supply_type = 'drittland_export' THEN net_amount ELSE 0 END) as kz43_net
     FROM billing_invoices
     WHERE brand = $1 AND EXTRACT(YEAR FROM issue_date) = $2 AND status <> 'draft' AND status <> 'cancelled'`,
    [data.brand, data.year]
  );
  
  const b = await pool.query(
    `SELECT SUM(vat_amount) as kz66_vat
     FROM eur_bookkeeping
     WHERE brand = $1 AND EXTRACT(YEAR FROM booking_date) = $2 AND type = 'expense'`,
    [data.brand, data.year]
  );

  const row = r.rows[0];
  const vrow = b.rows[0];

  return {
    kz81: Number(row.kz81_net || 0),
    kz86: Number(row.kz86_net || 0),
    kz41: Number(row.kz41_net || 0),
    kz43: Number(row.kz43_net || 0),
    kz66: Number(vrow.kz66_vat || 0),
  };
}

export function buildUstvaXml(kennzahlen: any, data: UstvaData) {
  const { kz81, kz86, kz41, kz43, kz66 } = kennzahlen;
  const steuer81 = Math.round(kz81 * 0.19 * 100) / 100;
  const steuer86 = Math.round(kz86 * 0.07 * 100) / 100;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Elster xmlns="http://www.elster.de/elsterxml/schema/v11">
  <TransferHeader version="11">
    <Verfahren>ElsterAnmeldung</Verfahren>
    <DatenArt>UStVA</DatenArt>
    <Vorgang>send-Auth</Vorgang>
    <Testmerker>700000004</Testmerker>
    <HerstellerID>74921</HerstellerID>
  </TransferHeader>
  <DatenTeil>
    <Nutzdatenblock>
      <NutzdatenHeader version="11">
        <NutzdatenTicket>1</NutzdatenTicket>
      </NutzdatenHeader>
      <Nutzdaten>
        <UStVA version="2026">
          <Jahr>${data.year}</Jahr>
          <Zeitraum>${String(data.period).padStart(2, '0')}</Zeitraum>
          <Anmeldung>
            <Kz81>${kz81.toFixed(2).replace('.', ',')}</Kz81>
            <Kz81_Steuer>${steuer81.toFixed(2).replace('.', ',')}</Kz81_Steuer>
            <Kz86>${kz86.toFixed(2).replace('.', ',')}</Kz86>
            <Kz86_Steuer>${steuer86.toFixed(2).replace('.', ',')}</Kz86_Steuer>
            <Kz41>${kz41.toFixed(2).replace('.', ',')}</Kz41>
            <Kz43>${kz43.toFixed(2).replace('.', ',')}</Kz43>
            <Kz66>${kz66.toFixed(2).replace('.', ',')}</Kz66>
          </Anmeldung>
        </UStVA>
      </Nutzdaten>
    </Nutzdatenblock>
  </DatenTeil>
</Elster>`;
}
