// HTML invoice / dunning template — Mentolder paper kit.
//
// Pure string templating, no framework. Output is a complete, self-contained
// HTML document ready to be:
//   • previewed in a browser via /admin/inhalte/rechnungsvorlagen/preview
//   • rendered to PDF by the print-sidecar (headless Chromium)
//
// Mirrors environments/Mentolder Design System/ui_kits/print/invoice.html
// (paper.css + print.css). Tokens kept inline so the output never depends on
// external CSS files when the sidecar fetches it.

import type { Invoice } from './native-billing';
import type { InvoicePdfLine, InvoicePdfCustomer, InvoicePdfSeller, InvoicePdfTemplateTexts, Dunning } from './invoice-pdf';

const fmtMoney = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
const fmtDate  = (iso: string) => iso.split('-').reverse().join('.');

const SUPPLY_NOTICES: Record<string, string> = {
  eu_b2b_services:  'Die Steuerschuldnerschaft geht auf den Leistungsempfänger über (§ 13b UStG / Art. 196 MwStSystRL).',
  eu_b2b_goods:     'Steuerfreie innergemeinschaftliche Lieferung gem. § 4 Nr. 1b UStG. Gelangensbestätigung liegt vor.',
  drittland_export: 'Steuerfreie Ausfuhrlieferung gem. § 4 Nr. 1a UStG. Ausfuhrnachweis wird geführt.',
};

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Inline CSS — extracted from ui_kits/print/{paper.css,print.css} ──────────
function baseCss(): string {
  return `
@import url("https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap");

:root {
  --paper:     #f6f3ee;
  --paper-2:   #efeae1;
  --paper-ink: #1a2030;
  --paper-ink-soft: #3a4150;
  --paper-mute: #6a717e;
  --paper-line: #d4cfc6;
  --brass:     #A8823A;
  --serif: "Newsreader", Georgia, serif;
  --sans:  "Geist", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --mono:  "Geist Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}

@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--sans);
  background: #dad4c8;
  color: var(--paper-ink);
  font-size: 14px; line-height: 1.55;
  letter-spacing: -0.005em;
  padding: 40px 0;
}
@media print {
  html, body { background: #fff; padding: 0; }
  .page { margin: 0; box-shadow: none; }
}

.page {
  width: 794px; min-height: 1123px; /* A4 @ 96dpi */
  margin: 0 auto;
  background: var(--paper);
  padding: 64px 72px;
  position: relative;
  box-shadow: 0 24px 60px -20px rgba(0,0,0,.35);
}
.page::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px;
  background: linear-gradient(to right, transparent, var(--brass) 30%, var(--brass) 70%, transparent);
  opacity: .7;
}

.brand-row { display: flex; align-items: center; gap: 14px; }
.brand-row img { width: 36px; height: 36px; display: block; }
.brand-row .name { font-family: var(--serif); font-size: 24px; letter-spacing: -0.01em; }
.brand-row .dot { color: var(--brass); }

.eyebrow {
  font-family: var(--mono); font-size: 10px; letter-spacing: .18em;
  text-transform: uppercase; color: var(--brass);
  display: inline-flex; align-items: center; gap: 10px;
}
.eyebrow::before { content: ""; width: 22px; height: 1px; background: currentColor; opacity: .8; }

h2.print {
  font-family: var(--serif); font-weight: 400; font-size: 24px;
  line-height: 1.2; letter-spacing: -0.01em; margin: 0;
}
.kicker {
  font-family: var(--mono); font-size: 10px; letter-spacing: .16em;
  text-transform: uppercase; color: var(--paper-mute);
}
.muted { color: var(--paper-mute); }
.small { font-size: 12px; }
.rule  { height: 1px; background: var(--paper-line); border: 0; }

table.t { width: 100%; border-collapse: collapse; }
table.t th, table.t td { text-align: left; padding: 14px 12px; font-size: 14px; }
table.t th {
  font-family: var(--mono); font-size: 10px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--paper-mute); font-weight: 500;
  border-bottom: 1px solid var(--paper-line);
}
table.t td { border-bottom: 1px solid var(--paper-line); vertical-align: top; }
table.t .num { text-align: right; font-variant-numeric: tabular-nums; }

.totals { display: flex; justify-content: flex-end; margin-top: 14px; }
.totals dl {
  display: grid; grid-template-columns: auto auto;
  gap: 4px 32px; font-size: 14px; min-width: 280px;
}
.totals dt { color: var(--paper-mute); }
.totals dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.totals .grand {
  font-family: var(--serif); font-size: 24px; letter-spacing: -0.01em;
  padding-top: 10px; border-top: 1px solid var(--paper-line); margin-top: 6px;
}
.totals .grand-l {
  padding-top: 10px; border-top: 1px solid var(--paper-line);
  margin-top: 6px; font-weight: 600;
}

.foot {
  margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--paper-line);
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
  font-size: 11px; color: var(--paper-mute);
}
.foot h5 {
  font-family: var(--mono); font-size: 10px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--brass); margin: 0 0 6px; font-weight: 500;
}
.foot p { margin: 2px 0; }

.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-bottom: 40px; }
.parties strong { font-weight: 600; }
.notice { background: var(--paper-2); border: 1px solid var(--paper-line); border-radius: 10px; padding: 12px 14px; font-size: 12px; color: var(--paper-ink-soft); }
.notice + .notice { margin-top: 8px; }
`;
}

