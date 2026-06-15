import { useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useVideoManager } from '@/hooks/use-video-manager';
import { useFocusMode } from '@/hooks/use-focus-mode';
import { useToast } from '@/hooks/use-toast';
import { FocusModeHeader } from '@/components/focus-mode/focus-mode-header';
import { FocusModeContent } from '@/components/focus-mode/focus-mode-content';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useState } from 'react';

export default function FocusModePage() {
  const { t } = useTranslation();
  const params = useParams<{ videoId: string }>();
  const [, setLocation] = useLocation();
  const { state, actions } = useVideoManager();
  const { toast } = useToast();
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | 'exit' | null>(null);

  const focusMode = useFocusMode({
    videos: state.videos,
    filteredVideos: state.filteredVideos,
    availableCategories: state.availableCategories,
    initialVideoId: params.videoId,
    onUpdateCategories: actions.updateVideoCategories,
    onRename: async (videoId, name, applyTo) => {
      const result = await actions.renameVideo(videoId, name, applyTo);
      return result;
    },
  });

  // Sync URL with current video
  useEffect(() => {
    if (focusMode.state.video && focusMode.state.video.id !== params.videoId) {
      setLocation(`/focus/${focusMode.state.video.id}`, { replace: true });
    }
  }, [focusMode.state.video, params.videoId, setLocation]);

  // Handle navigation with dirty state check
  const handleNavigation = useCallback(
    (direction: 'prev' | 'next' | 'exit') => {
      if (focusMode.state.isDirty) {
        setPendingNavigation(direction);
        setShowDirtyDialog(true);
        return;
      }

      if (direction === 'prev') {
        focusMode.goToPrev();
      } else if (direction === 'next') {
        focusMode.goToNext();
      } else {
        setLocation('/');
      }
    },
    [focusMode, setLocation],
  );

  const handleDirtyDialogSave = async () => {
    const result = await focusMode.save();
    if (result.success) {
      setShowDirtyDialog(false);
      if (pendingNavigation === 'prev') {
        focusMode.goToPrev();
      } else if (pendingNavigation === 'next') {
        focusMode.goToNext();
      } else if (pendingNavigation === 'exit') {
        setLocation('/');
      }
      setPendingNavigation(null);
    } else {
      toast({
        title: t('focusMode.saveFailed'),
        description: result.message || t('focusMode.couldNotSave'),
        variant: 'destructive',
      });
    }
  };

  const handleDirtyDialogDiscard = () => {
    focusMode.discard();
    setShowDirtyDialog(false);
    if (pendingNavigation === 'prev') {
      focusMode.goToPrev();
    } else if (pendingNavigation === 'next') {
      focusMode.goToNext();
    } else if (pendingNavigation === 'exit') {
      setLocation('/');
    }
    setPendingNavigation(null);
  };

  const handleSave = async () => {
    const result = await focusMode.save();
    if (result.success) {
      toast({
        title: t('focusMode.saved'),
        description: t('focusMode.savedDesc'),
      });
    } else {
      toast({
        title: t('focusMode.saveFailed'),
        description: result.message || t('focusMode.couldNotSave'),
        variant: 'destructive',
      });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault();
          handleNavigation('prev');
          break;
        case 'k':
          e.preventDefault();
          handleNavigation('next');
          break;
        case 'escape':
          e.preventDefault();
          handleNavigation('exit');
          break;
        case 'g':
          e.preventDefault();
          focusMode.generateNameFromCategories();
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            void handleSave();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, handleNavigation, handleSave]);

  // Redirect if video not found
  useEffect(() => {
    if (params.videoId && state.videos.length > 0 && !focusMode.state.video) {
      toast({
        title: t('focusMode.videoNotFound'),
        description: t('focusMode.videoNotFoundDesc'),
        variant: 'destructive',
      });
      setLocation('/');
    }
  }, [params.videoId, state.videos.length, focusMode.state.video, setLocation, toast]);

  if (!focusMode.state.video) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <FocusModeHeader
        video={focusMode.state.video}
        displayName={focusMode.state.pendingDisplayName}
        onDisplayNameChange={focusMode.setDisplayName}
        currentIndex={focusMode.currentIndex}
        totalCount={focusMode.totalCount}
        canGoPrev={focusMode.canGoPrev}
        canGoNext={focusMode.canGoNext}
        onPrev={() => handleNavigation('prev')}
        onNext={() => handleNavigation('next')}
        onBack={() => handleNavigation('exit')}
        onSave={handleSave}
        isDirty={focusMode.state.isDirty}
        isLoading={focusMode.state.isLoading}
      />

      <FocusModeContent
        video={focusMode.state.video}
        pendingCategories={focusMode.state.pendingCategories}
        pendingCustomCategories={focusMode.state.pendingCustomCategories}
        pendingDisplayName={focusMode.state.pendingDisplayName}
        pendingFilename={focusMode.state.pendingFilename}
        availableCategories={state.availableCategories}
        onAddCategory={focusMode.addCategory}
        onRemoveCategory={focusMode.removeCategory}
        onSetDisplayName={focusMode.setDisplayName}
        onSetFilename={focusMode.setFilename}
        onGenerateName={focusMode.generateNameFromCategories}
        getAvailableValuesForType={focusMode.getAvailableValuesForType}
        getPopularValuesForType={focusMode.getPopularValuesForType}
        error={focusMode.state.error}
      />

      <AlertDialog open={showDirtyDialog} onOpenChange={setShowDirtyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('focusMode.unsavedChanges')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('focusMode.unsavedChangesDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDirtyDialog(false);
              setPendingNavigation(null);
            }}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDirtyDialogDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.discard')}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => void handleDirtyDialogSave()}>
              {t('common.save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
