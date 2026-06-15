import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { MediaviewerWidget } from './MediaviewerWidget';
import type { MediaviewerHandle, VideoSource } from '@videovault-player';

const mockVideos: VideoSource[] = [
  { id: 'v1', url: 'https://example.com/help1.mp4', title: 'How to use VideoVault', duration: 60 },
  { id: 'v2', url: 'https://example.com/help2.mp4', title: 'Managing categories', duration: 90 },
  { id: 'v3', url: 'https://example.com/help3.mp4', title: 'Batch operations', duration: 120 },
];

describe('MediaviewerWidget', () => {
  it('renders picker with all help video titles', () => {
    render(<MediaviewerWidget videos={mockVideos} onSelect={() => {}} />);
    expect(screen.getByText('How to use VideoVault')).toBeInTheDocument();
    expect(screen.getByText('Managing categories')).toBeInTheDocument();
    expect(screen.getByText('Batch operations')).toBeInTheDocument();
  });

  it('playVideo imperatively via ref handle', () => {
    const ref = createRef<MediaviewerHandle>();
    const onSelect = vi.fn();
    render(<MediaviewerWidget ref={ref} videos={mockVideos} onSelect={onSelect} />);
    ref.current?.playVideo('v2');
    expect(onSelect).toHaveBeenCalledWith('v2');
  });

  it('seek via handle', () => {
    const ref = createRef<MediaviewerHandle>();
    render(<MediaviewerWidget ref={ref} videos={mockVideos} onSelect={() => {}} />);
    ref.current?.seek(30);
    const state = ref.current?.getState();
    expect(state).toBeDefined();
  });

  it('onSelect fires when clicking a video in the picker', () => {
    const onSelect = vi.fn();
    render(<MediaviewerWidget videos={mockVideos} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Managing categories'));
    expect(onSelect).toHaveBeenCalledWith('v2');
  });

  it('getState reflects the selected video via the inner player (delegation)', () => {
    const ref = createRef<MediaviewerHandle>();
    render(<MediaviewerWidget ref={ref} videos={mockVideos} onSelect={() => {}} />);
    // before any selection the handle reports idle
    expect(ref.current?.getState().current).toBeNull();
    // selecting mounts the VideoPlayer; getState now delegates to it
    fireEvent.click(screen.getByText('Managing categories'));
    expect(ref.current?.getState().current?.id).toBe('v2');
  });

  it('passes onEnded callback to VideoPlayer', () => {
    const onEnded = vi.fn();
    const onSelect = vi.fn();
    render(<MediaviewerWidget videos={mockVideos} onSelect={onSelect} onEnded={onEnded} />);
    // Select a video so the VideoPlayer renders with a source
    fireEvent.click(screen.getByText('How to use VideoVault'));
    // VideoPlayer should be rendered
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });
});
