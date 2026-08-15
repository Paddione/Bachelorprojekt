import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Video, VideoCategories, CustomCategories, Category } from '@/types/video';
import { VideoTagsEditor } from './video-tags-editor';
import { CategoryExtractor } from '@/services/category-extractor';

interface EditTagsModalProps {
  video: Video | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    videoId: string,
    categories: Partial<{ categories: VideoCategories; customCategories: CustomCategories }>,
  ) => void;
  onRemoveCategory: (videoId: string, categoryType: string, categoryValue: string) => void;
  availableCategories: Category[];
}

export function EditTagsModal({
  video,
  isOpen,
  onClose,
  onSave,
  onRemoveCategory,
  availableCategories,
}: EditTagsModalProps) {
  const suggestions = useMemo(
    () => (video ? CategoryExtractor.getSuggestions(video.filename, video.path) : undefined),
    [video?.filename, video?.path],
  );

  if (!video) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle data-testid="title-edit-tags">Edit Video Categories</DialogTitle>
          <DialogDescription className="sr-only">
            Add, remove, and manage standard and custom categories
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-1">
          <VideoTagsEditor
            video={video}
            availableCategories={availableCategories}
            onSave={(id, cats) => {
              onSave(id, cats);
              onClose();
            }}
            onRemoveCategory={onRemoveCategory}
            suggestions={suggestions}
            onCancel={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
