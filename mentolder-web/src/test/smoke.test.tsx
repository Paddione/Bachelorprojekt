import { render, screen } from '@testing-library/react';

it('smoke: renders a trivial component', () => {
  render(<div data-testid="smoke">Hello vitest</div>);
  expect(screen.getByTestId('smoke')).toBeInTheDocument();
  expect(screen.getByText('Hello vitest')).toBeInTheDocument();
});
