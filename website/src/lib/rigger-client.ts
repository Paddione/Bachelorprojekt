// Client for the GPU-host Rigger service (FastAPI, port 8190).
// Mirrors comfy-client.ts: every fn takes an injectable fetchFn for testing.

export async function rigGlb(
  baseUrl: string,
  glb: ArrayBuffer,
  filename: string,
  fetchFn: typeof fetch = fetch,
  method: 'blender' | 'mixamo' = 'blender',
): Promise<ArrayBuffer> {
  const form = new FormData();
  form.append('glb', new Blob([glb], { type: 'model/gltf-binary' }), filename);
  const res = await fetchFn(`${baseUrl}/rig?method=${method}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Rigger failed: ${res.status}`);
  return res.arrayBuffer();
}
