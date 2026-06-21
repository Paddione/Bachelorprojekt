import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';

describe('HomePage Null-Diff baseline', () => {
  it('renders the full page identically to the pre-refactor snapshot', () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(container.firstChild).toMatchSnapshot('homepage-full-page');
  });
});
