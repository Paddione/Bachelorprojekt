import { Video, VideoCategories, CustomCategories, Category } from '@/types/video';
import { VideoPreviewSection } from './video-preview-section';
import { EditorPanel } from './editor-panel';

interface FocusModeContentProps {
  video: Video;
  pendingCategories: VideoCategories;
  pendingCustomCategories: CustomCategories;
  pendingDisplayName: string;
  pendingFilename: string;
  availableCategories: Category[];
  onAddCategory: (type: string, value: string, isCustom?: boolean) => void;
  onRemoveCategory: (type: string, value: string, isCustom?: boolean) => void;
  onSetDisplayName: (name: string) => void;
  onSetFilename: (name: string) => void;
  onGenerateName: () => void;
  getAvailableValuesForType: (type: string, isCustom?: boolean) => string[];
  getPopularValuesForType: (type: string, isCustom?: boolean) => string[];
  error: string | null;
}

export function FocusModeContent({
  video,
  pendingCategories,
  pendingCustomCategories,
  pendingDisplayName,
  pendingFilename,
  availableCategories,
  onAddCategory,
  onRemoveCategory,
  onSetDisplayName,
  onSetFilename,
  onGenerateName,
  getAvailableValuesForType,
  getPopularValuesForType,
  error,
}: FocusModeContentProps) {
  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Left: Video preview - takes more space on desktop */}
      <div className="md:flex-1 md:min-w-0 flex flex-col">
        <VideoPreviewSection video={video} />
      </div>

      {/* Right: Editor panel - fixed width on desktop, full width on mobile */}
      <div className="md:w-[420px] lg:w-[480px] border-t md:border-t-0 md:border-l overflow-y-auto bg-muted/30">
        <EditorPanel
          video={video}
          pendingCategories={pendingCategories}
          pendingCustomCategories={pendingCustomCategories}
          pendingDisplayName={pendingDisplayName}
          pendingFilename={pendingFilename}
          availableCategories={availableCategories}
          onAddCategory={onAddCategory}
          onRemoveCategory={onRemoveCategory}
          onSetDisplayName={onSetDisplayName}
          onSetFilename={onSetFilename}
          onGenerateName={onGenerateName}
          getAvailableValuesForType={getAvailableValuesForType}
          getPopularValuesForType={getPopularValuesForType}
          error={error}
        />
      </div>
    </div>
  );
}
