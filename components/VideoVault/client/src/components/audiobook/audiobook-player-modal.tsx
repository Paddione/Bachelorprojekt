import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Audiobook } from '@/types/media';
import { List, Volume2, User, Mic } from 'lucide-react';
import { useAudiobookPlayer } from './use-audiobook-player';
import { PlayerChapterList } from './player-chapter-list';
import { PlayerControls } from './player-controls';

interface AudiobookPlayerModalProps {
  audiobook: Audiobook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProgressUpdate?: (chapterIndex: number, position: number) => void;
  getAudioUrl?: (chapterPath: string) => string | null;
}

export function AudiobookPlayerModal({ audiobook, open, onOpenChange, onProgressUpdate, getAudioUrl }: AudiobookPlayerModalProps) {
  const player = useAudiobookPlayer({ audiobook, open, onProgressUpdate, getAudioUrl });

  if (!audiobook) return null;

  const handleClose = () => {
    if (player.currentTime > 0) onProgressUpdate?.(player.currentChapterIndex, player.currentTime);
    player.setIsPlaying(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[500px] p-0">
        <audio ref={player.audioRef} preload="metadata" />
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-start gap-3">
            <div className="w-16 h-16 rounded bg-gradient-to-br from-purple-900/50 to-indigo-900/50 flex-shrink-0 overflow-hidden">
              {audiobook.coverImage ? (
                <img src={audiobook.coverImage} alt={audiobook.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Volume2 className="h-8 w-8 text-purple-300" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-medium truncate">{audiobook.title}</DialogTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />{audiobook.author}
              </p>
              {audiobook.metadata.narrator && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mic className="h-3 w-3" />{audiobook.metadata.narrator}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => player.setShowChapterList(!player.showChapterList)} title="Chapter list">
              <List className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        {player.showChapterList && (
          <PlayerChapterList audiobook={audiobook} currentChapterIndex={player.currentChapterIndex} onSelect={player.goToChapter} />
        )}
        <div className="p-4 space-y-4">
          <div className="text-center">
            <p className="text-sm font-medium">{player.currentChapter?.title || 'Loading...'}</p>
            <p className="text-xs text-muted-foreground">Chapter {player.currentChapterIndex + 1} of {audiobook.chapters.length}</p>
          </div>
          <PlayerControls
            isPlaying={player.isPlaying} isLoading={player.isLoading}
            currentTime={player.currentTime} duration={player.duration}
            currentChapterIndex={player.currentChapterIndex} totalChapters={audiobook.chapters.length}
            volume={player.volume} setVolume={player.setVolume}
            isMuted={player.isMuted} setIsMuted={player.setIsMuted}
            playbackSpeed={player.playbackSpeed} onCycleSpeed={player.cyclePlaybackSpeed}
            onToggle={player.togglePlayPause} onSeek={player.seekTo} onSkip={player.skip}
            onGoToChapter={player.goToChapter}
          />
          <div className="pt-2 border-t">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Overall Progress</span>
              <span>{Math.round(player.overallProgress)}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${player.overallProgress}%` }} />
            </div>
          </div>
          {player.error && <div className="text-center text-sm text-red-500 py-2">{player.error}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
