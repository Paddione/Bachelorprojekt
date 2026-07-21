import { Dispatch, SetStateAction } from 'react';
import { VideoManagerState } from '../types/video';
import { useVideoCrud } from './use-video-crud';
import { useVideoBatch } from './use-video-batch';

export function useVideoProcessing(
  state: VideoManagerState,
  setState: Dispatch<SetStateAction<VideoManagerState>>,
  pendingDeleteFinalizers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>
) {
  const crud = useVideoCrud(state, setState, pendingDeleteFinalizers);
  const batch = useVideoBatch(state, setState, pendingDeleteFinalizers);

  return {
    ...crud,
    ...batch,
  };
}
