import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AdvancedFilters } from '@/types/video';

interface Props {
  localFilters: AdvancedFilters;
  updateDateRange: (key: 'startDate' | 'endDate', value: Date | undefined) => void;
}

export function DateRangeSection({ localFilters, updateDateRange }: Props) {
  const renderPicker = (key: 'startDate' | 'endDate', label: string) => (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !localFilters.dateRange[key] && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {localFilters.dateRange[key]
              ? format(new Date(localFilters.dateRange[key]), 'PPP')
              : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={
              localFilters.dateRange[key] ? new Date(localFilters.dateRange[key]) : undefined
            }
            onSelect={(date) => updateDateRange(key, date)}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Date Range</Label>
      <div className="grid grid-cols-2 gap-2">
        {renderPicker('startDate', 'From')}
        {renderPicker('endDate', 'To')}
      </div>
    </div>
  );
}
