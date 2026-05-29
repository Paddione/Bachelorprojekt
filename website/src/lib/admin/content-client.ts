export async function postContentSave(
  contentKey: string,
  baseVersion: number,
  value: any,
): Promise<{ version: number }> {
  const res = await fetch('/api/admin/content/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentKey, baseVersion, payload: value }),
  });
  if (res.status === 409) {
    const body = await res.json();
    throw { status: 409, body };
  }
  if (res.status === 422) {
    const body = await res.json();
    throw { status: 422, body };
  }
  if (!res.ok) throw { status: res.status };
  return res.json();
}
