import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { CategorySearch } from '@/components/ui/category-search';
import { Category, CustomCategories, Video, VideoCategories } from '@/types/video';
import { CategoryNormalizer } from '@/services/category-normalizer';
import { getCategoryColorClasses } from '@/lib/category-colors';
import { SplitVideoResult } from '@/services/video-splitter';
import { AlertCircle, Clock, X } from 'lucide-react';

const STANDARD_CATEGORY_TYPES: Array<keyof VideoCategories> = [
  'age',
  'physical',
  'ethnicity',
  'relationship',
  'acts',
  'setting',
  'quality',
  'performer',
];

type SegmentState = {
  displayName: string;
  filename: string;
  categories: VideoCategories;
  customCategories: CustomCategories;
};

export interface SplitVideoFormValues {
  splitTimeSeconds: number;
  first: SegmentState;
  second: SegmentState;
}

interface VideoSplitterProps {
  video: Video;
  availableCategories: Category[];
  onSubmit: (payload: SplitVideoFormValues) => Promise<SplitVideoResult>;
  onCancel?: () => void;
  className?: string;
  currentTime?: number;
}

function cloneCategories(categories?: VideoCategories): VideoCategories {
  return {
    age: [...(categories?.age || [])],
    physical: [...(categories?.physical || [])],
    ethnicity: [...(categories?.ethnicity || [])],
    relationship: [...(categories?.relationship || [])],
    acts: [...(categories?.acts || [])],
    setting: [...(categories?.setting || [])],
    quality: [...(categories?.quality || [])],
    performer: [...(categories?.performer || [])],
  };
}

