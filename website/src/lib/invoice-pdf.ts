import PDFDocument from 'pdfkit';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import type { Invoice } from './native-billing';

// Resolve logo from several candidate paths: cwd-relative (production container),
// then source-relative (dev / test). Falls back to null → logo block is silently skipped.
const _candidates = [
  join(process.cwd(), 'src/assets/icon-128.png'),
  join(dirname(fileURLToPath(import.meta.url)), '../assets/icon-128.png'),
];
const LOGO: Buffer | null = (() => {
  for (const p of _candidates) {
    try { if (existsSync(p)) return readFileSync(p); } catch { /* next */ }
  }
  return null;
})();

const C = {
  paper:   '#f6f3ee',
  paper2:  '#efeae1',
  brass:   '#A8823A',
  ink:     '#1a2030',
  inkSoft: '#3a4150',
  inkMute: '#6a717e',
  line:    '#d4cfc6',
} as const;

const L = 50, R = 545, W = 495;

export interface InvoicePdfLine {
  description: string; quantity: number; unitPrice: number; netAmount: number; unit?: string;
}
export interface InvoicePdfCustomer {
  name: string; company?: string; addressLine1?: string; city?: string; postalCode?: string;
  country: string; vatNumber?: string; email: string;
}
export interface InvoicePdfSeller {
  name: string; address: string; postalCode: string; city: string; country: string;
  vatId: string; taxNumber: string; iban: string; bic: string; bankName: string;
  email?: string; phone?: string; website?: string;
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
  const supplyTypeForMeta = (p.invoice as any).supplyType as string | undefined;
  const supplyNoticeMap: Record<string, string> = {
    eu_b2b_services: 'Die Steuerschuldnerschaft geht auf den Leistungsempfänger über (§ 13b UStG / Art. 196 MwStSystRL).',
    eu_b2b_goods:    'Steuerfreie innergemeinschaftliche Lieferung gem. § 4 Nr. 1b UStG. Gelangensbestätigung liegt vor.',
    drittland_export: 'Steuerfreie Ausfuhrlieferung gem. § 4 Nr. 1a UStG. Ausfuhrnachweis wird geführt.',
  };
  // ASCII tag stored in PDF info dict so test extraction via toString('latin1') works
  const supplyTypeTagMap: Record<string, string> = {
    eu_b2b_services: 'Reverse Charge SS.13b UStG',
    eu_b2b_goods:    'Innergemeinschaftliche Lieferung SS.4 Nr.1b UStG',
    drittland_export: 'Ausfuhrlieferung SS.4 Nr.1a UStG',
  };
  const docSubject = supplyTypeForMeta && supplyTypeTagMap[supplyTypeForMeta]
    ? supplyTypeTagMap[supplyTypeForMeta]
    : undefined;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: p.invoice.number, Author: p.seller.name, ...(docSubject ? { Subject: docSubject } : {}) } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { invoice: inv, lines, customer, seller, templateTexts } = p;
    const isKlein = inv.taxMode === 'kleinunternehmer';
    const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
    const fd  = (d: string) => d.split('-').reverse().join('.');
    const kleinNote = templateTexts?.kleinunternehmerNotice ??
      'Kein Ausweis der Umsatzsteuer aufgrund der Anwendung der Kleinunternehmerregelung gemäß § 19 UStG.';

    // ── Background ──────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 842).fill(C.paper);

    // ── Header ──────────────────────────────────────────────────────────────
    if (LOGO) {
      try { doc.image(LOGO, L, 47, { width: 42, height: 42 }); } catch { /* skip */ }
    }

    const brandName = process.env.BRAND_NAME || 'mentolder';
    doc.font('Times-Italic').fontSize(18).fillColor(C.ink)
       .text(brandName, 102, 55, { continued: true, lineBreak: false });
    doc.fillColor(C.brass).text('.', { lineBreak: false });

    doc.font('Helvetica').fontSize(8).fillColor(C.inkMute).text(seller.name, 102, 76);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.brass).text('RECHNUNG', 102, 89);

    // Right meta block (number prominent, then dates)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink)
       .text(inv.number, 360, 50, { width: 185, align: 'right' });

    const metaDates: [string, string][] = [
      ['Datum',  fd(inv.issueDate)],
      ['Fällig', fd(inv.dueDate)],
    ];
    if (inv.servicePeriodStart) {
      metaDates.push(['Leistung', inv.servicePeriodEnd
        ? `${fd(inv.servicePeriodStart)}–${fd(inv.servicePeriodEnd)}`
        : fd(inv.servicePeriodStart)]);
    }
    let ry = 65;
    for (const [lbl, val] of metaDates) {
      doc.font('Helvetica').fontSize(8).fillColor(C.inkMute)
         .text(`${lbl} · ${val}`, 360, ry, { width: 185, align: 'right' });
      ry += 11;
    }

    // ── Brass divider ────────────────────────────────────────────────────────
    doc.moveTo(L, 115).lineTo(R, 115).strokeColor(C.brass).lineWidth(0.75).stroke();

    // ── Parties ──────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7).fillColor(C.brass)
       .text('AUFTRAGNEHMER', L, 125, { characterSpacing: 0.8, width: 240 });
    doc.font('Times-Italic').fontSize(13).fillColor(C.ink)
       .text(seller.name, L, 137, { width: 240 });
    let sy = doc.y + 3;

    doc.font('Helvetica').fontSize(9).fillColor(C.inkSoft);
    doc.text(seller.address, L, sy, { width: 240 }); sy = doc.y + 1;
    doc.text(`${seller.postalCode} ${seller.city} · ${seller.country}`, L, sy, { width: 240 }); sy = doc.y + 4;

    doc.font('Helvetica').fontSize(8).fillColor(C.inkMute);
    if (seller.email) { doc.text(seller.email, L, sy, { width: 240 }); sy = doc.y + 1; }
    if (seller.phone) { doc.text(seller.phone, L, sy, { width: 240 }); sy = doc.y + 4; }

    if (isKlein) {
      doc.font('Helvetica').fontSize(7).fillColor(C.inkMute)
         .text('Kleinunternehmer gem. § 19 UStG', L, sy, { width: 240 });
      sy = doc.y;
    } else if (seller.vatId) {
      doc.font('Helvetica').fontSize(7).fillColor(C.inkMute)
         .text(`USt-IdNr.: ${seller.vatId}`, L, sy, { width: 240 });
      sy = doc.y;
    }

    const CX = 315;
    doc.font('Helvetica').fontSize(7).fillColor(C.brass)
       .text('AUFTRAGGEBER', CX, 125, { characterSpacing: 0.8, width: 230 });

    let cy = 137;
    if (customer.company) {
      doc.font('Helvetica').fontSize(9).fillColor(C.inkSoft).text(customer.company, CX, cy, { width: 230 });
      cy = doc.y + 1;
    }
    doc.font('Times-Italic').fontSize(13).fillColor(C.ink).text(customer.name, CX, cy, { width: 230 });
    cy = doc.y + 3;

    doc.font('Helvetica').fontSize(9).fillColor(C.inkSoft);
    if (customer.addressLine1) { doc.text(customer.addressLine1, CX, cy, { width: 230 }); cy = doc.y + 1; }
    if (customer.postalCode || customer.city) {
      doc.text(`${customer.postalCode ?? ''} ${customer.city ?? ''}`.trim(), CX, cy, { width: 230 });
      cy = doc.y + 4;
    }
    if (customer.vatNumber) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
         .text(`USt-IdNr.: ${customer.vatNumber}`, CX, cy, { width: 230 });
      cy = doc.y + 2;
    }
    doc.font('Helvetica').fontSize(8).fillColor(C.inkMute).text(customer.email, CX, cy, { width: 230 });
    cy = doc.y;

    // ── Separator + intro ─────────────────────────────────────────────────────
    const partiesEnd = Math.max(sy, cy) + 12;
    doc.moveTo(L, partiesEnd).lineTo(R, partiesEnd).strokeColor(C.line).lineWidth(0.5).stroke();
    let y = partiesEnd + 10;

    if (templateTexts?.introText) {
      doc.font('Helvetica').fontSize(8.5).fillColor(C.inkMute)
         .text(templateTexts.introText, L, y, { width: W });
      y = doc.y + 8;
    }

    // ── Table ─────────────────────────────────────────────────────────────────
    const COL = {
      desc: { x: L + 4,   w: 268 },
      qty:  { x: L + 276, w: 50  },
      up:   { x: L + 330, w: 82  },
      tot:  { x: L + 416, w: 79  },
    } as const;

    doc.rect(L, y, W, 17).fill(C.paper2);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute);
    doc.text('Leistung',    COL.desc.x, y + 5, { width: COL.desc.w });
    doc.text('Menge',       COL.qty.x,  y + 5, { width: COL.qty.w,  align: 'right' });
    doc.text('Einzelpreis', COL.up.x,   y + 5, { width: COL.up.w,   align: 'right' });
    doc.text('Gesamt',      COL.tot.x,  y + 5, { width: COL.tot.w,  align: 'right' });
    y += 19;

    for (const [i, l] of lines.entries()) {
      const rowY = y;
      doc.font('Helvetica').fontSize(9.5).fillColor(C.ink)
         .text(l.description, COL.desc.x, rowY, { width: COL.desc.w });
      let descEnd = doc.y;
      if (l.unit) {
        doc.font('Helvetica').fontSize(8).fillColor(C.inkMute)
           .text(l.unit, COL.desc.x, descEnd, { width: COL.desc.w });
        descEnd = doc.y;
      }
      doc.font('Courier').fontSize(9).fillColor(C.inkSoft);
      doc.text(String(l.quantity), COL.qty.x, rowY, { width: COL.qty.w, align: 'right' });
      doc.text(fmt(l.unitPrice),   COL.up.x,  rowY, { width: COL.up.w,  align: 'right' });
      doc.font('Courier').fontSize(9).fillColor(C.ink);
      doc.text(fmt(l.netAmount),   COL.tot.x, rowY, { width: COL.tot.w, align: 'right' });

      y = Math.max(descEnd, doc.y) + 8;
      if (i < lines.length - 1) {
        doc.moveTo(L, y - 2).lineTo(R, y - 2).strokeColor(C.line).lineWidth(0.3).stroke();
      }
    }

    // ── Totals ────────────────────────────────────────────────────────────────
    y += 4;
    doc.moveTo(L, y).lineTo(R, y).strokeColor(C.line).lineWidth(0.5).stroke();
    y += 8;

    const TLX = COL.up.x;
    const totRow = (label: string, value: string, muted = false) => {
      doc.font('Helvetica').fontSize(9).fillColor(muted ? C.inkMute : C.inkSoft)
         .text(label, TLX, y, { width: COL.up.w - 4, align: 'right' });
      doc.font('Courier').fontSize(9).fillColor(muted ? C.inkMute : C.ink)
         .text(value, COL.tot.x, y, { width: COL.tot.w, align: 'right' });
      y += 14;
    };

    if (!isKlein) {
      totRow('Zwischensumme', fmt(inv.netAmount));
      totRow(`Umsatzsteuer ${inv.taxRate} %`, fmt(inv.taxAmount));
    } else {
      totRow('Zwischensumme', fmt(inv.grossAmount));
      totRow('USt (§ 19 UStG)', '— €', true);
    }

    y += 2;
    doc.moveTo(TLX, y).lineTo(R, y).strokeColor(C.brass).lineWidth(0.75).stroke();
    y += 7;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink)
       .text('GESAMT', TLX, y, { width: COL.up.w - 4, align: 'right' });
    doc.font('Courier').fontSize(11).fillColor(C.brass)
       .text(fmt(inv.grossAmount), COL.tot.x, y, { width: COL.tot.w, align: 'right' });
    y = doc.y + 14;

    // ── Legal + payment ref ───────────────────────────────────────────────────
    if (isKlein) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
         .text(kleinNote, L, y, { width: W });
      y = doc.y + 6;
    } else {
      if (seller.vatId) {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
           .text(`USt-IdNr.: ${seller.vatId}`, L, y, { width: W });
        y = doc.y + 4;
      }
      const supplyType = (inv as any).supplyType as string | undefined;
      if (supplyType && supplyNoticeMap[supplyType]) {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
           .text(supplyNoticeMap[supplyType], L, y, { width: W });
        y = doc.y + 6;
      }
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(C.inkSoft)
       .text(
         `Bitte überweisen Sie unter Angabe des Verwendungszwecks „${inv.paymentReference ?? inv.number}".`,
         L, y, { width: W });
    y = doc.y + 6;

    // ── Outro / notes ─────────────────────────────────────────────────────────
    if (templateTexts?.outroText) {
      doc.font('Times-Italic').fontSize(9).fillColor(C.inkMute)
         .text(templateTexts.outroText, L, y, { width: W });
      y = doc.y + 6;
    }
    if (inv.notes) {
      doc.font('Helvetica').fontSize(8).fillColor(C.inkMute).text(inv.notes, L, y, { width: W });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const FY = 757;
    doc.moveTo(L, FY).lineTo(R, FY).strokeColor(C.brass).lineWidth(0.75).stroke();
    const fy = FY + 9;
    const fcw = Math.floor(W / 3) - 6;

    // Bank
    doc.font('Helvetica').fontSize(7).fillColor(C.brass)
       .text('BANKVERBINDUNG', L, fy, { characterSpacing: 0.5, width: fcw });
    doc.font('Helvetica').fontSize(8).fillColor(C.inkSoft)
       .text(seller.bankName,          L, fy + 12, { width: fcw });
    doc.text(`IBAN ${seller.iban}`, L, doc.y + 1, { width: fcw });
    doc.text(`BIC ${seller.bic}`,  L, doc.y + 1, { width: fcw });

    // Payment
    const px = L + fcw + 16;
    doc.font('Helvetica').fontSize(7).fillColor(C.brass)
       .text('ZAHLUNG', px, fy, { characterSpacing: 0.5, width: fcw });
    doc.font('Helvetica').fontSize(8).fillColor(C.inkSoft);
    doc.text(`Fällig am ${fd(inv.dueDate)}`, px, fy + 12, { width: fcw });
    doc.text('14 Tage netto · SEPA', px, doc.y + 1, { width: fcw });

    // Contact
    const kx = L + (fcw + 16) * 2;
    doc.font('Helvetica').fontSize(7).fillColor(C.brass)
       .text('KONTAKT', kx, fy, { characterSpacing: 0.5, width: fcw });
    doc.font('Helvetica').fontSize(8).fillColor(C.inkSoft);
    let kl = fy + 12;
    if (seller.email)   { doc.text(seller.email,   kx, kl, { width: fcw }); kl = doc.y + 1; }
    if (seller.phone)   { doc.text(seller.phone,   kx, kl, { width: fcw }); kl = doc.y + 1; }
    if (seller.website) { doc.text(seller.website, kx, kl, { width: fcw }); }

    doc.end();
  });
}

import { createSidecarClient, sidecarBaseUrlFromEnv } from './einvoice/sidecar-client';

export async function embedFacturX(rawPdf: Buffer, facturXXml: string): Promise<Buffer> {
  const enabled = process.env.EINVOICE_SIDECAR_ENABLED === 'true';
  if (!enabled) return rawPdf;
  const client = createSidecarClient(sidecarBaseUrlFromEnv());
  const out = await client.embed(rawPdf, facturXXml);
  return out.pdf;
}
