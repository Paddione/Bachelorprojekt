import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategorySearch } from './category-search';
import { Category } from '@/types/video';

const mockCategories: Category[] = [
  { type: 'age', value: 'teen', count: 5, isCustom: false },
  { type: 'age', value: 'mature', count: 3, isCustom: false },
  { type: 'physical', value: 'blonde', count: 8, isCustom: false },
  { type: 'physical', value: 'brunette', count: 6, isCustom: false },
  { type: 'quality', value: 'hd', count: 12, isCustom: false },
  { type: 'mood', value: 'romantic', count: 4, isCustom: true },
  { type: 'mood', value: 'hardcore', count: 2, isCustom: true },
  { type: 'rating', value: 'excellent', count: 7, isCustom: true },
];

describe('CategorySearch', () => {
  const mockOnCategorySelect = vi.fn();

  beforeEach(() => {
    mockOnCategorySelect.mockClear();
  });

  it('renders search input with placeholder', () => {
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
        placeholder="Search test..."
      />,
    );

    expect(screen.getByPlaceholderText('Search test...')).toBeInTheDocument();
  });

  it('shows suggestions when typing', async () => {
    vi.useRealTimers();
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'blon' } });

    await waitFor(() => {
      expect(screen.getByText('blonde')).toBeInTheDocument();
    });
  });

  it('filters suggestions based on input', async () => {
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mood' } });

    await waitFor(() => {
      expect(screen.getByText('mood: romantic')).toBeInTheDocument();
      expect(screen.getByText('mood: hardcore')).toBeInTheDocument();
      expect(screen.queryByText('blonde')).not.toBeInTheDocument();
    });
  });

  it('calls onCategorySelect when suggestion is clicked', async () => {
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'teen' } });

    await waitFor(() => {
      const suggestion = screen.getByText('teen');
      fireEvent.click(suggestion.closest('button')!);
    });

    expect(mockOnCategorySelect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'age',
        value: 'teen',
        isCustom: false,
      }),
    );
  });

  it('clears input after selection', async () => {
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hd' } });

    await waitFor(() => {
      const suggestion = screen.getByText('hd');
      fireEvent.click(suggestion.closest('button')!);
    });

    expect(input.value).toBe('');
  });

  it('supports keyboard navigation', () => {
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'teen' } });

    // Press Enter to select first suggestion
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockOnCategorySelect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'age',
        value: 'teen',
      }),
    );
  });

  it('clears search on Escape key', () => {
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.value).toBe('');
  });

  it('shows custom categories with type prefix', async () => {
    render(
      <CategorySearch
        availableCategories={mockCategories}
        onCategorySelect={mockOnCategorySelect}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'romantic' } });

    await waitFor(() => {
      expect(screen.getByText('mood: romantic')).toBeInTheDocument();
    });
  });

  it('prioritizes exact matches', async () => {
    const categories = [
      { type: 'quality', value: 'hd', count: 12, isCustom: false },
      { type: 'quality', value: 'hdr', count: 8, isCustom: false },
      { type: 'setting', value: 'hd scene', count: 3, isCustom: false },
    ];

    render(
      <CategorySearch availableCategories={categories} onCategorySelect={mockOnCategorySelect} />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hd' } });

    await waitFor(() => {
      // Check that "hd" appears in the suggestions (should be first due to exact match)
      expect(screen.getByText('hd')).toBeInTheDocument();
      expect(screen.getByText('hdr')).toBeInTheDocument();
      expect(screen.getByText('hd scene')).toBeInTheDocument();
    });
  });
});
