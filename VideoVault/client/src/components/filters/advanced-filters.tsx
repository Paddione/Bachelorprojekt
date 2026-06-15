import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AdvancedFilters } from '@/types/video';
import { FilterEngine } from '@/services/filter-engine';

interface AdvancedFiltersProps {
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  onClearFilters: () => void;
}

export function AdvancedFiltersPanel({
  filters,
  onFiltersChange,
  onClearFilters,
}: AdvancedFiltersProps) {
  const uid = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<AdvancedFilters>(filters);

  const fileSizeFilters = FilterEngine.getFileSizeFilters();
  const durationFilters = FilterEngine.getDurationFilters();

  const hasActiveFilters = () => {
    return (
      (filters.dateRange.startDate && filters.dateRange.endDate) ||
      filters.fileSizeRange.min > 0 ||
      filters.fileSizeRange.max > 0 ||
      filters.durationRange.min > 0 ||
      filters.durationRange.max > 0
    );
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleReset = () => {
    const resetFilters: AdvancedFilters = {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
  };

  const updateFilter = (key: keyof AdvancedFilters, value: any) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateDateRange = (key: 'startDate' | 'endDate', value: Date | undefined) => {
    if (!value) return;

    setLocalFilters((prev) => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [key]: format(value, 'yyyy-MM-dd'),
      },
    }));
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.dateRange.startDate && filters.dateRange.endDate) count++;
    if (filters.fileSizeRange.min > 0 || filters.fileSizeRange.max > 0) count++;
    if (filters.durationRange.min > 0 || filters.durationRange.max > 0) count++;
    return count;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasActiveFilters() ? 'default' : 'outline'}
          size="sm"
          className="relative"
          onClick={() => setIsOpen((v) => !v)}
          data-testid="button-advanced-filters"
        >
          <Filter className="h-4 w-4 mr-2" />
          Advanced Filters
          {hasActiveFilters() && (
            <span className="ml-2 bg-white text-primary text-xs rounded-full px-2 py-1 font-medium">
              {getActiveFilterCount()}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-96 p-6" align="end">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Advanced Filters</h3>
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 px-2 text-xs">
              Reset All
            </Button>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !localFilters.dateRange.startDate && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {localFilters.dateRange.startDate
                        ? format(new Date(localFilters.dateRange.startDate), 'PPP')
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        localFilters.dateRange.startDate
                          ? new Date(localFilters.dateRange.startDate)
                          : undefined
                      }
                      onSelect={(date) => updateDateRange('startDate', date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !localFilters.dateRange.endDate && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {localFilters.dateRange.endDate
                        ? format(new Date(localFilters.dateRange.endDate), 'PPP')
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        localFilters.dateRange.endDate
                          ? new Date(localFilters.dateRange.endDate)
                          : undefined
                      }
                      onSelect={(date) => updateDateRange('endDate', date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* File Size Filter */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">File Size</Label>
            <Select
              value={`${localFilters.fileSizeRange.min}-${localFilters.fileSizeRange.max}`}
              onValueChange={(value) => {
                if (value === 'custom') return;
                const [min, max] = value.split('-').map(Number);
                updateFilter('fileSizeRange', { min, max });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select file size range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0-0">Any size</SelectItem>
                {fileSizeFilters.map((filter, index) => (
                  <SelectItem key={index} value={`${filter.min}-${filter.max}`}>
                    {filter.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>

            {localFilters.fileSizeRange.min > 0 || localFilters.fileSizeRange.max > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor={`fs-min-${uid}`} className="text-xs text-muted-foreground">
                    Min (MB)
                  </Label>
                  <Input
                    id={`fs-min-${uid}`}
                    type="number"
                    value={
                      localFilters.fileSizeRange.min > 0
                        ? Math.round(localFilters.fileSizeRange.min / (1024 * 1024))
                        : ''
                    }
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) * 1024 * 1024 : 0;
                      updateFilter('fileSizeRange', { ...localFilters.fileSizeRange, min: value });
                    }}
                    placeholder="0"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`fs-max-${uid}`} className="text-xs text-muted-foreground">
                    Max (MB)
                  </Label>
                  <Input
                    id={`fs-max-${uid}`}
                    type="number"
                    value={
                      localFilters.fileSizeRange.max > 0
                        ? Math.round(localFilters.fileSizeRange.max / (1024 * 1024))
                        : ''
                    }
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) * 1024 * 1024 : 0;
                      updateFilter('fileSizeRange', { ...localFilters.fileSizeRange, max: value });
                    }}
                    placeholder="∞"
                    className="text-xs"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Duration Filter */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Duration</Label>
            <Select
              value={`${localFilters.durationRange.min}-${localFilters.durationRange.max}`}
              onValueChange={(value) => {
                if (value === 'custom') return;
                const [min, max] = value.split('-').map(Number);
                updateFilter('durationRange', { min, max });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select duration range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0-0">Any duration</SelectItem>
                {durationFilters.map((filter, index) => (
                  <SelectItem key={index} value={`${filter.min}-${filter.max}`}>
                    {filter.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>

            {localFilters.durationRange.min > 0 || localFilters.durationRange.max > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor={`dur-min-${uid}`} className="text-xs text-muted-foreground">
                    Min (minutes)
                  </Label>
                  <Input
                    id={`dur-min-${uid}`}
                    type="number"
                    value={
                      localFilters.durationRange.min > 0
                        ? Math.round(localFilters.durationRange.min / 60)
                        : ''
                    }
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) * 60 : 0;
                      updateFilter('durationRange', { ...localFilters.durationRange, min: value });
                    }}
                    placeholder="0"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`dur-max-${uid}`} className="text-xs text-muted-foreground">
                    Max (minutes)
                  </Label>
                  <Input
                    id={`dur-max-${uid}`}
                    type="number"
                    value={
                      localFilters.durationRange.max > 0
                        ? Math.round(localFilters.durationRange.max / 60)
                        : ''
                    }
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) * 60 : 0;
                      updateFilter('durationRange', { ...localFilters.durationRange, max: value });
                    }}
                    placeholder="∞"
                    className="text-xs"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setIsOpen(false)} size="sm">
              Cancel
            </Button>
            <div className="flex items-center space-x-2">
              {hasActiveFilters() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearFilters}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
              <Button onClick={handleApply} size="sm">
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
