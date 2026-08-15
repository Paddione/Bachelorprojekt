import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FilterEngine } from '@/services/filter-engine';
import { Category } from '@/types/video';
import { Search, User, Palette, Tv, Tags, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  searchQuery: string;
  selectedCategories: string[];
  dateRange: { startDate: string; endDate: string };
  availableCategories: Category[];
  onSearchChange: (query: string) => void;
  onCategoryToggle: (categoryKey: string) => void;
  onDateRangeChange: (dateRange: { startDate: string; endDate: string }) => void;
  onClearAllFilters: () => void;
  onSavePreset: () => void;
  onLoadPreset: () => void;
  className?: string;
  variant?: 'sidebar' | 'sheet';
  onClose?: () => void;
}

const CATEGORY_ICONS = {
  age: User,
  physical: Palette,
  ethnicity: User,
  relationship: User,
  acts: User,
  setting: User,
  quality: Tv,
  performer: User,
  custom: Tags,
};



export function Sidebar({
  searchQuery,
  selectedCategories,
  dateRange,
  availableCategories,
  onSearchChange,
  onCategoryToggle,
  onDateRangeChange,
  onClearAllFilters,
  onSavePreset,
  onLoadPreset,
  className,
  variant = 'sidebar',
  onClose,
}: SidebarProps) {
  const { t } = useTranslation();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const groupedCategories = FilterEngine.groupCategoriesByType(availableCategories);
  const isSheet = variant === 'sheet';

  const toggleSection = (sectionName: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionName)) {
      newCollapsed.delete(sectionName);
    } else {
      newCollapsed.add(sectionName);
    }
    setCollapsedSections(newCollapsed);
  };

  const getCategoryKey = (category: Category) => {
    return category.isCustom
      ? `custom:${category.type}:${category.value}`
      : `${category.type}:${category.value}`;
  };

  const clearDateRange = () => {
    onDateRangeChange({ startDate: '', endDate: '' });
  };

  const applyDateRange = () => {
    // Date range is applied automatically through the hook
  };

  return (
    <aside
      className={cn(
        'bg-white dark:bg-card border-r border-border overflow-hidden flex flex-col',
        isSheet ? 'w-full max-w-xl' : 'w-full lg:w-[22rem]',
        className,
      )}
      aria-label="Filters"
    >
      <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-foreground">{t('sidebar.filters')}</h2>
          {selectedCategories.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedCategories.length} {t('sidebar.active')}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClearAllFilters}
          data-testid="button-clear-filters"
          className="h-9 px-3"
        >
          {t('sidebar.clearAll')}
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          type="text"
          placeholder={t('sidebar.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          data-testid="input-search"
          aria-label={t('sidebar.searchPlaceholder')}
        />
      </div>

      {/* Date Range Filter */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="date-range-checkbox"
            checked={dateRange.startDate !== '' || dateRange.endDate !== ''}
            onCheckedChange={(checked) => {
              if (!checked) {
                clearDateRange();
              }
            }}
          />
          <label htmlFor="date-range-checkbox" className="text-sm font-medium text-foreground">
            {t('sidebar.dateRange')}
          </label>
        </div>
        <div className="space-y-2 pl-6">
          <Input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
            className="text-xs"
            data-testid="input-start-date"
            placeholder="tt.mm.jjjj"
            aria-label={t('sidebar.startDate')}
          />
          <Input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
            className="text-xs"
            data-testid="input-end-date"
            placeholder="tt.mm.jjjj"
            aria-label={t('sidebar.endDate')}
          />
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearDateRange}
              className="flex-1 text-xs"
              data-testid="button-clear-date-range"
            >
              {t('sidebar.clear')}
            </Button>
            <Button
              size="sm"
              onClick={applyDateRange}
              className="flex-1 text-xs"
              data-testid="button-apply-date-range"
            >
              {t('sidebar.apply')}
            </Button>
          </div>
        </div>
      </div>

      <div className="sidebar-scroll flex-1 overflow-y-auto p-4 space-y-4">
        {/* Category Sections */}
        {Object.entries(groupedCategories).map(([sectionName, categories]) => {
          const IconComponent = CATEGORY_ICONS[sectionName as keyof typeof CATEGORY_ICONS] || Tags;
          const label = t(`categories.${sectionName}`, { defaultValue: sectionName });
          const isCollapsed = collapsedSections.has(sectionName);

          return (
            <div key={sectionName} className="space-y-2">
              <div className="flex items-center space-x-2 text-sm font-medium text-muted-foreground">
                <IconComponent className="h-3 w-3" />
                <span>{label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection(sectionName)}
                  className="ml-auto p-0 h-auto text-primary hover:text-primary/80"
                  data-testid={`button-toggle-${sectionName}`}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? t('sidebar.expandSection', { label }) : t('sidebar.collapseSection', { label })}
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                </Button>
              </div>

              {!isCollapsed && (
                <div className="space-y-1">
                  {categories.map((category) => {
                    const categoryKey = getCategoryKey(category);
                    const isSelected = selectedCategories.includes(categoryKey);

                    return (
                      <label
                        key={categoryKey}
                        className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded"
                        data-testid={`category-${categoryKey}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onCategoryToggle(categoryKey)}
                        />
                        <span className="text-foreground">{category.value}</span>
                        <Badge
                          variant={isSelected ? 'default' : 'secondary'}
                          className="ml-auto text-xs"
                        >
                          {category.count}
                        </Badge>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {
        isSheet && (
          <div className="border-t border-border p-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        )
      }
    </aside >
  );
}
