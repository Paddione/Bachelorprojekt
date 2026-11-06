import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, X } from 'lucide-react';
import { AdvancedFilters } from '@/types/video';
import { FilterEngine } from '@/services/filter-engine';
import { useAdvancedFilterState, hasActiveFilters, getActiveFilterCount } from './use-advanced-filter-state';
import { DateRangeSection } from './date-range-section';
import { FileSizeSection, DurationSection } from './range-sections';

interface AdvancedFiltersProps {
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  onClearFilters: () => void;
}

export function AdvancedFiltersPanel({ filters, onFiltersChange, onClearFilters }: AdvancedFiltersProps) {
  const uid = useId();
  const { isOpen, setIsOpen, localFilters, updateFilter, updateDateRange, handleApply, handleReset } =
    useAdvancedFilterState(filters, onFiltersChange);
  const active = hasActiveFilters(filters);
  const fileSizeFilters = FilterEngine.getFileSizeFilters();
  const durationFilters = FilterEngine.getDurationFilters();

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={active ? 'default' : 'outline'}
          size="sm"
          className="relative"
          onClick={() => setIsOpen((v) => !v)}
          data-testid="button-advanced-filters"
        >
          <Filter className="h-4 w-4 mr-2" />
          Advanced Filters
          {active && (
            <span className="ml-2 bg-white text-primary text-xs rounded-full px-2 py-1 font-medium">
              {getActiveFilterCount(filters)}
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
          <DateRangeSection localFilters={localFilters} updateDateRange={updateDateRange} />
          <FileSizeSection uid={uid} localFilters={localFilters} options={fileSizeFilters} onChange={updateFilter} />
          <DurationSection uid={uid} localFilters={localFilters} options={durationFilters} onChange={updateFilter} />
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setIsOpen(false)} size="sm">Cancel</Button>
            <div className="flex items-center space-x-2">
              {active && (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-destructive hover:text-destructive">
                  <X className="h-4 w-4 mr-1" />Clear
                </Button>
              )}
              <Button onClick={handleApply} size="sm">Apply Filters</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
