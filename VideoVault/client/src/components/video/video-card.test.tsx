import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoCard } from './video-card';
import { Video } from '@/types/video';

// Mock the services
vi.mock('@/services/file-handle-registry', () => ({
  FileHandleRegistry: {
    get: vi.fn(),
  },
}));

vi.mock('@/services/video-thumbnail', () => ({
  VideoThumbnailService: {
    generateThumbnail: vi.fn(),
    generatePlaceholderThumbnail: vi.fn(),
    tryReadExternalThumbnailsForVideo: vi.fn(async () => []),
  },
}));

vi.mock('@/services/video-url-registry', () => ({
  VideoUrlRegistry: {
    get: vi.fn(),
  },
}));

vi.mock('@/services/thumbnail-generator', () => ({
  ThumbnailGenerator: {
    generateThumbnailForVideo: vi.fn(),
  },
}));

vi.mock('@/services/bulk-operations', () => ({
  BulkOperationsService: {
    getInstance: vi.fn(() => ({
      // Add any methods that might be called by VideoCard
    })),
  },
}));

const mockVideo: Video = {
  id: 'test-video-1',
  displayName: 'Test Video',
  filename: 'test-video.mp4',
  size: 1024 * 1024, // 1MB
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
    duration: 120, // 2 minutes
    width: 1920,
    height: 1080,
    bitrate: 5000,
    codec: 'h264',
    fps: 30,
    aspectRatio: '16:9',
  },
  thumbnail: {
    dataUrl: 'data:image/jpeg;base64,test',
    generated: true,
    timestamp: '0',
  },
  rootKey: 'test-root',
};

describe('VideoCard', () => {
  const defaultProps = {
    video: mockVideo,
    onPlay: vi.fn(),
    onEditTags: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onRemoveCategory: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders video information correctly', () => {
    render(<VideoCard {...defaultProps} />);

    expect(screen.getByTestId('text-title-test-video-1')).toHaveTextContent('Test Video');
    expect(screen.getByTestId('text-duration-test-video-1')).toHaveTextContent('2:0');
    expect(screen.getByTestId('text-size-test-video-1')).toHaveTextContent('1 MB');
    expect(screen.getByTestId('text-quality-test-video-1')).toHaveTextContent('HD');
  });

  it('displays category chips for standard categories', () => {
    render(<VideoCard {...defaultProps} />);

    // Use *All* queries to tolerate duplicate renders from UI wrappers
    const chip0 = screen.getAllByTestId('category-chip-test-video-1-0')[0];
    const chip1 = screen.getAllByTestId('category-chip-test-video-1-1')[0];
    const chip2 = screen.getAllByTestId('category-chip-test-video-1-2')[0];
    expect(chip0).toHaveTextContent('adult');
    expect(chip1).toHaveTextContent('athletic');
    expect(chip2).toHaveTextContent('HD');
  });

  it('displays category chips for custom categories', () => {
    render(<VideoCard {...defaultProps} />);

    const chip3 = screen.getAllByTestId('category-chip-test-video-1-3')[0];
    const chip4 = screen.getAllByTestId('category-chip-test-video-1-4')[0];
    expect(chip3).toHaveTextContent('action');
    expect(chip4).toHaveTextContent('intense');
  });

  it('calls onRemoveCategory when clicking a standard category chip', () => {
    render(<VideoCard {...defaultProps} />);

    const adultChip = screen.getAllByTestId('category-chip-test-video-1-0')[0];
    fireEvent.click(adultChip);

    expect(defaultProps.onRemoveCategory).toHaveBeenCalledWith('test-video-1', 'age', 'adult');
  });

  it('calls onRemoveCategory when clicking a custom category chip', () => {
    render(<VideoCard {...defaultProps} />);

    const actionChip = screen.getAllByTestId('category-chip-test-video-1-3')[0];
    fireEvent.click(actionChip);

    expect(defaultProps.onRemoveCategory).toHaveBeenCalledWith(
      'test-video-1',
      'custom',
      'genre:action',
    );
  });

  it('prevents card click when clicking on category chips', () => {
    render(<VideoCard {...defaultProps} />);

    const adultChip = screen.getAllByTestId('category-chip-test-video-1-0')[0];
    fireEvent.click(adultChip);

    expect(defaultProps.onPlay).not.toHaveBeenCalled();
  });

  it('calls onPlay when clicking on the card (not on buttons)', () => {
    render(<VideoCard {...defaultProps} />);

    const card = screen.getAllByTestId('video-card-test-video-1')[0];
    fireEvent.click(card);

    expect(defaultProps.onPlay).toHaveBeenCalledWith(mockVideo);
  });

  it('calls onEditTags when clicking edit tags button', () => {
    render(<VideoCard {...defaultProps} />);

    const editButton = screen.getAllByTestId('button-edit-tags-test-video-1')[0];
    fireEvent.click(editButton);

    expect(defaultProps.onEditTags).toHaveBeenCalledWith(mockVideo);
  });

  it('calls onRename when clicking rename button', () => {
    render(<VideoCard {...defaultProps} />);

    const renameButton = screen.getAllByTestId('button-rename-test-video-1')[0];
    fireEvent.click(renameButton);

    expect(defaultProps.onRename).toHaveBeenCalledWith(mockVideo);
  });

  it('calls onMove when clicking move button', () => {
    render(<VideoCard {...defaultProps} />);

    const moveButton = screen.getAllByTestId('button-move-test-video-1')[0];
    fireEvent.click(moveButton);

    expect(defaultProps.onMove).toHaveBeenCalledWith(mockVideo);
  });

  it('calls onDelete when clicking delete button', () => {
    render(<VideoCard {...defaultProps} />);

    const deleteButton = screen.getAllByTestId('button-delete-test-video-1')[0];
    fireEvent.click(deleteButton);

    expect(defaultProps.onDelete).toHaveBeenCalledWith(mockVideo);
  });

  it('shows placeholder when no thumbnail is available', () => {
    const videoWithoutThumbnail = {
      ...mockVideo,
      thumbnail: { dataUrl: '', generated: false, timestamp: '0' },
    };

    render(<VideoCard {...defaultProps} video={videoWithoutThumbnail} />);

    const thumbs = screen.getAllByTestId('video-card-thumbnail-test-video-1');
    // At least one thumbnail container should show the placeholder icon
    const hasPlaceholder = thumbs.some((el) => !!el.querySelector('.text-muted-foreground'));
    expect(hasPlaceholder).toBe(true);
  });

  it('limits category chips to 6 maximum', () => {
    const videoWithManyCategories = {
      ...mockVideo,
      categories: {
        age: ['adult', 'teen'],
        physical: ['athletic', 'slim'],
        quality: ['HD', '4K'],
        ethnicity: ['asian', 'caucasian'],
        relationship: ['couple'],
        acts: ['oral'],
        setting: ['outdoor'],
        performer: ['amateur'],
      },
      customCategories: {
        genre: ['action', 'drama'],
        mood: ['intense', 'romantic'],
      },
    };

    render(<VideoCard {...defaultProps} video={videoWithManyCategories} />);

    // Should only show first 6 category chips (scope to first rendered card)
    const card = screen.getAllByTestId('video-card-test-video-1')[0];
    const categoryChips = within(card).getAllByTestId(/^category-chip-test-video-1-\d+$/);
    expect(categoryChips.length).toBeLessThanOrEqual(6);
  });


});
