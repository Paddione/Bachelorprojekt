import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BlockRenderer } from './BlockRenderer';

const renderWithRouter = (ui: React.ReactNode) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('BlockRenderer', () => {
  it('renders seed by default (no document prop)', () => {
    renderWithRouter(<BlockRenderer />);
    expect(screen.getByText('praxisnah. Strukturiert. Auf Augenhöhe.')).toBeInTheDocument();
    expect(screen.getAllByText('Gerald Korczewski')[0]).toBeInTheDocument();
  });

  it('renders all 7 sections from the committed seed', () => {
    renderWithRouter(<BlockRenderer />);
    expect(screen.getByText('Jahre Führungserfahrung')).toBeInTheDocument();
    expect(screen.getAllByText('Meine Angebote')[0]).toBeInTheDocument();
    expect(screen.getByText('Warum ich?')).toBeInTheDocument();
    expect(screen.getByText('So arbeiten wir')).toBeInTheDocument();
    expect(screen.getByText('Häufig gestellte Fragen')).toBeInTheDocument();
    expect(screen.getByText('Bereit?')).toBeInTheDocument();
  });

  it('falls back to seed on schemaVersion mismatch (999)', () => {
    const mismatched = {
      schemaVersion: 999,
      blocks: [
        {
          id: 'fake',
          type: 'hero' as const,
          props: {
            title: 'SHOULD-NOT-RENDER',
            titleEmphasis: 'x',
            subtitle: 'y',
            tagline: 'z',
            avatarType: 'initials' as const,
            avatarInitials: 'X',
            personName: 'X',
            personRole: 'X',
          },
        },
      ],
    };
    renderWithRouter(<BlockRenderer document={mismatched} />);
    expect(screen.queryByText('SHOULD-NOT-RENDER')).not.toBeInTheDocument();
    expect(screen.getByText('Warum ich?')).toBeInTheDocument();
  });

  it('falls back to seed on invalid document (safeParse fails)', () => {
    const invalid = {
      schemaVersion: 1,
      blocks: [{ id: 'bad', type: 'no-such-type', props: {} }],
    } as unknown as Parameters<typeof BlockRenderer>[0] extends { document?: infer D } ? D : never;
    renderWithRouter(<BlockRenderer document={invalid} />);
    expect(screen.getAllByText('Meine Angebote')[0]).toBeInTheDocument();
  });
});
