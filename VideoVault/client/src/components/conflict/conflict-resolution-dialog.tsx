import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

export type ConflictStrategy = 'overwrite' | 'skip' | 'keep_both';

export interface ConflictItem {
  id: string;
  operation: 'rename' | 'move';
  currentName: string;
  desiredFileName: string;
  location?: string;
}

interface ConflictResolutionDialogProps {
  open: boolean;
  items: ConflictItem[];
  onClose: () => void;
  onResolve: (decisions: Record<string, ConflictStrategy>) => void;
  defaultStrategy?: ConflictStrategy;
}

const getKeepBothPreview = (fileName: string): string => {
  const dotIdx = fileName.lastIndexOf('.');
  const base = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext = dotIdx > 0 ? fileName.slice(dotIdx) : '';
  return `${base} (1)${ext}`;
};

export function ConflictResolutionDialog({
  open,
  items,
  onClose,
  onResolve,
  defaultStrategy = 'keep_both',
}: ConflictResolutionDialogProps) {
  const initialChoices = useMemo(() => {
    const choiceMap: Record<string, ConflictStrategy> = {};
    items.forEach((item) => {
      choiceMap[item.id] = defaultStrategy;
    });
    return choiceMap;
  }, [items, defaultStrategy]);
  const [choices, setChoices] = useState<Record<string, ConflictStrategy>>(initialChoices);
  const [applyToAll, setApplyToAll] = useState(items.length > 1);

  useEffect(() => {
    setChoices(initialChoices);
    setApplyToAll(items.length > 1);
  }, [items, initialChoices]);

  const updateChoice = (id: string, strategy: ConflictStrategy) => {
    if (applyToAll) {
      const updated: Record<string, ConflictStrategy> = {};
      items.forEach((item) => {
        updated[item.id] = strategy;
      });
      setChoices(updated);
      return;
    }
    setChoices((prev) => ({ ...prev, [id]: strategy }));
  };

  const effectiveChoices = useMemo(() => {
    if (!applyToAll) return choices;
    const first = items[0];
    if (!first) return choices;
    const firstChoice = choices[first.id] ?? defaultStrategy;
    const mapped: Record<string, ConflictStrategy> = {};
    items.forEach((item) => {
      mapped[item.id] = firstChoice;
    });
    return mapped;
  }, [applyToAll, choices, items, defaultStrategy]);

  const handleResolve = () => {
    onResolve(effectiveChoices);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Resolve file conflicts</DialogTitle>
          <DialogDescription>
            Choose how to handle files that already exist. You can apply one choice to all or set
            per-item decisions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="apply-to-all"
              checked={applyToAll}
              onCheckedChange={(checked) => setApplyToAll(Boolean(checked))}
            />
            <label htmlFor="apply-to-all" className="cursor-pointer">
              Apply selection to all conflicts
            </label>
          </div>
          <div className="text-xs text-muted-foreground">
            Options: keep both (rename), overwrite existing, or skip the item.
          </div>
        </div>

        <ScrollArea className="max-h-[360px] pr-4">
          <div className="space-y-3">
            {items.map((item) => {
              const strategy = effectiveChoices[item.id] ?? defaultStrategy;
              return (
                <div
                  key={item.id}
                  className="rounded-md border bg-card px-4 py-3 shadow-sm flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Badge variant="secondary">{item.operation === 'rename' ? 'Rename' : 'Move'}</Badge>
                        <span className="truncate max-w-[320px]" title={item.currentName}>
                          {item.currentName}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-x-2">
                        <span>Target:</span>
                        <span className="font-mono">{item.desiredFileName}</span>
                        {item.location && <span className="text-muted-foreground">in {item.location}</span>}
                      </div>
                      {strategy === 'keep_both' && (
                        <div className="text-xs text-emerald-600 dark:text-emerald-400">
                          Will save as <span className="font-mono">{getKeepBothPreview(item.desiredFileName)}</span>
                        </div>
                      )}
                    </div>

                    <div className="w-48">
                      <Select
                        value={strategy}
                        onValueChange={(val) => updateChoice(item.id, val as ConflictStrategy)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keep_both">Keep both (rename new file)</SelectItem>
                          <SelectItem value="overwrite">Overwrite existing</SelectItem>
                          <SelectItem value="skip">Skip this item</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleResolve} data-testid="button-resolve-conflicts">
            Apply choices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
