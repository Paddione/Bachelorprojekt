import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Video } from '@/types/video';
import { buildNameFromCategories } from '@/services/rename-engine';

interface RenameModalProps {
  video: Video | null;
  isOpen: boolean;
  applyTo?: 'displayName' | 'filename' | 'both';
  onClose: () => void;
  onSubmit: (
    videoId: string,
    newBaseName: string,
    applyTo: 'displayName' | 'filename' | 'both',
  ) => Promise<{ success: boolean; message?: string }>;
}

export function RenameModal({
  video,
  isOpen,
  applyTo = 'both',
  onClose,
  onSubmit,
}: RenameModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (video) {
      setName(video.displayName);
      setError(undefined);
    }
  }, [video?.id]);

  if (!video) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('rename.emptyError'));
      return;
    }
    setIsSubmitting(true);
    const result = await onSubmit(video.id, name.trim(), applyTo);
    setIsSubmitting(false);
    if (!result.success && result.message) {
      setError(result.message);
      return;
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rename.title')}</DialogTitle>
          <DialogDescription>
            {t('rename.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('rename.placeholder')}
            data-testid="input-rename"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setName(buildNameFromCategories(video))}
              data-testid="button-name-from-categories"
            >
              {t('rename.fromCategories')}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSubmitting}
            data-testid="button-rename-submit"
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
