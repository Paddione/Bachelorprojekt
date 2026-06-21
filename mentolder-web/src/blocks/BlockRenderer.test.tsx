import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BlockRenderer } from './BlockRenderer';

const renderWithRouter = (ui: React.ReactNode) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('BlockRenderer', () => {
  it('renders seed by default (no document prop)', () => {
    renderWithRouter(<BlockRenderer />);
    expect(screen.getByText('Menschen, Prozesse und Technik')).toBeInTheDocument();
    expect(screen.getByText('Dr. M. Albers')).toBeInTheDocument();
  });

  it('renders all 7 sections from the committed seed', () => {
    renderWithRouter(<BlockRenderer />);
    expect(screen.getByText('Jahre Führung')).toBeInTheDocument();
    expect(screen.getByText('Drei Wege, mit mir zu arbeiten.')).toBeInTheDocument();
    expect(screen.getByText('Warum mit mir?')).toBeInTheDocument();
    expect(screen.getByText("So geht's los")).toBeInTheDocument();
    expect(screen.getByText('Häufige Fragen')).toBeInTheDocument();
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
    expect(screen.getByText('Dr. M. Albers')).toBeInTheDocument();
  });

  it('falls back to seed on invalid document (safeParse fails)', () => {
    const invalid = {
      schemaVersion: 1,
      blocks: [{ id: 'bad', type: 'no-such-type', props: {} }],
    } as unknown as Parameters<typeof BlockRenderer>[0] extends { document?: infer D } ? D : never;
    renderWithRouter(<BlockRenderer document={invalid} />);
    expect(screen.getByText('Dr. M. Albers')).toBeInTheDocument();
  });
});
