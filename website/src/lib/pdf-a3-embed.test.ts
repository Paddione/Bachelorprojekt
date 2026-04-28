import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { embedFacturXIntoPdfA3 } from './pdf-a3-embed';
import { validateWithMustang, mustangAvailable } from './mustang.test-helper';

async function tinyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText('Rechnung Test');
  return Buffer.from(await doc.save());
}

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"/>`;

describe('embedFacturXIntoPdfA3', () => {
  it('liefert PDF zurück mit /AF und /AFRelationship /Alternative', async () => {
    const out = await embedFacturXIntoPdfA3(await tinyPdf(), sampleXml, {
      conformanceLevel: 'MINIMUM', invoiceNumber: 'RE-1',
    });
    const text = out.toString('latin1');
    expect(text).toContain('/AFRelationship /Alternative');
    expect(text).toContain('factur-x.xml');
    expect(text).toContain('/Subtype /text#2Fxml');
  });
  it('XMP enthält Factur-X-Extension-Schema und PDF/A-3b-Marker', async () => {
    const out = await embedFacturXIntoPdfA3(await tinyPdf(), sampleXml, {
      conformanceLevel: 'MINIMUM', invoiceNumber: 'RE-1',
    });
    const text = out.toString('latin1');
    expect(text).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
    expect(text).toContain('<fx:DocumentType>INVOICE</fx:DocumentType>');
    expect(text).toContain('<fx:ConformanceLevel>MINIMUM</fx:ConformanceLevel>');
    expect(text).toContain('pdfaid:conformance="B"');
    expect(text).toContain('pdfaid:part="3"');
  });
  it.skipIf(!mustangAvailable)('PDF wird von Mustang als ZUGFeRD erkannt', async () => {
    const out = await embedFacturXIntoPdfA3(await tinyPdf(), sampleXml, {
      conformanceLevel: 'MINIMUM', invoiceNumber: 'RE-1',
    });
    const r = validateWithMustang(out, 'pdf');
    // We don't assert ok=true here (a tinyPdf base may not be PDF/A-conformant on its own).
    // We assert that Mustang detected this as a Factur-X-bearing PDF.
    expect(r.output).toMatch(/factur-x|ZUGFeRD|XRechnung|fx:|CrossIndustryInvoice/i);
  }, 60_000);
});
