import { useState, useMemo } from 'react';
import { CustomCategories, Category } from '@/types/video';
import { CategoryGroup } from './category-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryNormalizer } from '@/services/category-normalizer';

interface CustomCategoriesSectionProps {
  pendingCustomCategories: CustomCategories;
  availableCategories: Category[];
  onAddCategory: (type: string, value: string, isCustom?: boolean) => void;
  onRemoveCategory: (type: string, value: string, isCustom?: boolean) => void;
  getAvailableValuesForType: (type: string, isCustom?: boolean) => string[];
  getPopularValuesForType: (type: string, isCustom?: boolean) => string[];
}

export function CustomCategoriesSection({
  pendingCustomCategories,
  availableCategories,
  onAddCategory,
  onRemoveCategory,
  getAvailableValuesForType,
  getPopularValuesForType,
}: CustomCategoriesSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Get all custom category types from available categories
  const customTypes = useMemo(() => {
    const types = new Set<string>();

    // From available categories
    availableCategories
      .filter((c) => c.isCustom)
      .forEach((c) => types.add(CategoryNormalizer.normalizeValue(c.type)));

    // From pending custom categories
    Object.keys(pendingCustomCategories).forEach((t) =>
      types.add(CategoryNormalizer.normalizeValue(t)),
    );

    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [availableCategories, pendingCustomCategories]);

  const totalCustomCount = Object.values(pendingCustomCategories).reduce(
    (sum, values) => sum + values.length,
    0,
  );

  const handleAddNewType = () => {
    const trimmed = CategoryNormalizer.normalizeValue(newTypeName);
    if (trimmed && !customTypes.includes(trimmed)) {
      // Adding an empty type prepares it for values
      setNewTypeName('');
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-3 py-2 h-auto"
          data-testid="custom-categories-trigger"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Custom Categories</span>
            {totalCustomCount > 0 && (
              <span className="text-xs text-muted-foreground">({totalCustomCount})</span>
            )}
          </div>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3 pt-1 space-y-3">
        {/* Existing custom category types */}
        {customTypes.map((type) => (
          <CategoryGroup
            key={type}
            type={type}
            label={type}
            selectedValues={pendingCustomCategories[type] || []}
            availableValues={getAvailableValuesForType(type, true)}
            popularValues={getPopularValuesForType(type, true)}
            onAdd={(value) => onAddCategory(type, value, true)}
            onRemove={(value) => onRemoveCategory(type, value, true)}
            isCustom
            defaultOpen={false}
          />
        ))}

        {/* Add new custom type */}
        <div className="pt-2 border-t">
          <div className="flex items-center gap-2">
            <Input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="New category type..."
              className="h-8 text-sm flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddNewType();
                }
              }}
              data-testid="input-new-custom-type"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddNewType}
              disabled={!newTypeName.trim()}
              className="h-8"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Type
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Create a new custom category type, then add values to it.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
