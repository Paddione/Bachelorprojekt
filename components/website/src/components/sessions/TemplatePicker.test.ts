import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TemplatePicker from './TemplatePicker.svelte';

const sampleTemplates = {
  templates: [
    { id: 'd1', slug: 'feature-intake', title: 'Feature-Intake', body_markdown: '# x',
      is_default: true, owner_id: null, created_from_template_id: null },
    { id: 'c1', slug: 'my-retro', title: 'My Retro', body_markdown: '# y',
      is_default: false, owner_id: 'admin', created_from_template_id: 'd2' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => sampleTemplates }));
});
afterEach(() => vi.unstubAllGlobals());

describe('TemplatePicker', () => {
  it('renders default and custom templates from the API', async () => {
    const { getByText } = render(TemplatePicker);
    await waitFor(() => expect(getByText('Feature-Intake')).toBeTruthy());
    expect(getByText('My Retro')).toBeTruthy();
  });

  it('shows Default badge on default templates', async () => {
    const { getByText } = render(TemplatePicker);
    await waitFor(() => expect(getByText('Default')).toBeTruthy());
  });

  it('dispatches template:select on card click', async () => {
    const handler = vi.fn();
    window.addEventListener('template:select', handler as EventListener);
    const { getByRole } = render(TemplatePicker);
    await waitFor(() => getByRole('button', { name: /Feature-Intake/i }));
    await fireEvent.click(getByRole('button', { name: /Feature-Intake/i }));
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener('template:select', handler as EventListener);
  });
});
