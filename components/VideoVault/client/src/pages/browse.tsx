import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Film, Folder, HardDrive, ArrowLeft, ChevronRight, Loader2, Play, Library as LibraryIcon } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { VideoPlayerModal } from '@/components/video/video-player-modal';
import { useBrowse, UseBrowse } from './use-browse';
import { BrowseEntry, formatDate, formatSize, pathPartsOf } from './browse-queries';

function Breadcrumb({ b }: { b: UseBrowse }) {
  const { t } = useTranslation();
  const parts = pathPartsOf(b.currentPath);
  return (
    <nav className="mt-3 flex items-center gap-1 text-sm flex-wrap" aria-label="Breadcrumb">
      <button onClick={b.goRoot} className="text-primary hover:underline font-medium">{t('browse.root')}</button>
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <button onClick={() => b.navigateToBreadcrumb(i)}
            className={i === parts.length - 1 ? 'text-foreground font-medium' : 'text-primary hover:underline'}>{part}</button>
        </span>
      ))}
    </nav>
  );
}

function EntryIcon({ entry }: { entry: BrowseEntry }) {
  if (entry.type === 'directory') return <Folder className="h-8 w-8 text-primary/80" />;
  if (entry.isVideo) return <Film className="h-8 w-8 text-cyan-400/80" />;
  return (
    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
      {entry.name.split('.').pop()?.toUpperCase() || '?'}
    </div>
  );
}

function EntryCard({ entry, processing, onOpen, onPlay, onImport }: {
  entry: BrowseEntry; processing: boolean; onOpen: () => void; onPlay: () => void; onImport: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card onClick={onOpen}
      className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${entry.type === 'directory' ? 'border-primary/20' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0"><EntryIcon entry={entry} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" title={entry.name}>{entry.name}</p>
          <div className="flex items-center gap-2 mt-1">
            {entry.size != null && <span className="text-xs text-muted-foreground">{formatSize(entry.size)}</span>}
            {entry.modified && <span className="text-xs text-muted-foreground">{formatDate(entry.modified)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {entry.isVideo && (
            <>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={t('actions.play')} onClick={onPlay}>
                <Play className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={t('browse.importToLibrary')}
                disabled={processing} onClick={onImport}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LibraryIcon className="h-4 w-4" />}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function BrowseBody({ b }: { b: UseBrowse }) {
  const { t } = useTranslation();
  if (b.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (b.error) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive mb-4">{b.error}</p>
        <Button onClick={() => void b.fetchDirectory(b.currentPath)}>{t('common.retry')}</Button>
      </div>
    );
  }
  if (b.entries.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Folder className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p>{t('browse.directoryEmpty')}</p>
      </div>
    );
  }
  const dirs = b.entries.filter((e) => e.type === 'directory').length;
  const others = b.entries.filter((e) => e.type === 'file' && !e.isVideo).length;
  return (
    <>
      <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
        <span>{dirs} {t('browse.folders')}</span>
        <span>{b.videoEntries.length} {t('browse.videos')}</span>
        <span>{others} {t('browse.otherFiles')}</span>
      </div>
      {b.currentPath && (
        <button onClick={b.navigateUp}
          className="flex items-center gap-2 p-3 mb-2 w-full rounded-lg hover:bg-muted/50 text-left text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /><span>..</span>
        </button>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {b.entries.map((entry) => (
          <EntryCard key={entry.name} entry={entry} processing={b.processingFile === entry.name}
            onOpen={() => {
              if (entry.type === 'directory') b.navigateTo(entry.name);
              else if (entry.isVideo) b.playVideo(entry);
            }}
            onPlay={() => b.playVideo(entry)} onImport={() => void b.handleImportToLibrary(entry)} />
        ))}
      </div>
    </>
  );
}

export default function BrowsePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const b = useBrowse((kind, name, msg) => {
    if (kind === 'queued') {
      toast({ title: t('browse.processingQueued'), description: t('browse.processingQueuedDesc', { name }) });
    } else {
      toast({ title: t('browse.importFailed'), description: msg, variant: 'destructive' });
    }
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="videovault-header sticky top-0 z-100">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="min-h-[40px]">
                <ArrowLeft className="mr-2 h-4 w-4" />{t('common.back')}
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <HardDrive className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">{t('browse.title')}</h1>
            </div>
          </div>
        </div>
        <Breadcrumb b={b} />
      </header>
      <main className="p-4 max-w-7xl mx-auto">
        <BrowseBody b={b} />
      </main>
      <VideoPlayerModal video={b.playerVideo} isOpen={b.isPlayerOpen} onClose={b.closePlayer}
        onPrev={b.currentVideoIndex > 0 ? () => b.step(-1) : undefined}
        onNext={b.currentVideoIndex < b.videoEntries.length - 1 ? () => b.step(1) : undefined} />
    </div>
  );
}
