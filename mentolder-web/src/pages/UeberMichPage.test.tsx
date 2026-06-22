import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UeberMichPage } from './UeberMichPage';
import { ueberMich } from '@/content';

const renderPage = () =>
  render(
    <MemoryRouter>
      <UeberMichPage />
    </MemoryRouter>,
  );

describe('UeberMichPage', () => {
  it('renders the emphasis part of the headline', () => {
    renderPage();
    expect(screen.getByText(ueberMich.headlineEmphasis)).toBeInTheDocument();
  });

  it('renders the lede text', () => {
    renderPage();
    expect(screen.getByText(ueberMich.lede)).toBeInTheDocument();
  });

  it('renders all milestone years', () => {
    renderPage();
    for (const m of ueberMich.milestones) {
      expect(screen.getByText(m.year)).toBeInTheDocument();
    }
  });

  it('renders all milestone titles', () => {
    renderPage();
    for (const m of ueberMich.milestones) {
      expect(screen.getByText(m.title)).toBeInTheDocument();
    }
  });

  it('renders all section titles', () => {
    renderPage();
    for (const sec of ueberMich.sections) {
      expect(screen.getByText(sec.title)).toBeInTheDocument();
    }
  });

  it('renders all notDoing item titles', () => {
    renderPage();
    for (const item of ueberMich.notDoing) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
    }
  });

  it('renders the "Was ich nicht mache" heading', () => {
    renderPage();
    expect(screen.getByText('Was ich nicht mache')).toBeInTheDocument();
  });
});
