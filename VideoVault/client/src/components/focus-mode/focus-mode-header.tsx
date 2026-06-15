import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Video } from '@/types/video';
import { ArrowLeft, ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react';

interface FocusModeHeaderProps {
  video: Video;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  currentIndex: number;
  totalCount: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  onSave: () => void;
  isDirty: boolean;
  isLoading: boolean;
}

export function FocusModeHeader({
  video,
  displayName,
  onDisplayNameChange,
  currentIndex,
  totalCount,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onBack,
  onSave,
  isDirty,
  isLoading,
}: FocusModeHeaderProps) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex items-center justify-between h-14 px-4 gap-4">
        {/* Left: Back button */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>

        {/* Center: Editable title */}
        <div className="flex-1 min-w-0 max-w-xl">
          <Input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            className="text-center font-medium border-transparent hover:border-input focus:border-input bg-transparent"
            placeholder="Video title"
            data-testid="input-display-name"
          />
        </div>

        {/* Right: Navigation and save */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrev}
              disabled={!canGoPrev}
              title="Previous video (J)"
              data-testid="button-prev"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <span className="text-sm text-muted-foreground min-w-[60px] text-center">
              {totalCount > 0 ? `${currentIndex + 1} / ${totalCount}` : '-'}
            </span>

            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!canGoNext}
              title="Next video (K)"
              data-testid="button-next"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Save button */}
          <Button
            onClick={onSave}
            disabled={!isDirty || isLoading}
            size="sm"
            className="gap-1"
            data-testid="button-save"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
