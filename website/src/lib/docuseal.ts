// DocuSeal REST API client.
// Internal URL for server-side calls (K8s service DNS).
// All functions throw on non-2xx responses.

const BASE_URL = (process.env.DOCUSEAL_INTERNAL_URL ?? 'http://docuseal.workspace.svc.cluster.local:3000').replace(/\/$/, '');
const API_TOKEN = process.env.DOCUSEAL_API_TOKEN ?? '';

async function ds(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...init,
    headers: {
      'X-Auth-Token': API_TOKEN,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DocuSeal ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res;
}

export interface DocuSealSubmitter {
  id: number;
  slug: string;
  email: string;
  embed_src: string;
  completed_at: string | null;
}

export interface DocuSealSubmission {
  id: number;
  submitters: DocuSealSubmitter[];
}

/** Create an HTML-based template in DocuSeal. Returns the DocuSeal template ID. */
export async function createTemplate(name: string, html: string): Promise<number> {
  const res = await ds('/templates/html', {
    method: 'POST',
    body: JSON.stringify({ name, html }),
  });
  const data = await res.json() as { id: number };
  return data.id;
}

/** Create a submission for an existing template. Returns first submitter details. */
export async function createSubmission(params: {
  templateId: number;
  submitterEmail: string;
  submitterName: string;
  prefillValues?: Record<string, string>;
}): Promise<DocuSealSubmitter> {
  const submitter: Record<string, unknown> = {
    role: 'First Party',
    email: params.submitterEmail,
    name: params.submitterName,
    send_email: true,
  };
  if (params.prefillValues && Object.keys(params.prefillValues).length > 0) {
    submitter.values = params.prefillValues;
  }
  const res = await ds('/submissions', {
    method: 'POST',
    body: JSON.stringify({
      template_id: params.templateId,
      submitters: [submitter],
    }),
  });
  const data = await res.json() as DocuSealSubmitter[];
  if (!data[0]) throw new Error('DocuSeal returned no submitters');
  return data[0];
}

/** Fetch a submission by slug to check completion status. */
export async function getSubmitterBySlug(slug: string): Promise<DocuSealSubmitter> {
  const res = await ds(`/submitters/${slug}`);
  return (await res.json()) as DocuSealSubmitter;
}
