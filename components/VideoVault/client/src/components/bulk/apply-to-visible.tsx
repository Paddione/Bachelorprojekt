import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tags } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Category } from '@/types/video';

const CATEGORY_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality', 'performer'];

interface ApplyToVisibleProps {
  filteredCount: number;
  onApply: (type: string, value: string, mode: 'add' | 'remove') => void;
  availableCategories: Category[];
}

export function ApplyToVisible({ filteredCount, onApply, availableCategories }: ApplyToVisibleProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [type, setType] = useState('');
  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const existingValues = availableCategories
    .filter((c) => c.type === type && !c.isCustom)
    .map((c) => c.value)
    .slice(0, 20);

  const handleApply = () => {
    if (!type || !value.trim()) return;
    if (filteredCount > 50) {
      setConfirmOpen(true);
    } else {
      doApply();
    }
  };

  const doApply = () => {
    onApply(type, value.trim().toLowerCase(), mode);
    setOpen(false);
    setType('');
    setValue('');
    setConfirmOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={filteredCount === 0}>
            <Tags className="h-4 w-4 mr-1" />
            Apply to Visible
            {filteredCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{filteredCount}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          <div className="flex gap-1">
            <Button
              variant={mode === 'add' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('add')}
              className="flex-1"
            >
              Add
            </Button>
            <Button
              variant={mode === 'remove' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setMode('remove')}
              className="flex-1"
            >
              Remove
            </Button>
          </div>

          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Category type..." />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div>
            <Input
              placeholder="Value..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              list="apply-visible-values"
            />
            <datalist id="apply-visible-values">
              {existingValues.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <Button
            onClick={handleApply}
            disabled={!type || !value.trim()}
            className="w-full"
          >
            {mode === 'add' ? 'Apply to' : 'Remove from'} {filteredCount} videos
          </Button>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk operation</AlertDialogTitle>
            <AlertDialogDescription>
              This will {mode === 'add' ? 'add' : 'remove'} &quot;{type}: {value}&quot;{' '}
              {mode === 'add' ? 'to' : 'from'}{' '}
              <strong>{filteredCount}</strong> videos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doApply}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
