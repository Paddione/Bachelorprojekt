import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import OpenSpecProposalsPanel from '../OpenSpecProposalsPanel.svelte';

describe('OpenSpecProposalsPanel', () => {
  it('rendert nichts bei leerem proposals-Array', () => {
    const { container } = render(OpenSpecProposalsPanel, { props: { proposals: [] } });
    expect(container.querySelector('li')).toBeNull();
  });

  it('zeigt den Slug im DOM an', () => {
    const { getByText } = render(OpenSpecProposalsPanel, {
      props: { proposals: [{ slug: 'test-proposal', status: 'planning' }] },
    });
    expect(getByText(/test proposal/i)).toBeTruthy();
  });
});
