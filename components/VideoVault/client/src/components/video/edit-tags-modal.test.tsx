import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditTagsModal } from './edit-tags-modal';
import { Video, Category } from '@/types/video';

const getMockVideo = (): Video => ({
  id: 'test-video-1',
  displayName: 'Test Video',
  filename: 'test-video.mp4',
  size: 1024 * 1024,
  lastModified: new Date('2024-01-01').toISOString(),
  path: '/test/path',
  categories: {
    age: ['adult'],
    physical: ['athletic'],
    ethnicity: [],
    relationship: [],
    acts: [],
    setting: [],
    quality: ['HD'],
    performer: [],
  },
  customCategories: {
    genre: ['action'],
    mood: ['intense'],
  },
  metadata: {
    duration: 120,
    width: 1920,
    height: 1080,
    bitrate: 0,
    codec: '',
    fps: 0,
    aspectRatio: '',
  },
  thumbnail: {
    dataUrl: 'data:image/jpeg;base64,test',
    generated: true,
    timestamp: new Date('2024-01-01').toISOString(),
  },
  rootKey: 'test-root',
});

const mockAvailableCategories: Category[] = [
  { type: 'age', value: 'adult', isCustom: false, count: 1 },
  { type: 'age', value: 'teen', isCustom: false, count: 1 },
  { type: 'physical', value: 'athletic', isCustom: false, count: 1 },
  { type: 'quality', value: 'HD', isCustom: false, count: 1 },
  { type: 'quality', value: '4K', isCustom: false, count: 1 },
  { type: 'genre', value: 'action', isCustom: true, count: 1 },
  { type: 'genre', value: 'drama', isCustom: true, count: 1 },
  { type: 'mood', value: 'intense', isCustom: true, count: 1 },
  { type: 'mood', value: 'romantic', isCustom: true, count: 1 },
];

