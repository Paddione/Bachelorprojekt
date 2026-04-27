import PDFDocument from 'pdfkit';
import type { Invoice } from './native-billing';

export interface InvoicePdfLine {
  description: string; quantity: number; unitPrice: number; netAmount: number; unit?: string;
}
export interface InvoicePdfCustomer {
  name: string; company?: string; addressLine1?: string; city?: string; postalCode?: string; country: string; vatNumber?: string; email: string;
}
export interface InvoicePdfSeller {
  name: string; address: string; postalCode: string; city: string; country: string;
  vatId: string; taxNumber: string; iban: string; bic: string; bankName: string;
}
export interface InvoicePdfTemplateTexts {
  introText?: string;
  kleinunternehmerNotice?: string;
  outroText?: string;
}

export async function generateInvoicePdf(p: {
  invoice: Invoice; lines: InvoicePdfLine[];
  customer: InvoicePdfCustomer; seller: InvoicePdfSeller;
  templateTexts?: InvoicePdfTemplateTexts;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60, info: { Title: p.invoice.number } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { invoice: inv, lines, customer, seller, templateTexts } = p;
    const isKlein = inv.taxMode === 'kleinunternehmer';
    const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
    const fmtDate = (d: string) => d.split('-').reverse().join('.');
    const introText = templateTexts?.introText ?? 'für folgende Leistungen stelle ich Ihnen in Rechnung:';
    const kleinNote = templateTexts?.kleinunternehmerNotice ??
      'Kein Ausweis der Umsatzsteuer aufgrund der Anwendung der Kleinunternehmerregelung gemäß § 19 UStG.';
    const outroText = templateTexts?.outroText ?? '';

    // Sender line (small, top)
    doc.fontSize(7).fillColor('#666')
       .text(`${seller.name} · ${seller.address} · ${seller.postalCode} ${seller.city}`, 60, 100, { width: 300 });

    // Recipient
    doc.fontSize(10).fillColor('#000').moveDown(0.5);
    if (customer.company) doc.text(customer.company);
    doc.text(customer.name);
    if (customer.addressLine1) doc.text(customer.addressLine1);
    if (customer.postalCode && customer.city) doc.text(`${customer.postalCode} ${customer.city}`);
    if (customer.vatNumber) doc.text(`USt-IdNr.: ${customer.vatNumber}`);

    // Invoice header
    doc.fontSize(14).fillColor('#000').text('RECHNUNG', 60, 240, { align: 'right', width: 475 });
    doc.fontSize(9).fillColor('#444')
       .text(`Rechnungsnummer: ${inv.number}`, { align: 'right', width: 475 })
       .text(`Datum: ${fmtDate(inv.issueDate)}`, { align: 'right', width: 475 })
       .text(`Zahlungsziel: ${fmtDate(inv.dueDate)}`, { align: 'right', width: 475 });
    if (inv.servicePeriodStart && inv.servicePeriodEnd) {
      doc.text(`Leistungszeitraum: ${fmtDate(inv.servicePeriodStart)} – ${fmtDate(inv.servicePeriodEnd)}`,
        { align: 'right', width: 475 });
    }

    // Intro text
    doc.moveDown(1.5).fontSize(9).fillColor('#333').text(introText, 60, undefined, { width: 475 });

    // Table header
    doc.moveDown(1).fontSize(8).fillColor('#555');
    const yHead = doc.y;
    doc.text('Beschreibung', 60, yHead, { width: 260 });
    doc.text('Menge', 320, yHead, { width: 60, align: 'right' });
    doc.text('Einzel', 390, yHead, { width: 70, align: 'right' });
    doc.text('Gesamt', 460, yHead, { width: 75, align: 'right' });
    doc.moveTo(60, doc.y + 4).lineTo(535, doc.y + 4).strokeColor('#ccc').stroke();

    // Line items
    doc.moveDown(0.5).fontSize(9).fillColor('#000');
    for (const l of lines) {
      const y = doc.y;
      doc.text(l.description, 60, y, { width: 260 });
      doc.text(String(l.quantity), 320, y, { width: 60, align: 'right' });
      doc.text(fmt(l.unitPrice), 390, y, { width: 70, align: 'right' });
      doc.text(fmt(l.netAmount), 460, y, { width: 75, align: 'right' });
      doc.moveDown(0.3);
    }

    // Totals
    doc.moveTo(60, doc.y + 4).lineTo(535, doc.y + 4).strokeColor('#ccc').stroke().moveDown(0.5);
    doc.fontSize(9);
    if (!isKlein) {
      doc.text('Nettobetrag', 390, doc.y, { width: 145, align: 'right' }).moveUp();
      doc.text(fmt(inv.netAmount), 460, doc.y, { width: 75, align: 'right' }).moveDown(0.3);
      doc.text(`Umsatzsteuer ${inv.taxRate} %`, 390, doc.y, { width: 145, align: 'right' }).moveUp();
      doc.text(fmt(inv.taxAmount), 460, doc.y, { width: 75, align: 'right' }).moveDown(0.3);
    }
    doc.fontSize(10).fillColor('#000');
    doc.text('Rechnungsbetrag', 390, doc.y, { width: 145, align: 'right' }).moveUp();
    doc.text(fmt(inv.grossAmount), 460, doc.y, { width: 75, align: 'right' }).moveDown(2);

    // Payment details
    doc.fontSize(8).fillColor('#333');
    doc.text(`Bitte überweisen Sie den Betrag unter Angabe des Verwendungszwecks "${inv.paymentReference}" auf:`);
    doc.text(`${seller.bankName} · IBAN: ${seller.iban} · BIC: ${seller.bic}`).moveDown(0.5);

    // §19 notice or VAT ID
    if (isKlein) {
      doc.fontSize(7).fillColor('#555').text(kleinNote);
    } else {
      if (seller.vatId) doc.fontSize(7).fillColor('#555').text(`USt-IdNr.: ${seller.vatId}`);
    }
    if (seller.taxNumber && !seller.vatId) {
      doc.fontSize(7).fillColor('#555').text(`Steuernummer: ${seller.taxNumber}`);
    }

    // Outro text
    if (outroText) doc.moveDown(0.5).fontSize(9).fillColor('#333').text(outroText);

    if (inv.notes) doc.moveDown(0.5).fontSize(8).text(inv.notes);

    // Footer
    doc.fontSize(7).fillColor('#888')
       .text(`${seller.name} · ${seller.address}, ${seller.postalCode} ${seller.city}`,
         60, 760, { align: 'center', width: 475 });

    doc.end();
  });
}
