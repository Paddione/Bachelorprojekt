export interface SepaCreditor {
  name: string;
  iban: string;
  bic: string;
  creditorId: string;
}

export interface SepaDebitEntry {
  endToEndId: string;
  amount: number;
  mandateId: string;
  mandateDate: string;
  debtorName: string;
  debtorIban: string;
  debtorBic: string;
  invoiceNumber: string;
}

function esc(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export function buildPain008(
  creditor: SepaCreditor,
  collectionDate: string,
  entries: SepaDebitEntry[],
): string {
  if (entries.length === 0) throw new Error('buildPain008 requires at least one entry');

  const msgId = `MSG-${Date.now()}`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const ctrlSum = fmt(Math.round(total * 100) / 100);

  const txBlocks = entries.map(e => `
    <DrctDbtTxInf>
      <PmtId><EndToEndId>${esc(e.endToEndId)}</EndToEndId></PmtId>
      <InstdAmt Ccy="EUR">${fmt(e.amount)}</InstdAmt>
      <DrctDbtTx>
        <MndtRltdInf>
          <MndtId>${esc(e.mandateId)}</MndtId>
          <DtOfSgntr>${esc(e.mandateDate)}</DtOfSgntr>
        </MndtRltdInf>
        <CdtrSchmeId>
          <Id><PrvtId><Othr>
            <Id>${esc(creditor.creditorId)}</Id>
            <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
          </Othr></PrvtId></Id>
        </CdtrSchmeId>
      </DrctDbtTx>
      <DbtrAgt><FinInstnId><BIC>${esc(e.debtorBic)}</BIC></FinInstnId></DbtrAgt>
      <Dbtr><Nm>${esc(e.debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(e.debtorIban)}</IBAN></Id></DbtrAcct>
      <RmtInf><Ustrd>${esc(e.invoiceNumber)}</Ustrd></RmtInf>
    </DrctDbtTxInf>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02 pain.008.001.02.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${entries.length}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty><Nm>${esc(creditor.name)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-PMT</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${entries.length}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${esc(collectionDate)}</ReqdColltnDt>
      <Cdtr><Nm>${esc(creditor.name)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${esc(creditor.iban)}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>${esc(creditor.bic)}</BIC></FinInstnId></CdtrAgt>${txBlocks}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
}

export interface MandateValidationResult {
  valid: SepaDebitEntry[];
  skipped: Array<{ invoiceNumber: string; reason: string }>;
}

export function validateMandates(
  rows: Array<{
    invoiceNumber: string;
    amount: number;
    paymentReference: string | undefined;
    customerName: string;
    sepaIban: string | undefined;
    sepaBic: string | undefined;
    sepaMandateRef: string | undefined;
    sepaMandateDate: string | undefined;
  }>
): MandateValidationResult {
  const valid: SepaDebitEntry[] = [];
  const skipped: Array<{ invoiceNumber: string; reason: string }> = [];

  for (const row of rows) {
    if (!row.sepaIban)        { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing IBAN' }); continue; }
    if (!row.sepaBic)         { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing BIC' }); continue; }
    if (!row.sepaMandateRef)  { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing mandate reference' }); continue; }
    if (!row.sepaMandateDate) { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing mandate date' }); continue; }
    valid.push({
      endToEndId:    row.paymentReference ?? row.invoiceNumber,
      amount:        row.amount,
      mandateId:     row.sepaMandateRef,
      mandateDate:   row.sepaMandateDate,
      debtorName:    row.customerName,
      debtorIban:    row.sepaIban,
      debtorBic:     row.sepaBic,
      invoiceNumber: row.invoiceNumber,
    });
  }
  return { valid, skipped };
}
