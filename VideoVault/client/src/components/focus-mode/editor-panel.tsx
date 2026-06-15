import { Video, VideoCategories, CustomCategories, Category } from '@/types/video';
import { RenameSection } from './rename-section';
import { CategoryGroupsSection } from './category-groups-section';
import { CustomCategoriesSection } from './custom-categories-section';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface EditorPanelProps {
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

export function EditorPanel({
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
}: EditorPanelProps) {
  return (
    <div className="p-4 space-y-6">
      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Rename section */}
      <RenameSection
        video={video}
        pendingDisplayName={pendingDisplayName}
        pendingFilename={pendingFilename}
        onSetDisplayName={onSetDisplayName}
        onSetFilename={onSetFilename}
        onGenerateName={onGenerateName}
      />

      {/* Category groups */}
      <CategoryGroupsSection
        pendingCategories={pendingCategories}
        availableCategories={availableCategories}
        onAddCategory={onAddCategory}
        onRemoveCategory={onRemoveCategory}
        getAvailableValuesForType={getAvailableValuesForType}
        getPopularValuesForType={getPopularValuesForType}
      />

      {/* Custom categories */}
      <CustomCategoriesSection
        pendingCustomCategories={pendingCustomCategories}
        availableCategories={availableCategories}
        onAddCategory={onAddCategory}
        onRemoveCategory={onRemoveCategory}
        getAvailableValuesForType={getAvailableValuesForType}
        getPopularValuesForType={getPopularValuesForType}
      />
    </div>
  );
}
