import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tags,
  Edit3,
  FolderPlus,
  Trash2,
  X,
  MoreHorizontal,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Video } from '@/types/video';

interface BulkOperationsToolbarProps {
  selectedVideos: Video[];
  onClearSelection: () => void;
  onBulkAddCategory: (videos: Video[]) => void;
  onBulkRemoveCategory: (videos: Video[]) => void;
  onBulkRename: (videos: Video[]) => void;
  onBulkMove: (videos: Video[]) => void;
  onBulkDelete: (videos: Video[]) => void;
}

export function BulkOperationsToolbar({
  selectedVideos,
  onClearSelection,
  onBulkAddCategory,
  onBulkRemoveCategory,
  onBulkRename,
  onBulkMove,
  onBulkDelete,
}: BulkOperationsToolbarProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const selectedCount = selectedVideos.length;
  const totalSize = selectedVideos.reduce((sum, video) => sum + video.size, 0);
  const totalDuration = selectedVideos.reduce(
    (sum, video) => sum + (video.metadata?.duration || 0),
    0,
  );

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const handleBulkDelete = () => {
    if (showConfirmDelete) {
      onBulkDelete(selectedVideos);
      setShowConfirmDelete(false);
    } else {
      setShowConfirmDelete(true);
    }
  };

  const handleSelectAll = () => {
    // This would need to be implemented in the parent component
    // to select all visible videos
  };

  const handleDeselectAll = () => {
    onClearSelection();
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-50">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Selection Info */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">
                {selectedCount} video{selectedCount !== 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>Total size: {formatFileSize(totalSize)}</span>
              <span>Total duration: {formatDuration(totalDuration)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {/* Quick Actions */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkAddCategory(selectedVideos)}
              data-testid="button-bulk-add-category"
            >
              <Tags className="h-4 w-4 mr-2" />
              Add Tags
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkRename(selectedVideos)}
              data-testid="button-bulk-rename"
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Rename
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkMove(selectedVideos)}
              data-testid="button-bulk-move"
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Move
            </Button>

            {/* More Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4 mr-2" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Bulk Operations</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => onBulkAddCategory(selectedVideos)}>
                  <Tags className="h-4 w-4 mr-2" />
                  Add Categories
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => onBulkRemoveCategory(selectedVideos)}>
                  <Tags className="h-4 w-4 mr-2" />
                  Remove Categories
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => onBulkRename(selectedVideos)}>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Batch Rename
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => onBulkMove(selectedVideos)}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Move to Folder
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={handleBulkDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {showConfirmDelete ? 'Click again to confirm' : 'Delete Videos'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Selection Controls */}
            <div className="h-6 w-px bg-border" />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              data-testid="button-select-all"
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              Select All
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeselectAll}
              data-testid="button-deselect-all"
            >
              <Square className="h-4 w-4 mr-2" />
              Clear
            </Button>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              data-testid="button-close-selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Confirmation Bar for Delete */}
        {showConfirmDelete && (
          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive font-medium">
                  Are you sure you want to delete {selectedCount} video
                  {selectedCount !== 1 ? 's' : ''}?
                </span>
                <span className="text-xs text-destructive/70">
                  You will have a brief window to undo after deleting.
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" onClick={() => setShowConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                  Delete {selectedCount} Video{selectedCount !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
