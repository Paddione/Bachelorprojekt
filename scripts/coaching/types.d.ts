// Ambient module declarations for deps that don't ship their own types.
declare module 'pdf-parse/lib/pdf-parse.js' {
  type PageRenderFn = (pageData: {
    pageNumber: number;
    getTextContent(): Promise<{ items: { str: string }[] }>;
  }) => Promise<string>;

  type PdfParseOptions = {
    pagerender?: PageRenderFn;
    max?: number;
    version?: string;
  };

  type PdfParseResult = {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  };

  function pdfParse(data: Buffer | Uint8Array, options?: PdfParseOptions): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'epub2' {
  type Spine = { id: string; href?: string }[];

  class EPub {
    static createAsync(filePath: string): Promise<EPub>;
    flow: Spine;
    getChapter(id: string, cb: (err: Error | null, text: string) => void): void;
  }

  export default EPub;
}
