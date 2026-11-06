import type { Audiobook } from '@/types/media';
import { cn } from '@/lib/utils';
import { formatPlayerTime } from './use-audiobook-player';

interface Props {
  audiobook: Audiobook;
  currentChapterIndex: number;
  onSelect: (index: number) => void;
}

export function PlayerChapterList({ audiobook, currentChapterIndex, onSelect }: Props) {
  return (
    <div className="max-h-48 overflow-auto border-b bg-muted/50">
      {audiobook.chapters.map((chapter, index) => (
        <button
          key={chapter.index}
          onClick={() => onSelect(index)}
          className={cn(
            'w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors flex justify-between items-center',
            index === currentChapterIndex && 'bg-primary/10 text-primary',
          )}
        >
          <span className="truncate">{chapter.title}</span>
          <span className="text-xs text-muted-foreground ml-2">{formatPlayerTime(chapter.duration)}</span>
        </button>
      ))}
    </div>
  );
}
