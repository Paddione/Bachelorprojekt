import { useState, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Category } from "@/types/video";
import { getCategoryColorClasses } from "@/lib/category-colors";
import { Search, X } from "lucide-react";

interface CategorySearchProps {
  availableCategories: Category[];
  placeholder?: string;
  onCategorySelect: (category: Category) => void;
  className?: string;
  'data-testid'?: string;
}

interface SuggestionCategory extends Category {
  displayText: string;
  matchScore: number;
}

export function CategorySearch({
  availableCategories,
  placeholder = "Search categories...",
  onCategorySelect,
  className = "",
  'data-testid': testId = "category-search"
}: CategorySearchProps) {
  const [searchValue, setSearchValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter and score suggestions based on search input
  const suggestions = useMemo(() => {
    if (!searchValue.trim()) return [];

    const query = searchValue.toLowerCase().trim();
    const results: SuggestionCategory[] = [];

    availableCategories.forEach(category => {
      const value = category.value.toLowerCase();
      const type = category.type.toLowerCase();
      const displayText = category.isCustom ? `${category.type}: ${category.value}` : category.value;
      
      let matchScore = 0;
      
      // Exact match gets highest score
      if (value === query) {
        matchScore = 100;
      }
      // Starts with query gets high score
      else if (value.startsWith(query)) {
        matchScore = 90;
      }
      // Type matches query (for custom categories)
      else if (type.startsWith(query)) {
        matchScore = 80;
      }
      // Contains query gets medium score
      else if (value.includes(query)) {
        matchScore = 70;
      }
      // Type contains query (for custom categories)
      else if (type.includes(query)) {
        matchScore = 60;
      }
      
      if (matchScore > 0) {
        results.push({
          ...category,
          displayText,
          matchScore
        });
      }
    });

    // Sort by score (descending) then by display text
    return results
      .sort((a, b) => {
        if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
        return a.displayText.localeCompare(b.displayText);
      })
      .slice(0, 10); // Limit to top 10 results
  }, [availableCategories, searchValue]);

  const handleCategoryClick = (category: Category) => {
    onCategorySelect(category);
    setSearchValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchValue("");
    } else if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      handleCategoryClick(suggestions[0]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    setIsOpen(value.trim().length > 0);
  };

  const clearSearch = () => {
    setSearchValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className={`relative ${className}`}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={searchValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onFocus={() => searchValue.trim() && setIsOpen(true)}
              className="pl-9 pr-9"
              data-testid={testId}
            />
            {searchValue && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSearch}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                data-testid={`${testId}-clear`}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </PopoverTrigger>
        
        <PopoverContent
          className="w-full p-0 max-h-64 overflow-y-auto"
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {suggestions.length > 0 ? (
            <div className="p-2">
              <div className="text-xs text-muted-foreground mb-2">
                {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
              </div>
              <div className="space-y-1">
                {suggestions.map((suggestion, index) => {
                  const count = suggestion.count ?? 0;
                  return (
                  <Button
                    key={`${suggestion.type}-${suggestion.value}-${index}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCategoryClick(suggestion)}
                    className="w-full justify-start h-auto p-2 text-left"
                    data-testid={`${testId}-suggestion-${index}`}
                  >
                    <Badge
                      className={`mr-2 text-xs ${getCategoryColorClasses(suggestion.type, suggestion.isCustom)}`}
                      variant={suggestion.isCustom ? "default" : "secondary"}
                    >
                      {suggestion.displayText}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {count > 1 ? `(${count})` : ''}
                    </span>
                  </Button>
                  );
                })}
              </div>
            </div>
          ) : searchValue.trim() ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No categories found for "{searchValue}"
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