function cloneCustomCategories(custom?: CustomCategories): CustomCategories {
  const result: CustomCategories = {};
  Object.entries(custom || {}).forEach(([type, values]) => {
    result[type] = [...(values || [])];
  });
  return result;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${mm}:${ss}`;
  }
  return `${mins}:${ss}`;
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

function SegmentEditor({
  title,
  segment,
  onChange,
  availableCategories,
  extension,
  disabled,
}: {
  title: string;
  segment: SegmentState;
  onChange: (next: SegmentState) => void;
  availableCategories: Category[];
  extension: string;
  disabled?: boolean;
}) {
  const [newCategoryType, setNewCategoryType] = useState<keyof VideoCategories>('acts');
  const [newCategoryValue, setNewCategoryValue] = useState('');
  const [customType, setCustomType] = useState('');
  const [customValue, setCustomValue] = useState('');

  useEffect(() => {
    setNewCategoryValue('');
    setCustomType('');
    setCustomValue('');
  }, [segment.displayName]);

  const tags = useMemo(() => {
    const combined: Array<{ type: string; value: string; isCustom: boolean }> = [];
    Object.entries(segment.categories).forEach(([type, values]) => {
      (values || []).forEach((value: string) => combined.push({ type, value, isCustom: false }));
    });
    Object.entries(segment.customCategories || {}).forEach(([type, values]) => {
      (values || []).forEach((value: string) => combined.push({ type, value, isCustom: true }));
    });
    return combined;
  }, [segment.categories, segment.customCategories]);

  const updateSegment = (partial: Partial<SegmentState>) => {
    onChange({ ...segment, ...partial });
  };

  const handleAddStandard = () => {
    if (!newCategoryType || !newCategoryValue.trim()) return;
    const current = [...(segment.categories[newCategoryType] || [])];
    const candidate = CategoryNormalizer.normalizeValue(newCategoryValue);
    if (!CategoryNormalizer.isDuplicateIgnoreCase(current, candidate)) {
      const updated = cloneCategories(segment.categories);
      current.push(candidate);
      updated[newCategoryType] = CategoryNormalizer.normalizeArray(current);
      updateSegment({ categories: updated });
    }
    setNewCategoryValue('');
  };

  const handleAddCustom = () => {
    if (!customType.trim() || !customValue.trim()) return;
    const t = CategoryNormalizer.normalizeValue(customType);
    const v = CategoryNormalizer.normalizeValue(customValue);
    const updated = cloneCustomCategories(segment.customCategories);
    const existing = updated[t] || [];
    if (!CategoryNormalizer.isDuplicateIgnoreCase(existing, v)) {
      updated[t] = CategoryNormalizer.normalizeArray([...(existing || []), v]);
      updateSegment({ customCategories: updated });
    }
    setCustomType('');
    setCustomValue('');
  };

  const handleRemoveTag = (tag: { type: string; value: string; isCustom: boolean }) => {
    if (tag.isCustom) {
      const updated = cloneCustomCategories(segment.customCategories);
      updated[tag.type] = (updated[tag.type] || []).filter(
        (v) =>
          CategoryNormalizer.normalizeValue(v) !== CategoryNormalizer.normalizeValue(tag.value),
      );
      if ((updated[tag.type] || []).length === 0) {
        delete updated[tag.type];
      }
      updateSegment({ customCategories: updated });
    } else {
      const updated = cloneCategories(segment.categories);
      const arr = updated[tag.type as keyof VideoCategories] || [];
      updated[tag.type as keyof VideoCategories] = CategoryNormalizer.normalizeArray(
        arr.filter(
          (v) =>
            CategoryNormalizer.normalizeValue(v) !== CategoryNormalizer.normalizeValue(tag.value),
        ),
      );
      updateSegment({ categories: updated });
    }
  };

  const handleCategorySearchSelect = (category: Category) => {
    if (category.isCustom) {
      const updated = cloneCustomCategories(segment.customCategories);
      const t = CategoryNormalizer.normalizeValue(category.type);
      const v = CategoryNormalizer.normalizeValue(category.value);
      const existing = updated[t] || [];
      if (!CategoryNormalizer.isDuplicateIgnoreCase(existing, v)) {
        updated[t] = CategoryNormalizer.normalizeArray([...(existing || []), v]);
        updateSegment({ customCategories: updated });
      }
    } else {
      const updated = cloneCategories(segment.categories);
      const arr = updated[category.type as keyof VideoCategories] || [];
      const candidate = CategoryNormalizer.normalizeValue(category.value);
      if (!CategoryNormalizer.isDuplicateIgnoreCase(arr, candidate)) {
        const merged = [...arr, candidate];
        updated[category.type as keyof VideoCategories] = CategoryNormalizer.normalizeArray(merged);
        updateSegment({ categories: updated });
      }
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-4 bg-muted/40">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">{title}</h4>
        <Badge variant="outline" className="text-[11px]">
          {extension}
        </Badge>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Display name</Label>
          <Input
            value={segment.displayName}
            onChange={(e) => updateSegment({ displayName: e.target.value })}
            placeholder="Segment title"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Filename</Label>
          <Input
            value={segment.filename}
            onChange={(e) => updateSegment({ filename: e.target.value })}
            placeholder={`my-video-part${title.toLowerCase().includes('2') ? '2' : '1'}`}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            The original extension {extension} is kept automatically.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Tags</Label>
        <CategorySearch
          availableCategories={availableCategories}
          onCategorySelect={handleCategorySearchSelect}
          placeholder="Search and add existing categories"
        />
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wide">
              Standard
            </Label>
            <div className="flex items-center space-x-2">
              <select
                className="border rounded-md px-2 py-1 text-sm bg-background w-24"
                value={newCategoryType}
                onChange={(e) => setNewCategoryType(e.target.value as keyof VideoCategories)}
                disabled={disabled}
              >
                {STANDARD_CATEGORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Input
                value={newCategoryValue}
                onChange={(e) => setNewCategoryValue(e.target.value)}
                placeholder="value"
                className="flex-1"
                disabled={disabled}
              />
              <Button variant="secondary" size="sm" onClick={handleAddStandard} disabled={disabled}>
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wide">Custom</Label>
            <div className="flex items-center space-x-2">
              <Input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="type"
                className="w-24"
                disabled={disabled}
              />
              <Input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="value"
                className="flex-1"
                disabled={disabled}
              />
              <Button variant="secondary" size="sm" onClick={handleAddCustom} disabled={disabled}>
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet.</span>}
          {tags.map((tag, idx) => (
            <Badge
              key={`${tag.type}-${tag.value}-${idx}`}
              className={`flex items-center space-x-1 text-xs ${getCategoryColorClasses(tag.type, tag.isCustom)}`}
            >
              <span>{tag.isCustom ? `${tag.type}: ${tag.value}` : tag.value}</span>
              <button
                type="button"
                className="ml-1 inline-flex"
                onClick={() => handleRemoveTag(tag)}
                aria-label={`Remove ${tag.value}`}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VideoSplitter({
  video,
  availableCategories,
  onSubmit,
  onCancel,
  className,
  currentTime,
}: VideoSplitterProps) {
  const duration = video?.metadata?.duration || 0;
  const extension = useMemo(() => {
    if (!video?.filename) return '.mp4';
    const match = video.filename.match(/\.[^./\\]+$/);
    return match ? match[0] : '.mp4';
  }, [video?.filename]);

  const defaultSplit = useMemo(() => {
    if (!duration) return 0;
    return Math.max(0.5, Math.min(duration - 0.5, duration / 2));
  }, [duration]);

  const [splitSeconds, setSplitSeconds] = useState(defaultSplit);
  const [splitInput, setSplitInput] = useState(defaultSplit.toFixed(2));
  const [firstSegment, setFirstSegment] = useState<SegmentState>({
    displayName: '',
    filename: '',
    categories: cloneCategories(),
    customCategories: {},
  });
  const [secondSegment, setSecondSegment] = useState<SegmentState>({
    displayName: '',
    filename: '',
    categories: cloneCategories(),
    customCategories: {},
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video) return;
    const baseName = stripExtension(video.filename || video.displayName || 'video');
    const first: SegmentState = {
      displayName: `${video.displayName || baseName} - Part 1`,
      filename: `${baseName}-part1`,
      categories: cloneCategories(video.categories),
      customCategories: cloneCustomCategories(video.customCategories),
    };
    const second: SegmentState = {
      displayName: `${video.displayName || baseName} - Part 2`,
      filename: `${baseName}-part2`,
      categories: cloneCategories(video.categories),
      customCategories: cloneCustomCategories(video.customCategories),
    };
    setFirstSegment(first);
    setSecondSegment(second);
    setSplitSeconds(defaultSplit);
    setError(null);
  }, [video, defaultSplit]);

  useEffect(() => {
    setSplitInput(splitSeconds.toFixed(2));
  }, [splitSeconds]);

  const handleSplitInputChange = (value: string) => {
    setSplitInput(value);
    const num = Number(value);
    if (Number.isFinite(num)) {
      const clamped = Math.max(0, Math.min(duration, num));
      setSplitSeconds(clamped);
    }
  };

  const isSplitValid = splitSeconds > 0.25 && duration > 0 && splitSeconds < duration - 0.25;
  const disableSubmit = submitting || !isSplitValid;

  const handleSubmit = async () => {
    if (!isSplitValid) {
      setError('Choose a split time inside the video duration.');
      return;
    }
    if (!firstSegment.filename.trim() || !secondSegment.filename.trim()) {
      setError('Please enter filenames for both segments.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload: SplitVideoFormValues = {
      splitTimeSeconds: splitSeconds,
      first: firstSegment,
      second: secondSegment,
    };
    const result = await onSubmit(payload);
    setSubmitting(false);
    if (!result.success) {
      setError(result.message || 'Unable to split video.');
      return;
    }
    onCancel?.();
  };

  const useCurrentTime = () => {
    if (currentTime !== undefined && currentTime > 0 && currentTime < duration) {
      setSplitSeconds(currentTime);
    }
  };

  if (!video) return null;

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Duration</span>
            <Badge variant="outline">{formatTime(duration)}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">Split at</span>
            <Badge variant="secondary">{formatTime(splitSeconds)}</Badge>
            <span className="text-xs text-muted-foreground">({splitSeconds.toFixed(2)}s)</span>
          </div>
        </div>
        <Slider
          value={[Math.min(splitSeconds, Math.max(duration, 1))]}
          max={Math.max(duration, 1)}
          step={0.25}
          min={0}
          onValueChange={(vals) => setSplitSeconds(vals[0] ?? splitSeconds)}
          disabled={duration <= 0}
          aria-label="Split time"
        />
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={0}
            max={duration || undefined}
            step="0.25"
            value={splitInput}
            onChange={(e) => handleSplitInputChange(e.target.value)}
            className="w-32"
            aria-label="Split time in seconds"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={useCurrentTime}
            disabled={currentTime === undefined || currentTime <= 0}
          >
            Use Player Time
          </Button>
        </div>
        {!isSplitValid && (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Pick a time between 0s and {formatTime(duration)}.</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <SegmentEditor
          title="First part"
          segment={firstSegment}
          onChange={setFirstSegment}
          availableCategories={availableCategories}
          extension={extension}
          disabled={submitting}
        />
        <SegmentEditor
          title="Second part"
          segment={secondSegment}
          onChange={setSecondSegment}
          availableCategories={availableCategories}
          extension={extension}
          disabled={submitting}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <span className="text-xs text-muted-foreground">
          New files will be created next to the source.
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button onClick={() => void handleSubmit()} disabled={disableSubmit}>
            {submitting ? 'Splitting…' : 'Split video'}
          </Button>
        </div>
      </div>
    </div>
  );
}
