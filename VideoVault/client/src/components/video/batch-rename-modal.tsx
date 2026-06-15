import { useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Video } from '@/types/video';
import {
  BatchRenameOptions,
  buildBatchName,
  getFilenameWithOriginalExt,
} from '@/services/rename-engine';

interface BatchRenameModalProps {
  videos: Video[];
  selectedIds: string[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (videoIds: string[], options: BatchRenameOptions) => Promise<number>;
}

export function BatchRenameModal({
  videos,
  selectedIds,
  isOpen,
  onClose,
  onSubmit,
}: BatchRenameModalProps) {
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [startIndex, setStartIndex] = useState(1);
  const [padDigits, setPadDigits] = useState(2);
  const [transform, setTransform] = useState<'none' | 'lower' | 'upper' | 'title'>('none');
  const [applyTo, setApplyTo] = useState<'displayName' | 'filename' | 'both'>('both');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedVideos = useMemo(
    () => selectedIds.map((id) => videos.find((v) => v.id === id)).filter(Boolean) as Video[],
    [selectedIds.join(','), videos.length],
  );

  const preview = useMemo(() => {
    const options: BatchRenameOptions = {
      prefix,
      suffix,
      startIndex,
      padDigits,
      transform,
      applyTo,
    };
    return selectedVideos.slice(0, 5).map((v, idx) => {
      const base = buildBatchName(v, idx, options);
      const newDisplayName = applyTo === 'filename' ? v.displayName : base;
      const newFilename =
        applyTo === 'displayName' ? v.filename : getFilenameWithOriginalExt(base, v.filename);
      return {
        id: v.id,
        from: `${v.displayName} (${v.filename})`,
        to: `${newDisplayName} (${newFilename})`,
      };
    });
  }, [selectedVideos, prefix, suffix, startIndex, padDigits, transform, applyTo]);

  const handleSubmit = () => {
    setIsSubmitting(true);
    void onSubmit(selectedIds, { prefix, suffix, startIndex, padDigits, transform, applyTo }).then(
      () => {
        setIsSubmitting(false);
        onClose();
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batch Rename</DialogTitle>
          <DialogDescription>
            Build new names for the selected videos. Disk rename will be attempted where supported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Prefix (optional)"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
            <Input
              placeholder="Suffix (optional)"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              type="number"
              value={startIndex}
              onChange={(e) => setStartIndex(parseInt(e.target.value || '1', 10))}
              placeholder="Start Index"
            />
            <Input
              type="number"
              value={padDigits}
              onChange={(e) => setPadDigits(parseInt(e.target.value || '2', 10))}
              placeholder="Pad Digits"
            />
            <Select
              value={transform}
              onValueChange={(v) => setTransform(v as 'none' | 'lower' | 'upper' | 'title')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Transform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="lower">lowercase</SelectItem>
                <SelectItem value="upper">UPPERCASE</SelectItem>
                <SelectItem value="title">Title Case</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select
              value={applyTo}
              onValueChange={(v) => setApplyTo(v as 'displayName' | 'filename' | 'both')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Apply To" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Display name and file name</SelectItem>
                <SelectItem value="displayName">Display name only</SelectItem>
                <SelectItem value="filename">File name only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preview.length > 0 && (
            <div className="rounded border p-3 text-sm">
              <div className="font-medium mb-2">Preview (first {preview.length}):</div>
              <ul className="space-y-1">
                {preview.map((item) => (
                  <li key={item.id}>
                    <span className="text-muted-foreground">{item.from}</span>
                    <span className="mx-2">→</span>
                    <span className="text-foreground">{item.to}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedIds.length === 0}
            data-testid="button-batch-rename-submit"
          >
            Rename {selectedIds.length} file(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
