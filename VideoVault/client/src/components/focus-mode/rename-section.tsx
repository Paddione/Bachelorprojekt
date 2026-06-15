import { Video } from '@/types/video';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wand2 } from 'lucide-react';

interface RenameSectionProps {
  video: Video;
  pendingDisplayName: string;
  pendingFilename: string;
  onSetDisplayName: (name: string) => void;
  onSetFilename: (name: string) => void;
  onGenerateName: () => void;
}

export function RenameSection({
  video,
  pendingDisplayName,
  pendingFilename,
  onSetDisplayName,
  onSetFilename,
  onGenerateName,
}: RenameSectionProps) {
  // Extract the extension from the current filename
  const originalExt = video.filename.match(/\.[^./\\]+$/)?.[0] || '';
  const filenameBase = pendingFilename.replace(/\.[^./\\]+$/, '');

  const handleFilenameChange = (value: string) => {
    // Always preserve the original extension
    onSetFilename(value + originalExt);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Rename</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onGenerateName}
          className="gap-1"
          title="Generate name from categories (G)"
          data-testid="button-generate-name"
        >
          <Wand2 className="h-3 w-3" />
          Generate
        </Button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="displayName" className="text-xs text-muted-foreground">
            Display Name
          </Label>
          <Input
            id="displayName"
            value={pendingDisplayName}
            onChange={(e) => onSetDisplayName(e.target.value)}
            placeholder="Enter display name"
            data-testid="input-display-name-edit"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filename" className="text-xs text-muted-foreground">
            Filename
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id="filename"
              value={filenameBase}
              onChange={(e) => handleFilenameChange(e.target.value)}
              placeholder="Enter filename"
              className="flex-1"
              data-testid="input-filename-edit"
            />
            <span className="text-sm text-muted-foreground flex-shrink-0">{originalExt}</span>
          </div>
        </div>

        {/* Preview of file path */}
        <div className="text-xs text-muted-foreground break-all">
          <span className="font-medium">Path: </span>
          {video.path}
        </div>
      </div>
    </div>
  );
}
