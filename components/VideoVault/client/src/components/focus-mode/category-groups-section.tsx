import { VideoCategories, Category } from '@/types/video';
import { CategoryGroup } from './category-group';

interface CategoryGroupsSectionProps {
  pendingCategories: VideoCategories;
  availableCategories: Category[];
  onAddCategory: (type: string, value: string, isCustom?: boolean) => void;
  onRemoveCategory: (type: string, value: string, isCustom?: boolean) => void;
  getAvailableValuesForType: (type: string, isCustom?: boolean) => string[];
  getPopularValuesForType: (type: string, isCustom?: boolean) => string[];
}

const CATEGORY_TYPES = [
  { type: 'performer', label: 'Performer' },
  { type: 'age', label: 'Age' },
  { type: 'physical', label: 'Physical' },
  { type: 'ethnicity', label: 'Ethnicity' },
  { type: 'relationship', label: 'Relationship' },
  { type: 'acts', label: 'Acts' },
  { type: 'setting', label: 'Setting' },
  { type: 'quality', label: 'Quality' },
] as const;

export function CategoryGroupsSection({
  pendingCategories,
  availableCategories,
  onAddCategory,
  onRemoveCategory,
  getAvailableValuesForType,
  getPopularValuesForType,
}: CategoryGroupsSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Categories</h3>

      <div className="space-y-2">
        {CATEGORY_TYPES.map(({ type, label }) => (
          <CategoryGroup
            key={type}
            type={type}
            label={label}
            selectedValues={pendingCategories[type] || []}
            availableValues={getAvailableValuesForType(type, false)}
            popularValues={getPopularValuesForType(type, false)}
            onAdd={(value) => onAddCategory(type, value, false)}
            onRemove={(value) => onRemoveCategory(type, value, false)}
            // Open performer and acts by default since they're commonly used
            defaultOpen={type === 'performer' || type === 'acts'}
          />
        ))}
      </div>
    </div>
  );
}
