import { PDFDocument, PDFName, PDFDict, PDFHexString, PDFString, PDFNumber } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export type FacturXLevel = 'MINIMUM' | 'BASIC WL' | 'BASIC' | 'EN 16931' | 'EXTENDED' | 'XRECHNUNG';

export interface EmbedOptions {
  conformanceLevel: FacturXLevel;
  invoiceNumber: string;
  modificationDate?: Date;
  attachmentName?: string; // default: factur-x.xml; XRECHNUNG profile uses xrechnung.xml
}

const ICC_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sRGB.icc');

function pdfDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
         `${sign}${p(Math.floor(abs / 60))}'${p(abs % 60)}'`;
}

function buildXmp(opts: EmbedOptions, modDate: Date): string {
  const iso = modDate.toISOString();
  const fileName = opts.attachmentName ?? 'factur-x.xml';
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
                                  xmlns:dc="http://purl.org/dc/elements/1.1/"
                                  xmlns:xmp="http://ns.adobe.com/xap/1.0/"
                                  xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
                                  xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"
                                  xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
                                  xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
                                  xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"
                                  pdfaid:part="3" pdfaid:conformance="B">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Rechnung ${escapeXml(opts.invoiceNumber)}</rdf:li></rdf:Alt></dc:title>
      <xmp:CreatorTool>mentolder-billing</xmp:CreatorTool>
      <xmp:CreateDate>${iso}</xmp:CreateDate>
      <xmp:ModifyDate>${iso}</xmp:ModifyDate>
      <pdf:Producer>pdf-lib + mentolder-billing</pdf:Producer>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${escapeXml(fileName)}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${opts.conformanceLevel}</fx:ConformanceLevel>
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function embedFacturXIntoPdfA3(
  pdfBytes: Buffer | Uint8Array, factorXXml: string, opts: EmbedOptions,
): Promise<Buffer> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const fileName = opts.attachmentName ?? 'factur-x.xml';
  const modDate = opts.modificationDate ?? new Date();
  const xmlBuf = Buffer.from(factorXXml, 'utf8');
  const checksum = createHash('md5').update(xmlBuf).digest('hex');

  // Embedded file stream
  const embeddedStream = pdf.context.stream(xmlBuf, {
    Type: 'EmbeddedFile',
    Subtype: PDFName.of('text#2Fxml'),
    Params: pdf.context.obj({
      ModDate: PDFString.of(pdfDate(modDate)),
      CheckSum: PDFHexString.of(checksum),
      Size: PDFNumber.of(xmlBuf.length),
    }),
  });
  const embeddedRef = pdf.context.register(embeddedStream);

  // Filespec
  const filespec = pdf.context.obj({
    Type: 'Filespec',
    F: PDFString.of(fileName),
    UF: PDFHexString.fromText(fileName),
    Desc: PDFString.of('Factur-X / ZUGFeRD invoice'),
    AFRelationship: PDFName.of('Alternative'),
    EF: pdf.context.obj({ F: embeddedRef, UF: embeddedRef }),
  });
  const filespecRef = pdf.context.register(filespec);

  const catalog = pdf.catalog;

  // /AF on catalog (PDF 2.0 + Factur-X)
  catalog.set(PDFName.of('AF'), pdf.context.obj([filespecRef]));

  // /Names /EmbeddedFiles
  let names = catalog.lookup(PDFName.of('Names')) as PDFDict | undefined;
  if (!names) { names = pdf.context.obj({}); catalog.set(PDFName.of('Names'), names); }
  let embedded = (names as PDFDict).lookup(PDFName.of('EmbeddedFiles')) as PDFDict | undefined;
  if (!embedded) { embedded = pdf.context.obj({}); (names as PDFDict).set(PDFName.of('EmbeddedFiles'), embedded); }
  (embedded as PDFDict).set(PDFName.of('Names'),
    pdf.context.obj([PDFString.of(fileName), filespecRef]));

  // OutputIntent: sRGB
  const iccBytes = readFileSync(ICC_PATH);
  const iccStream = pdf.context.stream(iccBytes, { N: 3, Length: iccBytes.length });
  const iccRef = pdf.context.register(iccStream);
  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  });
  catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntent]));

  // XMP metadata
  const xmpStream = pdf.context.stream(buildXmp(opts, modDate), {
    Type: 'Metadata', Subtype: 'XML',
  });
  catalog.set(PDFName.of('Metadata'), pdf.context.register(xmpStream));

  // Document Info dict
  pdf.setTitle(`Rechnung ${opts.invoiceNumber}`);
  pdf.setProducer('pdf-lib + mentolder-billing');
  pdf.setCreationDate(modDate);
  pdf.setModificationDate(modDate);

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
