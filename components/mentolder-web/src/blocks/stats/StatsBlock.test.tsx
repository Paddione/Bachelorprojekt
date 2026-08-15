import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatsBlock } from './StatsBlock';

const items = [
  { value: '30+', target: 30, label: 'Jahre Führung' },
  { value: 'KI', label: 'Schwerpunkt' },
  { value: 'K8s', label: 'Cloud-Native' },
  { value: 'B.Sc.', label: 'Wirtschaftsinformatik' },
];

describe('StatsBlock', () => {
  it('renders all stat items', () => {
    render(
      <MemoryRouter>
        <StatsBlock items={items} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Jahre Führung')).toBeInTheDocument();
    expect(screen.getByText('Schwerpunkt')).toBeInTheDocument();
    expect(screen.getByText('Cloud-Native')).toBeInTheDocument();
    expect(screen.getByText('Wirtschaftsinformatik')).toBeInTheDocument();
  });
});
