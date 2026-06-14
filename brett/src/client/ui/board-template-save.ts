export function validateTemplateName(name: string): string | null {
  if (typeof name !== 'string') return 'invalid-type';
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'empty';
  if (trimmed.length > 100) return 'too-long';
  return null;
}

export function buildSavePayload(name: string, category: string, figures: any[]): object {
  return {
    name: name.trim(),
    category: category.trim() || null,
    state: { figures },
  };
}

export function mountTemplateSaveButton(
  container: HTMLElement,
  opts: { getState: () => any; onSaved: () => void },
): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'brett-template-save-btn';
  btn.textContent = 'Template speichern';
  btn.addEventListener('click', () => {
    const name = prompt('Template-Name:');
    if (name === null) return;
    const err = validateTemplateName(name);
    if (err) {
      alert('Ungültiger Template-Name: ' + err);
      return;
    }
    const category = prompt('Kategorie (optional):') || '';
    const state = opts.getState();
    const payload = buildSavePayload(name, category, state?.figures ?? []);
    fetch('/api/board-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => {
      if (r.ok) opts.onSaved();
    }).catch(() => {});
  });
  container.appendChild(btn);
}
