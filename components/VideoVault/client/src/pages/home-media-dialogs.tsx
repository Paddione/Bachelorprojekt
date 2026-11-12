import { Suspense, lazy } from 'react';
import type { Video } from '@/types/video';
import { VideoPlayerModal } from '@/components/video/video-player-modal';
import { SplitVideoModal, SplitVideoFormValues } from '@/components/video/split-video-modal';
import { SplitVideoResult } from '@/services/video-splitter';
import type { Category } from '@/types/video';
import { HomePlaylist } from './use-home-playlist';

const EditTagsModal = lazy(() =>
  import('@/components/video/edit-tags-modal').then((m) => ({ default: m.EditTagsModal })),
);

export function HomeMediaDialogs({ currentVideo, playerOpen, onClosePlayer, categories,
  onUpdateVideo, onRemoveCategory, onSubmitSplit, onFocusMode, onRescan,
  playlist, onToggleShuffle, editingVideo, editOpen, onCloseEdit, onSaveTags,
  splitTarget, splitOpen, onCloseSplit }: {
  currentVideo: Video | null; playerOpen: boolean; onClosePlayer: () => void;
  categories: Category[]; onUpdateVideo: (id: string, cats: Partial<{ categories: any; customCategories: any }>) => void;
  onRemoveCategory: (id: string, type: string, value: string) => void;
  onSubmitSplit: (f: SplitVideoFormValues) => Promise<SplitVideoResult>;
  onFocusMode: (v: Video) => void; onRescan: () => void;
  playlist: HomePlaylist; onToggleShuffle: () => void;
  editingVideo: Video | null; editOpen: boolean; onCloseEdit: () => void;
  onSaveTags: (id: string, cats: Partial<{ categories: any; customCategories: any }>) => void;
  splitTarget: Video | null; splitOpen: boolean; onCloseSplit: () => void;
}) {
  return (
    <>
      <VideoPlayerModal video={currentVideo} isOpen={playerOpen} onClose={onClosePlayer}
        availableCategories={categories} onUpdateVideo={onUpdateVideo} onRemoveCategory={onRemoveCategory}
        onSplitVideo={onSubmitSplit} onFocusMode={onFocusMode} onRescan={onRescan}
        onPrev={playlist.goPrev} onNext={playlist.goNext}
        shuffleEnabled={playlist.shuffle} onToggleShuffle={onToggleShuffle} />
      <Suspense fallback={null}>
        <EditTagsModal video={editingVideo} isOpen={editOpen} onClose={onCloseEdit}
          onSave={onSaveTags} onRemoveCategory={onRemoveCategory} availableCategories={categories} />
      </Suspense>
      <SplitVideoModal video={splitTarget} isOpen={splitOpen} availableCategories={categories}
        onClose={onCloseSplit} onSubmit={onSubmitSplit} />
    </>
  );
}
