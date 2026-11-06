import { Button } from '@/components/ui/button';
import { Video } from '@/types/video';
import { ArrowLeft, ArrowRight, Copy, Check, FileVideo, Clock, Monitor, Save } from 'lucide-react';
import { DraftCategories } from './use-draft-categories';
import { CompletionRing } from './categorize-widgets';
import { buildAssignedByType, completionOf, formatFileSize, formatTime } from './categorize-queries';

function NavButtons({ onPrev, onNext, atStart, atEnd }: {
  onPrev: () => void; onNext: () => void; atStart: boolean; atEnd: boolean;
}) {
  return (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" onClick={onPrev} disabled={atStart} title="Previous (Left arrow)">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onNext} disabled={atEnd} title="Next (Right arrow)">
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function TopBar({ video, index, total, draft, copied, saved, prevName, onBack, onSave, onCopy, onPrev, onNext }: {
  video: Video; index: number; total: number; draft: DraftCategories;
  copied: boolean; saved: boolean; prevName: string | null;
  onBack: () => void; onSave: () => void; onCopy: () => void; onPrev: () => void; onNext: () => void;
}) {
  const stats = completionOf(buildAssignedByType(draft.categories, draft.customCategories));
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-card/80 backdrop-blur-sm shrink-0">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" />Library
      </Button>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-medium truncate">{video.displayName}</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(video.metadata?.duration || 0)}</span>
          <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />{video.metadata?.width}x{video.metadata?.height}</span>
          <span className="flex items-center gap-1"><FileVideo className="h-3 w-3" />{formatFileSize(video.size)}</span>
          <span>{index + 1} / {total}</span>
        </div>
      </div>
      <CompletionRing filled={stats.filled} total={stats.total} />
      <Button variant={draft.isDirty ? 'default' : 'outline'} size="sm" onClick={onSave} disabled={!draft.isDirty}
        className={`text-xs gap-1.5 transition-colors ${saved ? 'bg-green-500/20 border-green-500/50 text-green-400' : ''} ${draft.isDirty ? 'shadow-glow-cyan' : ''}`}
        title="Save changes (Ctrl+S)">
        {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {saved ? 'Saved' : draft.isDirty ? 'Save' : 'Saved'}
      </Button>
      {prevName && (
        <Button variant="outline" size="sm" onClick={onCopy} title={`Copy categories from: ${prevName}`}
          className={`text-xs gap-1.5 transition-colors ${copied ? 'bg-green-500/20 border-green-500/50 text-green-400' : ''}`}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy prev'}
        </Button>
      )}
      <NavButtons onPrev={onPrev} onNext={onNext} atStart={index <= 0} atEnd={index >= total - 1} />
    </div>
  );
}

