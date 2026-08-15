import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Category, Video } from '@/types/video';
import { SplitVideoResult } from '@/services/video-splitter';
import { Scissors } from 'lucide-react';
import { VideoSplitter, SplitVideoFormValues } from './video-splitter';

// Re-export type for consumers
export type { SplitVideoFormValues };

interface SplitVideoModalProps {
  video: Video | null;
  availableCategories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: SplitVideoFormValues) => Promise<SplitVideoResult>;
}

export function SplitVideoModal({
  video,
  availableCategories,
  isOpen,
  onClose,
  onSubmit,
}: SplitVideoModalProps) {
  if (!video) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Split video into two parts
          </DialogTitle>
          <DialogDescription>
            Choose where to cut <strong>{video.displayName}</strong>. The original file stays
            intact; two new files will be created with the names and tags you set below.
          </DialogDescription>
        </DialogHeader>

        <VideoSplitter
          video={video}
          availableCategories={availableCategories}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
