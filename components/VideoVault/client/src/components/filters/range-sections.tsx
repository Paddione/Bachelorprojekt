import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { AdvancedFilters } from '@/types/video';

interface RangeOption { min: number; max: number; label: string }

interface FileSizeProps {
  uid: string;
  localFilters: AdvancedFilters;
  options: RangeOption[];
  onChange: (key: keyof AdvancedFilters, value: unknown) => void;
}

export function FileSizeSection({ uid, localFilters, options, onChange }: FileSizeProps) {
  const showCustom = localFilters.fileSizeRange.min > 0 || localFilters.fileSizeRange.max > 0;
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">File Size</Label>
      <Select
        value={`${localFilters.fileSizeRange.min}-${localFilters.fileSizeRange.max}`}
        onValueChange={(value) => {
          if (value === 'custom') return;
          const [min, max] = value.split('-').map(Number);
          onChange('fileSizeRange', { min, max });
        }}
      >
        <SelectTrigger><SelectValue placeholder="Select file size range" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="0-0">Any size</SelectItem>
          {options.map((f, i) => (
            <SelectItem key={i} value={`${f.min}-${f.max}`}>{f.label}</SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {showCustom ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor={`fs-min-${uid}`} className="text-xs text-muted-foreground">Min (MB)</Label>
            <Input
              id={`fs-min-${uid}`}
              type="number"
              value={localFilters.fileSizeRange.min > 0 ? Math.round(localFilters.fileSizeRange.min / (1024 * 1024)) : ''}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value) * 1024 * 1024 : 0;
                onChange('fileSizeRange', { ...localFilters.fileSizeRange, min: v });
              }}
              placeholder="0" className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`fs-max-${uid}`} className="text-xs text-muted-foreground">Max (MB)</Label>
            <Input
              id={`fs-max-${uid}`}
              type="number"
              value={localFilters.fileSizeRange.max > 0 ? Math.round(localFilters.fileSizeRange.max / (1024 * 1024)) : ''}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value) * 1024 * 1024 : 0;
                onChange('fileSizeRange', { ...localFilters.fileSizeRange, max: v });
              }}
              placeholder="∞" className="text-xs"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DurationSection({ uid, localFilters, options, onChange }: FileSizeProps) {
  const showCustom = localFilters.durationRange.min > 0 || localFilters.durationRange.max > 0;
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Duration</Label>
      <Select
        value={`${localFilters.durationRange.min}-${localFilters.durationRange.max}`}
        onValueChange={(value) => {
          if (value === 'custom') return;
          const [min, max] = value.split('-').map(Number);
          onChange('durationRange', { min, max });
        }}
      >
        <SelectTrigger><SelectValue placeholder="Select duration range" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="0-0">Any duration</SelectItem>
          {options.map((f, i) => (
            <SelectItem key={i} value={`${f.min}-${f.max}`}>{f.label}</SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {showCustom ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor={`dur-min-${uid}`} className="text-xs text-muted-foreground">Min (minutes)</Label>
            <Input
              id={`dur-min-${uid}`}
              type="number"
              value={localFilters.durationRange.min > 0 ? Math.round(localFilters.durationRange.min / 60) : ''}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value) * 60 : 0;
                onChange('durationRange', { ...localFilters.durationRange, min: v });
              }}
              placeholder="0" className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`dur-max-${uid}`} className="text-xs text-muted-foreground">Max (minutes)</Label>
            <Input
              id={`dur-max-${uid}`}
              type="number"
              value={localFilters.durationRange.max > 0 ? Math.round(localFilters.durationRange.max / 60) : ''}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value) * 60 : 0;
                onChange('durationRange', { ...localFilters.durationRange, max: v });
              }}
              placeholder="∞" className="text-xs"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