describe('EditTagsModal', () => {
  let mockVideo: Video;
  let defaultProps: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVideo = getMockVideo();
    defaultProps = {
      video: mockVideo,
      isOpen: true,
      onClose: vi.fn(),
      onSave: vi.fn(),
      onRemoveCategory: vi.fn(),
      availableCategories: mockAvailableCategories,
    };
  });

  it('renders when open with video data', () => {
    render(<EditTagsModal {...defaultProps} />);

    expect(screen.getByText('Edit Video Categories')).toBeInTheDocument();
  });

  it('shows current categories in the form', () => {
    render(<EditTagsModal {...defaultProps} />);

    // Should show existing categories as badges
    expect(screen.getByTestId('category-badge-age-adult')).toBeInTheDocument();
    expect(screen.getByTestId('category-badge-physical-athletic')).toBeInTheDocument();
    expect(screen.getByTestId('category-badge-quality-HD')).toBeInTheDocument();
  });

  it('calls onSave with updated categories when saving', () => {
    render(<EditTagsModal {...defaultProps} />);

    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    expect(defaultProps.onSave).toHaveBeenCalledWith('test-video-1', {
      categories: mockVideo.categories,
      customCategories: mockVideo.customCategories,
    });
  });

  it('calls onClose when canceling', () => {
    render(<EditTagsModal {...defaultProps} />);

    const cancelButton = screen.getByTestId('button-cancel-edit');
    fireEvent.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('allows adding new standard categories via input', () => {
    render(<EditTagsModal {...defaultProps} />);

    // First select the category type
    const typeSelect = screen.getByTestId('select-category-type');
    fireEvent.click(typeSelect);

    // Select 'physical' from the dropdown
    const physicalOption = screen.getByText('Physical');
    fireEvent.click(physicalOption);

    // Type the new value
    const valueInput = screen.getByTestId('input-category-value');
    fireEvent.change(valueInput, { target: { value: 'tall' } });

    // Click add button
    const addButton = screen.getByTestId('button-add-category');
    fireEvent.click(addButton);

    // Should add 'tall' to physical categories
    expect(screen.getByTestId('category-badge-physical-tall')).toBeInTheDocument();
  });

  it('allows adding new custom categories via input', () => {
    render(<EditTagsModal {...defaultProps} />);

    const typeInput = screen.getByTestId('input-custom-type');
    const valueInput = screen.getByTestId('input-custom-value');

    fireEvent.change(typeInput, { target: { value: 'theme' } });
    fireEvent.change(valueInput, { target: { value: 'dark' } });

    const addButton = screen.getByTestId('button-add-custom-category');
    fireEvent.click(addButton);

    // Should add 'dark' to theme custom categories
    expect(screen.getByTestId('custom-badge-theme-dark')).toBeInTheDocument();
  });

  it('removes categories when clicking remove button', () => {
    render(<EditTagsModal {...defaultProps} />);

    const removeButton = screen.getByTestId('button-remove-age-adult');

    fireEvent.click(removeButton);

    // Should remove the adult category
    expect(screen.queryByTestId('category-badge-age-adult')).not.toBeInTheDocument();
  });

  it('does not render when no video is provided', () => {
    render(<EditTagsModal {...defaultProps} video={null} />);

    expect(screen.queryByText('Edit Video Categories')).not.toBeInTheDocument();
  });

  it('updates form when video changes', () => {
    const { rerender } = render(<EditTagsModal {...defaultProps} />);

    const newVideo = {
      ...mockVideo,
      categories: {
        ...mockVideo.categories,
        age: ['teen'],
      },
    };

    rerender(<EditTagsModal {...defaultProps} video={newVideo} />);

    // Should show new age category
    expect(screen.getByTestId('category-badge-age-teen')).toBeInTheDocument();
    expect(screen.queryByTestId('category-badge-age-adult')).not.toBeInTheDocument();
  });

  it('supports quick category search and assignment', async () => {
    const onSave = vi.fn();

    render(
      <EditTagsModal
        {...defaultProps}
        onSave={onSave}
        availableCategories={[
          ...defaultProps.availableCategories,
          { type: 'physical', value: 'blonde', count: 5, isCustom: false },
        ]}
      />,
    );

    // Test searching for a standard category
    const searchInput = screen.getByTestId('quick-category-search');
    fireEvent.change(searchInput, { target: { value: 'blon' } });

    // Click the suggestion to add it (waitFor implicit in findBy)
    const suggestionButton = await screen.findByTestId('quick-category-search-suggestion-0');
    fireEvent.click(suggestionButton);

    // Should be added to the UI
    expect(screen.getByTestId('category-badge-physical-blonde')).toBeInTheDocument();

    // Save and verify the category was added
    const saveButton = screen.getByTestId('button-save-changes');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(mockVideo.id, {
      categories: {
        ...mockVideo.categories,
        physical: expect.arrayContaining(['athletic', 'blonde']),
      },
      customCategories: mockVideo.customCategories,
    });
  });

  it('supports quick search for custom categories', async () => {
    const onSave = vi.fn();

    render(<EditTagsModal {...defaultProps} onSave={onSave} />);

    // Test searching for a custom category
    const searchInput = screen.getByTestId('quick-category-search');
    fireEvent.change(searchInput, { target: { value: 'romantic' } });

    // Should show "mood: romantic" suggestion
    await waitFor(() => {
      expect(screen.getByText('mood: romantic')).toBeInTheDocument();
    });

    // Click the suggestion to add it
    const suggestionButton = screen.getByTestId('quick-category-search-suggestion-0');
    fireEvent.click(suggestionButton);

    // Should be added to the UI
    expect(screen.getByTestId('custom-badge-mood-romantic')).toBeInTheDocument();

    // Save and verify the custom category was added
    const saveButton = screen.getByTestId('button-save-changes');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(mockVideo.id, {
      categories: mockVideo.categories,
      customCategories: {
        ...mockVideo.customCategories,
        mood: expect.arrayContaining(['intense', 'romantic']), // Should be added to existing custom categories
      },
    });
  });
});
