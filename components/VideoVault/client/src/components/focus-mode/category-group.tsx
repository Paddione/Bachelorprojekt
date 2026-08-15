import { useState, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getCategoryColorClasses } from '@/lib/category-colors';
import { ChevronDown, X, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryGroupProps {
  type: string;
  label: string;
  selectedValues: string[];
  availableValues: string[];
  popularValues: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  isCustom?: boolean;
  defaultOpen?: boolean;
}

export function CategoryGroup({
  type,
  label,
  selectedValues,
  availableValues,
  popularValues,
  onAdd,
  onRemove,
  isCustom = false,
  defaultOpen = false,
}: CategoryGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const colorClasses = getCategoryColorClasses(type, isCustom);

  // Filter available values that are not already selected
  const unselectedValues = useMemo(() => {
    const selectedSet = new Set(selectedValues.map((v) => v.toLowerCase()));
    return availableValues.filter((v) => !selectedSet.has(v.toLowerCase()));
  }, [availableValues, selectedValues]);

  // Filter by search query
  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show popular values first, then others
      const popularSet = new Set(popularValues.map((v) => v.toLowerCase()));
      const popular = unselectedValues.filter((v) => popularSet.has(v.toLowerCase()));
      const others = unselectedValues.filter((v) => !popularSet.has(v.toLowerCase()));
      return [...popular, ...others].slice(0, 20); // Limit to 20 values for performance
    }

    const query = searchQuery.toLowerCase();
    return unselectedValues
      .filter((v) => v.toLowerCase().includes(query))
      .slice(0, 20);
  }, [unselectedValues, popularValues, searchQuery]);

  // Determine if we need search (large value lists)
  const needsSearch = unselectedValues.length > 10;

  const handleAddValue = (value: string) => {
    onAdd(value);
    setSearchQuery('');
    // Re-focus search input so user can keep typing
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const handleAddCustomValue = () => {
    const trimmed = searchQuery.trim();
    if (trimmed && !selectedValues.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      onAdd(trimmed);
      setSearchQuery('');
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-3 py-2 h-auto"
          data-testid={`category-group-trigger-${type}`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{label}</span>
            {selectedValues.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedValues.length}
              </Badge>
            )}
          </div>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3">
        {/* Selected values */}
        {selectedValues.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 pt-1">
            {selectedValues.map((value) => (
              <Badge
                key={value}
                className={cn('pr-1 gap-1', colorClasses)}
                data-testid={`selected-${type}-${value}`}
              >
                {value}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(value);
                  }}
                  className="hover:bg-black/10 rounded-full p-0.5"
                  aria-label={`Remove ${value}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Search input for large lists */}
        {(needsSearch || showSearch) && (
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search or add ${label.toLowerCase()}...`}
              className="pl-7 h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredValues.length > 0) {
                    handleAddValue(filteredValues[0]);
                  } else if (searchQuery.trim()) {
                    handleAddCustomValue();
                  }
                }
              }}
              data-testid={`search-${type}`}
            />
            {searchQuery.trim() && !filteredValues.some((v) => v.toLowerCase() === searchQuery.toLowerCase()) && (
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 text-xs"
                onClick={handleAddCustomValue}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            )}
          </div>
        )}

        {/* Available values as chips */}
        <div className="flex flex-wrap gap-1.5">
          {filteredValues.map((value) => (
            <button
              key={value}
              onClick={() => handleAddValue(value)}
              className={cn(
                'px-2 py-0.5 text-xs rounded-md border border-transparent',
                'bg-muted hover:bg-muted/80 hover:border-border',
                'transition-colors cursor-pointer',
              )}
              data-testid={`available-${type}-${value}`}
            >
              {value}
            </button>
          ))}

          {filteredValues.length === 0 && unselectedValues.length === 0 && selectedValues.length === 0 && (
            <span className="text-xs text-muted-foreground">No values available</span>
          )}

          {filteredValues.length === 0 && unselectedValues.length > 0 && (
            <span className="text-xs text-muted-foreground">No matches found</span>
          )}

          {/* Show "more" indicator if truncated */}
          {unselectedValues.length > filteredValues.length && !searchQuery && (
            <button
              onClick={() => setShowSearch(true)}
              className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              +{unselectedValues.length - filteredValues.length} more
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
