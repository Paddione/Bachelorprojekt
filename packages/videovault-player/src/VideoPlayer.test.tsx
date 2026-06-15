import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { VideoPlayer } from './VideoPlayer';
import type { VideoSource } from './types';

const mockSource: VideoSource = {
  id: 'v1',
  url: 'https://example.com/video.mp4',
  title: 'Test Video',
  duration: 120,
};

describe('VideoPlayer', () => {
  it('renders <video> with source URL', () => {
    render(<VideoPlayer source={mockSource} />);
    const video = screen.getByTestId('video-player') as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video.src).toContain('example.com/video.mp4');
  });

  it('shows title of the current source', () => {
    render(<VideoPlayer source={mockSource} />);
    expect(screen.getByTestId('text-video-title')).toHaveTextContent('Test Video');
  });

  it('renders nothing when source is null', () => {
    const { container } = render(<VideoPlayer source={null} />);
    expect(container.innerHTML).toBe('');
  });
});