// ── Brand mark ──────────────────────────────────────────────────────────────
// Embedded as data URL so the sidecar doesn't need filesystem access to the
// website source tree. Caller may override via opts.logoDataUrl.
const DEFAULT_LOGO_DATA_URL = ''; // populated lazily; falls back to text-only mark

interface RenderOptions {
  brandName?: string;        // "mentolder"
  logoDataUrl?: string | null;
  /** Inject extra <style> after the base CSS (preview-only tweaks etc.). */
  extraCss?: string;
}

function pageShell(title: string, body: string, opts: RenderOptions): string {
  const css = baseCss() + (opts.extraCss ?? '');
  return `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>${css}</style>
</head><body><div class="page">${body}</div></body></html>`;
}

function brandHeader(opts: RenderOptions, eyebrow: string, headlineRight: string, kickerRight: string): string {
  const brand = esc(opts.brandName ?? process.env.BRAND_NAME ?? 'mentolder');
  const logo  = opts.logoDataUrl ?? DEFAULT_LOGO_DATA_URL;
  const logoEl = logo ? `<img src="${esc(logo)}" alt="" />` : '';
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div class="brand-row">${logoEl}<span class="name">${brand}<span class="dot">.</span></span></div>
    <div style="text-align:right;">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h2 class="print" style="margin-top:8px;">${esc(headlineRight)}</h2>
      <div class="kicker" style="margin-top:6px;">${esc(kickerRight)}</div>
    </div>
  </div>
  <hr class="rule" style="margin:36px 0 32px;" />`;
}

function partiesBlock(seller: InvoicePdfSeller, customer: InvoicePdfCustomer, period?: string, periodLabel?: string): string {
  const customerLines: string[] = [];
  if (customer.company) customerLines.push(`<strong>${esc(customer.company)}</strong>`);
  if (customer.name)    customerLines.push(esc(customer.company ? `z. Hd. ${customer.name}` : customer.name));
  if (customer.addressLine1) customerLines.push(esc(customer.addressLine1));
  if (customer.postalCode || customer.city) customerLines.push(esc(`${customer.postalCode ?? ''} ${customer.city ?? ''}`.trim()));
  if (customer.vatNumber)    customerLines.push(`<span class="muted small">USt-IdNr. ${esc(customer.vatNumber)}</span>`);

  const right = period
    ? `<div class="kicker">${esc(periodLabel ?? 'Leistungszeitraum')}</div>
       <div style="margin-top:10px;font-size:14px;line-height:1.55;">${esc(period)}</div>`
    : `<div class="kicker">Absender</div>
       <div style="margin-top:10px;font-size:13px;line-height:1.55;" class="muted">
         <strong style="color:var(--paper-ink);">${esc(seller.name)}</strong><br/>
         ${esc(seller.address)}<br/>
         ${esc(`${seller.postalCode} ${seller.city}`)}
       </div>`;

  return `
  <div class="parties">
    <div>
      <div class="kicker">Rechnung an</div>
      <div style="margin-top:10px;font-size:14px;line-height:1.55;">
        ${customerLines.join('<br/>')}
      </div>
    </div>
    <div>${right}</div>
  </div>`;
}

function footerBlock(seller: InvoicePdfSeller, isKlein: boolean): string {
  const taxLine = isKlein
    ? 'Kleinunternehmer §19 UStG'
    : seller.vatId ? `USt-IdNr. ${esc(seller.vatId)}` : '';
  return `
  <div class="foot">
    <div>
      <h5>${esc(process.env.BRAND_NAME ?? 'Mentolder')}</h5>
      <p>${esc(seller.name)}</p>
      <p>${esc(seller.address)}</p>
      <p>${esc(`${seller.postalCode} ${seller.city}`)}</p>
    </div>
    <div>
      <h5>Kontakt</h5>
      ${seller.email   ? `<p>${esc(seller.email)}</p>` : ''}
      ${seller.phone   ? `<p>${esc(seller.phone)}</p>` : ''}
      ${seller.website ? `<p>${esc(seller.website)}</p>` : ''}
    </div>
    <div>
      <h5>Steuerlich</h5>
      ${taxLine ? `<p>${taxLine}</p>` : ''}
      ${seller.taxNumber ? `<p>Steuernr. ${esc(seller.taxNumber)}</p>` : ''}
      <p>${esc(`${seller.city} · ${seller.country}`)}</p>
    </div>
  </div>`;
}

// ── Public renderers ────────────────────────────────────────────────────────

export interface InvoiceHtmlInput {
  invoice: Invoice;
  lines: InvoicePdfLine[];
  customer: InvoicePdfCustomer;
  seller: InvoicePdfSeller;
  templateTexts?: InvoicePdfTemplateTexts;
}

export function renderInvoiceHtml(input: InvoiceHtmlInput, opts: RenderOptions = {}): string {
  const { invoice: inv, lines, customer, seller, templateTexts } = input;
  const isKlein = inv.taxMode === 'kleinunternehmer';
  const supplyType = (inv as unknown as { supplyType?: string }).supplyType;
  const supplyNotice = supplyType ? SUPPLY_NOTICES[supplyType] : undefined;

  const docTitle = templateTexts?.title ?? (inv.kind === 'gutschrift' ? 'Gutschrift' : 'Rechnung');
  const period   = inv.servicePeriodStart
    ? (inv.servicePeriodEnd
        ? `${fmtDate(inv.servicePeriodStart)} – ${fmtDate(inv.servicePeriodEnd)}`
        : fmtDate(inv.servicePeriodStart))
    : undefined;

  const header = brandHeader(opts, docTitle,
    `Nr. ${inv.number}`,
    `Rechnungsdatum ${fmtDate(inv.issueDate)} · Fällig ${fmtDate(inv.dueDate)}`);

  const parties = partiesBlock(seller, customer, period);

  const intro = templateTexts?.introText
    ? `<p class="muted" style="margin:0 0 24px;">${esc(templateTexts.introText)}</p>`
    : '';

  const rows = lines.map(l => `
    <tr>
      <td>
        <strong>${esc(l.description)}</strong>
        ${l.unit ? `<br/><span class="muted small">${esc(l.unit)}</span>` : ''}
      </td>
      <td class="num">${esc(l.quantity)}</td>
      <td class="num">${esc(fmtMoney(l.unitPrice))}</td>
      <td class="num">${esc(fmtMoney(l.netAmount))}</td>
    </tr>`).join('');

  const totals = isKlein
    ? `
    <dt>Zwischensumme</dt><dd>${esc(fmtMoney(inv.grossAmount))}</dd>
    <dt>USt — Kleinunternehmer §19</dt><dd>0,00 €</dd>
    <dt class="grand-l">Gesamtbetrag</dt><dd class="grand">${esc(fmtMoney(inv.grossAmount))}</dd>`
    : `
    <dt>Zwischensumme</dt><dd>${esc(fmtMoney(inv.netAmount))}</dd>
    <dt>USt ${esc(inv.taxRate)} %</dt><dd>${esc(fmtMoney(inv.taxAmount))}</dd>
    <dt class="grand-l">Gesamtbetrag</dt><dd class="grand">${esc(fmtMoney(inv.grossAmount))}</dd>`;

  const kleinNote = templateTexts?.kleinunternehmerNotice
    ?? 'Kein Ausweis der Umsatzsteuer aufgrund der Anwendung der Kleinunternehmerregelung gemäß § 19 UStG.';

  const notices = [
    isKlein ? `<div class="notice">${esc(kleinNote)}</div>` : '',
    supplyNotice ? `<div class="notice">${esc(supplyNotice)}</div>` : '',
  ].filter(Boolean).join('');

  const payRef = inv.paymentReference ?? inv.number;
  const payHint = `<p class="muted small" style="margin-top:14px;">Bitte überweisen Sie unter Angabe des Verwendungszwecks „${esc(payRef)}".</p>`;

  const outro = templateTexts?.outroText
    ? `<p class="muted" style="margin-top:14px;">${esc(templateTexts.outroText)}</p>`
    : '';

  const bank = `
    <div>
      <div class="kicker">Bankverbindung</div>
      <div style="margin-top:8px;font-size:13px;line-height:1.55;">
        <strong>${esc(seller.name)}</strong><br/>
        ${esc(seller.bankName)}<br/>
        IBAN ${esc(seller.iban)}<br/>
        BIC ${esc(seller.bic)}
      </div>
    </div>`;

  const body = `
    ${header}
    ${parties}
    ${intro}
    <table class="t">
      <thead><tr>
        <th style="width:54%;">Leistung</th>
        <th class="num" style="width:10%;">Menge</th>
        <th class="num" style="width:18%;">Einzelpreis</th>
        <th class="num" style="width:18%;">Gesamt</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals"><dl>${totals}</dl></div>
    <hr class="rule" style="margin:36px 0 24px;" />
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:32px;">
      <div>
        ${notices}
        ${payHint}
        ${outro}
      </div>
      ${bank}
    </div>
    ${footerBlock(seller, isKlein)}
  `;

  return pageShell(`${docTitle} ${inv.number}`, body, opts);
}

