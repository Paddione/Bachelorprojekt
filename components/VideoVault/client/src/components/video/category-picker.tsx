import { useState, useEffect, useMemo } from 'react';
import { Video, VideoCategories } from '@/types/video';
import { CategoryExtractor } from '@/services/category-extractor';
import { getCategoryColorClasses } from '@/lib/category-colors';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus } from 'lucide-react';

interface CategoryPickerProps {
  video: Video;
  onApply: (videoId: string, categories: Partial<{ categories: VideoCategories }>) => void;
}

const PICKER_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality'] as const;

const TYPE_LABELS: Record<string, string> = {
  age: 'Age',
  physical: 'Physical',
  ethnicity: 'Ethnicity',
  relationship: 'Relationship',
  acts: 'Acts',
  setting: 'Setting',
  quality: 'Quality',
};

export function CategoryPicker({ video, onApply }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Record<string, string[]>>({});

  // Deep-copy current assignments on open (already normalized: lowercase, deduped)
  useEffect(() => {
    if (open) {
      const copy: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(video.categories)) {
        copy[k] = [...v];
      }
      setPending(copy);
    }
  }, [open, video.categories]);

  // Pre-expand sections that already have assigned values
  const defaultExpanded = useMemo(() => {
    return PICKER_TYPES.filter((type) => (video.categories[type]?.length ?? 0) > 0);
  }, [video.categories]);

  // Count net changes vs original
  const changeCount = useMemo(() => {
    let count = 0;
    for (const type of PICKER_TYPES) {
      const original = new Set(video.categories[type] || []);
      const current = new Set(pending[type] || []);
      for (const v of current) if (!original.has(v)) count++;
      for (const v of original) if (!current.has(v)) count++;
    }
    return count;
  }, [pending, video.categories]);

  function toggle(type: string, value: string) {
    setPending((prev) => {
      const current = prev[type] || [];
      const has = current.includes(value);
      return {
        ...prev,
        [type]: has ? current.filter((v) => v !== value) : [...current, value],
      };
    });
  }

  function apply() {
    onApply(video.id, { categories: pending as VideoCategories });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
          aria-label="Add categories"
          data-testid={`category-picker-trigger-${video.id}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <ScrollArea className="max-h-[60vh]">
          <div className="p-3">
            <Accordion type="multiple" defaultValue={[...defaultExpanded]}>
              {PICKER_TYPES.map((type) => {
                const options = CategoryExtractor.CATEGORY_PATTERNS[type];
                if (!options || options.length === 0) return null;
                const selected = new Set(pending[type] || []);
                const colorClasses = getCategoryColorClasses(type);

                return (
                  <AccordionItem key={type} value={type} className="border-b-muted">
                    <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                      <span className={colorClasses.replace(/bg-\S+/g, '').trim()}>
                        {TYPE_LABELS[type]}
                        {selected.size > 0 && (
                          <span className="ml-1.5 opacity-60">({selected.size})</span>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2 pt-0">
                      <div className="flex flex-wrap gap-1">
                        {options.map((value) => {
                          const isSelected = selected.has(value);
                          return (
                            <Badge
                              key={value}
                              className={`text-xs cursor-pointer transition-colors ${
                                isSelected
                                  ? colorClasses
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                              onClick={() => toggle(type, value)}
                              role="checkbox"
                              aria-checked={isSelected}
                              aria-label={`${value} (${type})`}
                              data-testid={`category-option-${type}-${value}`}
                            >
                              {value}
                            </Badge>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </ScrollArea>
        <div className="border-t p-3">
          <Button
            className="w-full"
            size="sm"
            onClick={apply}
            disabled={changeCount === 0}
            data-testid={`category-picker-apply-${video.id}`}
          >
            Apply{changeCount > 0 ? ` (${changeCount} change${changeCount !== 1 ? 's' : ''})` : ''}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
