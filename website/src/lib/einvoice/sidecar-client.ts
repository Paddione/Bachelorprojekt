export class SidecarUnavailableError extends Error {
  constructor(public status: number, msg: string) { super(msg); this.name = 'SidecarUnavailableError'; }
}
export class SidecarValidationError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SidecarValidationError'; }
}

export interface EmbedResult { pdf: Buffer; meta: Record<string, unknown>; }
export interface ValidateResult { ok: boolean; errors: string[]; warnings: string[]; reportXml: string; }

export interface SidecarClient {
  embed(pdf: Buffer, xml: string): Promise<EmbedResult>;
  validate(payload: { pdf?: Buffer; xml?: string }): Promise<ValidateResult>;
}

export function createSidecarClient(baseUrl: string, opts: { timeoutMs?: number } = {}): SidecarClient {
  const timeoutMs = opts.timeoutMs ?? 30_000;

  async function call<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (r.status >= 500) throw new SidecarUnavailableError(r.status, `${path} → ${r.status}`);
      if (r.status >= 400) throw new SidecarValidationError(`${path} → ${r.status}: ${await r.text()}`);
      return (await r.json()) as T;
    } catch (e) {
      if (e instanceof SidecarUnavailableError || e instanceof SidecarValidationError) throw e;
      throw new SidecarUnavailableError(0, `network: ${(e as Error).message}`);
    } finally { clearTimeout(t); }
  }

  return {
    async embed(pdf, xml) {
      const res = await call<{ pdf: string; meta: Record<string, unknown> }>('/embed', {
        pdf: pdf.toString('base64'),
        xml: Buffer.from(xml, 'utf8').toString('base64'),
      });
      return { pdf: Buffer.from(res.pdf, 'base64'), meta: res.meta };
    },
    async validate(payload) {
      return call<ValidateResult>('/validate', {
        pdf: payload.pdf?.toString('base64'),
        xml: payload.xml ? Buffer.from(payload.xml, 'utf8').toString('base64') : undefined,
      });
    },
  };
}

export function sidecarBaseUrlFromEnv(): string {
  return process.env.EINVOICE_SIDECAR_URL || 'http://einvoice-sidecar.workspace.svc.cluster.local';
}
