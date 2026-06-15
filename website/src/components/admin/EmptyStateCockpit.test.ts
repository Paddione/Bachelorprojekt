import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import EmptyStateCockpit from './EmptyStateCockpit.svelte';

describe('EmptyStateCockpit', () => {
  it('renders a calm empty message', () => {
    const { getByText } = render(EmptyStateCockpit);
    expect(getByText(/Keine Produkte/i)).toBeTruthy();
  });
});
