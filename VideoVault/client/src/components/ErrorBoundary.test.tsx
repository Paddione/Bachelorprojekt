import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import React from 'react';
import ErrorBoundary from './ErrorBoundary';

// Mock the error handler
vi.mock('@/lib/error-handler', () => ({
  handleError: vi.fn(),
}));

// Component that throws an error for testing
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders error UI when child throws an error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('errorBoundary.title')).toBeInTheDocument();
    expect(screen.getByText('errorBoundary.description')).toBeInTheDocument();
    expect(screen.getByText('errorBoundary.tryAgain')).toBeInTheDocument();
    expect(screen.getByText('errorBoundary.goHome')).toBeInTheDocument();
  });

  it('shows error details in development mode', () => {
    // Mock NODE_ENV to be development
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const detailsElement = screen.getByText('errorBoundary.devDetails');
    expect(detailsElement).toBeInTheDocument();

    // Click to expand details
    fireEvent.click(detailsElement);

    expect(screen.getByText('Test error')).toBeInTheDocument();

    // Restore original env
    process.env.NODE_ENV = originalEnv;
  });

  it('handles retry button click', () => {
    const { rerender } = render(
      <ErrorBoundary key="error">
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const headings = screen.getAllByText('errorBoundary.title');
    expect(headings[headings.length - 1]).toBeInTheDocument();

    // Click retry button
    const retryButtons = screen.getAllByText('errorBoundary.tryAgain');
    fireEvent.click(retryButtons[retryButtons.length - 1]);

    // Re-render with no error and a new key to force re-mounting
    rerender(
      <ErrorBoundary key="no-error">
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    const noErrorEls = screen.getAllByText('No error');
    expect(noErrorEls[noErrorEls.length - 1]).toBeInTheDocument();
  });

  it('handles go home button click', () => {
    // Mock window.location.href
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { ...originalLocation, href: '' };

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Click go home button
    const goHomeButtons = screen.getAllByText('errorBoundary.goHome');
    fireEvent.click(goHomeButtons[goHomeButtons.length - 1]);

    expect(window.location.href).toBe('/');

    // Restore original location
    window.location = originalLocation;
  });

  it('renders custom fallback when provided', () => {
    const CustomFallback = () => <div>Custom error UI</div>;

    const { container } = render(
      <ErrorBoundary fallback={<CustomFallback />}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const scoped = within(container);
    expect(scoped.getByText('Custom error UI')).toBeInTheDocument();
    expect(scoped.queryByText('errorBoundary.title')).not.toBeInTheDocument();
  });

  it('logs errors to console', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalledWith(
      'ErrorBoundary caught an error:',
      expect.any(Error),
      expect.any(Object)
    );
  });
});
