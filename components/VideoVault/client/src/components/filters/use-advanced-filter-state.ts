import { useState } from 'react';
import { format } from 'date-fns';
import { AdvancedFilters } from '@/types/video';

const EMPTY: AdvancedFilters = {
  dateRange: { startDate: '', endDate: '' },
  fileSizeRange: { min: 0, max: 0 },
  durationRange: { min: 0, max: 0 },
};

export function hasActiveFilters(filters: AdvancedFilters): boolean {
  return Boolean(
    (filters.dateRange.startDate && filters.dateRange.endDate) ||
      filters.fileSizeRange.min > 0 ||
      filters.fileSizeRange.max > 0 ||
      filters.durationRange.min > 0 ||
      filters.durationRange.max > 0,
  );
}

export function getActiveFilterCount(filters: AdvancedFilters): number {
  let count = 0;
  if (filters.dateRange.startDate && filters.dateRange.endDate) count++;
  if (filters.fileSizeRange.min > 0 || filters.fileSizeRange.max > 0) count++;
  if (filters.durationRange.min > 0 || filters.durationRange.max > 0) count++;
  return count;
}

export function useAdvancedFilterState(
  filters: AdvancedFilters,
  onFiltersChange: (f: AdvancedFilters) => void,
  onOpenChange?: (open: boolean) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<AdvancedFilters>(filters);

  const updateFilter = (key: keyof AdvancedFilters, value: unknown) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateDateRange = (key: 'startDate' | 'endDate', value: Date | undefined) => {
    if (!value) return;
    setLocalFilters((prev) => ({
      ...prev,
      dateRange: { ...prev.dateRange, [key]: format(value, 'yyyy-MM-dd') },
    }));
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
    onOpenChange?.(false);
  };

  const handleReset = () => {
    setLocalFilters(EMPTY);
    onFiltersChange(EMPTY);
  };

  return {
    isOpen, setIsOpen, localFilters, updateFilter, updateDateRange,
    handleApply, handleReset, emptyFilters: EMPTY,
  };
}