// ── Dunning ─────────────────────────────────────────────────────────────────

export interface DunningHtmlInput {
  dunning: Dunning;
  invoice: Invoice;
  customer: InvoicePdfCustomer;
  seller: InvoicePdfSeller;
}

export function renderDunningHtml(input: DunningHtmlInput, opts: RenderOptions = {}): string {
  const { dunning: d, invoice: inv, customer, seller } = input;
  const title = d.level === 1 ? 'Zahlungserinnerung' : 'Mahnung';
  const total = d.outstandingAtGeneration + d.feeAmount + d.interestAmount;

  const intro = d.level === 1
    ? `Sicher haben Sie nur übersehen, dass die Rechnung Nr. ${esc(inv.number)} vom ${esc(fmtDate(inv.issueDate))} am ${esc(fmtDate(inv.dueDate))} zur Zahlung fällig war.`
    : `Leider konnten wir bis heute keinen Zahlungseingang für die Rechnung Nr. ${esc(inv.number)} vom ${esc(fmtDate(inv.issueDate))} feststellen.`;

  const header = brandHeader(opts, title,
    `Nr. ${inv.number}`,
    `Datum ${fmtDate(d.generatedAt.slice(0, 10))}`);

  const parties = partiesBlock(seller, customer);

  const rows: [string, number][] = [
    [`Offener Betrag aus Rechnung ${inv.number}`, d.outstandingAtGeneration],
  ];
  if (d.feeAmount > 0)      rows.push(['Mahngebühren', d.feeAmount]);
  if (d.interestAmount > 0) rows.push(['Verzugszinsen', d.interestAmount]);

  const body = `
    ${header}
    ${parties}
    <p style="margin:0 0 14px;">${intro}</p>
    <p class="muted">Wir bitten Sie höflich, den offenen Betrag bis spätestens 7 Tage nach Erhalt dieses Schreibens zu begleichen.</p>

    <table class="t" style="margin-top:24px;">
      <thead><tr><th style="width:70%;">Posten</th><th class="num" style="width:30%;">Betrag</th></tr></thead>
      <tbody>
        ${rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="num">${esc(fmtMoney(v))}</td></tr>`).join('')}
      </tbody>
    </table>

    <div class="totals"><dl>
      <dt class="grand-l">Gesamtbetrag</dt><dd class="grand">${esc(fmtMoney(total))}</dd>
    </dl></div>

    <hr class="rule" style="margin:36px 0 24px;" />
    <p>Bitte überweisen Sie den Gesamtbetrag auf das unten angegebene Konto unter Angabe des Verwendungszwecks „${esc(inv.paymentReference ?? inv.number)}".</p>
    <p class="muted small">Sollten Sie die Zahlung in der Zwischenzeit bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.</p>

    <div style="margin-top:32px;">
      <div class="kicker">Bankverbindung</div>
      <div style="margin-top:8px;font-size:13px;line-height:1.55;">
        <strong>${esc(seller.name)}</strong><br/>
        ${esc(seller.bankName)}<br/>
        IBAN ${esc(seller.iban)}<br/>
        BIC ${esc(seller.bic)}
      </div>
    </div>

    ${footerBlock(seller, inv.taxMode === 'kleinunternehmer')}
  `;

  return pageShell(`${title} ${inv.number}`, body, opts);
}

// ── Sample data for preview ─────────────────────────────────────────────────

export function sampleInvoiceForPreview(templateTexts?: InvoicePdfTemplateTexts): InvoiceHtmlInput {
  const today = new Date().toISOString().slice(0, 10);
  const due   = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  return {
    invoice: {
      id: 'preview', brand: 'preview', number: '2026-0042', status: 'open',
      customerId: 'c', issueDate: today, dueDate: due,
      taxMode: 'kleinunternehmer', netAmount: 950, taxRate: 0,
      taxAmount: 0, grossAmount: 950, paymentReference: '2026-0042',
      locked: false, currency: 'EUR', currencyRate: null,
      netAmountEur: 950, grossAmountEur: 950, kind: 'regular',
      servicePeriodStart: today, servicePeriodEnd: due,
    } as Invoice,
    lines: [
      { description: 'Coaching-Session 90 Min.', unit: 'Profil-Schärfung & strategische Positionierung', quantity: 1, unitPrice: 150, netAmount: 150 },
      { description: 'Coaching-Session 90 Min.', unit: 'Vorbereitung Headhunter-Gespräch',                quantity: 1, unitPrice: 150, netAmount: 150 },
      { description: 'Coaching-Session 90 Min.', unit: 'Karriere-Strategie & Timing',                     quantity: 1, unitPrice: 150, netAmount: 150 },
      { description: 'Intensiv-Tag (6 Std.)',    unit: 'Gesprächsvorbereitung & Abschluss',              quantity: 1, unitPrice: 500, netAmount: 500 },
    ],
    customer: {
      name: 'Andrea Müller', company: 'Müller Beratung GmbH',
      addressLine1: 'Bardowicker Straße 14', postalCode: '21335', city: 'Lüneburg',
      country: 'DE', email: 'andrea@mueller-beratung.de',
    },
    seller: {
      name: 'Gerald Korczewski', address: 'Bardowicker Straße 14',
      postalCode: '21335', city: 'Lüneburg', country: 'DE',
      vatId: '', taxNumber: '33/023/05100',
      iban: 'DE12 2405 0110 0001 2345 67', bic: 'NOLADE21LBG', bankName: 'Sparkasse Lüneburg',
      email: 'info@mentolder.de', phone: '+49 151 508 32 601', website: 'mentolder.de',
    },
    templateTexts,
  };
}
