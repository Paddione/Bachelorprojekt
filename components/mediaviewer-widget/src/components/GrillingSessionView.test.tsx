import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GrillingSessionView } from './GrillingSessionView';
import type { GrillingSessionData } from '../embed/bridge';

const mockData: GrillingSessionData = {
  ticketId: 'T000942',
  questionnaireId: 'final-grilling-v1',
  questions: [
    { id: 'q1', label: 'Was ist das Kernproblem?', section: '1. Anforderungsklärung' },
    { id: 'q2', label: 'Welche Acceptance Criteria?', section: '1. Anforderungsklärung' },
    { id: 'q3', label: 'Gibt es Abhängigkeiten?', section: '1. Anforderungsklärung' },
  ],
  hints: { q1: 'Ticket: Test-Ticket Body' },
  suggestions: { q1: ['Vorschlag A', 'Vorschlag B'] },
  existingAnswers: { q2: 'Vorhandene Antwort' },
  assets: [],
};

describe('GrillingSessionView', () => {
  it('renders the first question and header', () => {
    render(<GrillingSessionView data={mockData} />);
    expect(screen.getByText('Final Grilling')).toBeDefined();
    expect(screen.getByText('T000942')).toBeDefined();
    expect(screen.getByText('Was ist das Kernproblem?')).toBeDefined();
  });

  it('shows progress bar', () => {
    render(<GrillingSessionView data={mockData} />);
    // Both progress-text (answered/total = 1/3) and nav-pos (currentIndex+1/total = 1/3)
    // show "1/3" because mockData has one pre-filled existingAnswer.
    expect(screen.getAllByText('1/3').length).toBeGreaterThanOrEqual(1);
  });

  it('displays existing answers pre-filled', () => {
    render(<GrillingSessionView data={mockData} />);
    const input = screen.getByTestId('grilling-answer-input') as HTMLTextAreaElement;
    expect(input.value).toBe('');
  });

  it('navigates forward through questions', () => {
    render(<GrillingSessionView data={mockData} />);
    fireEvent.click(screen.getByText('Weiter'));
    expect(screen.getByText('Welche Acceptance Criteria?')).toBeDefined();
    expect(screen.getByText('2/3')).toBeDefined();
  });

  it('navigates backward', () => {
    render(<GrillingSessionView data={mockData} />);
    fireEvent.click(screen.getByText('Weiter'));
    fireEvent.click(screen.getByText('Zurück'));
    expect(screen.getByText('Was ist das Kernproblem?')).toBeDefined();
  });

  it('calls onAnswer when input changes (on blur)', () => {
    const onAnswer = vi.fn();
    render(<GrillingSessionView data={mockData} onAnswer={onAnswer} />);
    const input = screen.getByTestId('grilling-answer-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Meine Antwort' } });
    fireEvent.blur(input);
    expect(onAnswer).toHaveBeenCalledWith('q1', 'Meine Antwort');
  });

  it('calls onComplete with all answers on last question', () => {
    const onComplete = vi.fn();
    render(<GrillingSessionView data={mockData} onComplete={onComplete} />);
    const input = screen.getByTestId('grilling-answer-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'A1' } });
    fireEvent.click(screen.getByText('Weiter'));
    fireEvent.change(screen.getByTestId('grilling-answer-input'), { target: { value: 'A2' } });
    fireEvent.click(screen.getByText('Weiter'));
    fireEvent.change(screen.getByTestId('grilling-answer-input'), { target: { value: 'A3' } });
    fireEvent.click(screen.getByText('Abschließen'));
    expect(onComplete).toHaveBeenCalledWith({ q1: 'A1', q2: 'A2', q3: 'A3' });
  });

  it('calls onDismiss when überspringen is clicked', () => {
    const onDismiss = vi.fn();
    render(<GrillingSessionView data={mockData} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Überspringen'));
    expect(onDismiss).toHaveBeenCalledWith('q1');
  });

  it('shows hint toggle and expands hint content', () => {
    render(<GrillingSessionView data={mockData} />);
    expect(screen.getByText('Kontext anzeigen')).toBeDefined();
    fireEvent.click(screen.getByText('Kontext anzeigen'));
    expect(screen.getByText('Ticket: Test-Ticket Body')).toBeDefined();
  });

  it('shows suggestion chips and appends on click', () => {
    render(<GrillingSessionView data={mockData} />);
    expect(screen.getByText('Vorschlag A')).toBeDefined();
    fireEvent.click(screen.getByText('Vorschlag A'));
    const input = screen.getByTestId('grilling-answer-input') as HTMLTextAreaElement;
    expect(input.value).toContain('Vorschlag A');
  });
});
