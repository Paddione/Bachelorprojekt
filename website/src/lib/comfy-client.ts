export interface ComfyOutput {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyHistory {
  [promptId: string]: {
    status: { status_str: string; completed: boolean };
    outputs: { [nodeId: string]: { [key: string]: ComfyOutput[] } };
  };
}

export async function uploadImage(
  baseUrl: string,
  buffer: ArrayBuffer,
  filename: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([buffer]), filename);
  const res = await fetchFn(`${baseUrl}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ComfyUI upload failed: ${res.status}`);
  const data = await res.json();
  return data.name as string;
}

export async function queuePrompt(
  baseUrl: string,
  workflow: object,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`ComfyUI queue failed: ${res.status}`);
  const data = await res.json();
  return data.prompt_id as string;
}

export async function getHistory(
  baseUrl: string,
  promptId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ComfyHistory> {
  const res = await fetchFn(`${baseUrl}/history/${promptId}`);
  if (!res.ok) throw new Error(`ComfyUI history failed: ${res.status}`);
  return res.json() as Promise<ComfyHistory>;
}

export function findGlbOutput(
  outputs: { [nodeId: string]: { [key: string]: unknown[] } },
): string | null {
  for (const node of Object.values(outputs)) {
    for (const files of Object.values(node)) {
      for (const f of files as ComfyOutput[]) {
        if (typeof f.filename === 'string' && f.filename.endsWith('.glb')) {
          return f.filename;
        }
      }
    }
  }
  return null;
}

export async function downloadOutput(
  baseUrl: string,
  filename: string,
  fetchFn: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const url = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&type=output`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`ComfyUI download failed: ${res.status}`);
  return res.arrayBuffer();
}
