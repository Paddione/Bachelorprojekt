import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '@/components/ui/theme-provider';

export function renderWithProviders(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(
    <ThemeProvider defaultTheme="light">
      {ui}
    </ThemeProvider>,
    options
  );
}

export * from '@testing-library/react';
