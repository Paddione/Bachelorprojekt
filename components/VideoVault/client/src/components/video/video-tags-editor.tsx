import { useState, useEffect, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Video, VideoCategories, CustomCategories, Category } from '@/types/video';
import { getCategoryColorClasses } from '@/lib/category-colors';
import { X, Plus, Sparkles } from 'lucide-react';
import { CategoryNormalizer } from '@/services/category-normalizer';
import { CategorySearch } from '@/components/ui/category-search';

interface VideoTagsEditorProps {
  video: Video;
  availableCategories: Category[];
  onSave: (
    videoId: string,
    categories: Partial<{ categories: VideoCategories; customCategories: CustomCategories }>,
  ) => void;
  onRemoveCategory: (videoId: string, categoryType: string, categoryValue: string) => void;
  suggestions?: Record<string, string[]>;
  className?: string;
  onCancel?: () => void;
}

export function VideoTagsEditor({
  video,
  availableCategories,
  onSave,
  onRemoveCategory,
  suggestions,
  className,
  onCancel,
}: VideoTagsEditorProps) {
  const [categories, setCategories] = useState<VideoCategories>({
    age: [],
    physical: [],
    ethnicity: [],
    relationship: [],
    acts: [],
    setting: [],
    quality: [],
    performer: [],
  });

  const [customCategories, setCustomCategories] = useState<CustomCategories>({});
  const [newCategoryType, setNewCategoryType] = useState('');
  const [newCategoryValue, setNewCategoryValue] = useState('');
  const [newCustomType, setNewCustomType] = useState('');

  const standardOptionsByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    availableCategories
      .filter((c) => !c.isCustom)
      .forEach((c) => {
        const t = c.type;
        const v = CategoryNormalizer.normalizeValue(c.value);
        if (!map[t]) map[t] = [];
        if (!CategoryNormalizer.isDuplicateIgnoreCase(map[t], v)) map[t].push(v);
      });
    Object.keys(map).forEach(
      (k) =>
        (map[k] = CategoryNormalizer.normalizeArray(map[k]).sort((a, b) => a.localeCompare(b))),
    );
    return map;
  }, [availableCategories]);

  const customTypes = useMemo(() => {
    const set = new Set<string>();
    availableCategories
      .filter((c) => c.isCustom)
      .forEach((c) => set.add(CategoryNormalizer.normalizeValue(c.type)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [availableCategories]);

  const customValuesByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    availableCategories
      .filter((c) => c.isCustom)
      .forEach((c) => {
        const t = CategoryNormalizer.normalizeValue(c.type);
        const v = CategoryNormalizer.normalizeValue(c.value);
        if (!map[t]) map[t] = [];
        if (!CategoryNormalizer.isDuplicateIgnoreCase(map[t], v)) map[t].push(v);
      });
    Object.keys(map).forEach(
      (k) =>
        (map[k] = CategoryNormalizer.normalizeArray(map[k]).sort((a, b) => a.localeCompare(b))),
    );
    return map;
  }, [availableCategories]);

  useEffect(() => {
    if (video) {
      setCategories({ ...video.categories });
      setCustomCategories({ ...video.customCategories });
    }
  }, [video]);

  const handleRemoveCategory = (type: string, value: string) => {
    if (!video) return;

    const updatedCategories = { ...categories };
    const categoryArray = updatedCategories[type as keyof VideoCategories];
    if (Array.isArray(categoryArray)) {
      const target = CategoryNormalizer.normalizeValue(value);
      const filtered = categoryArray.filter((v) => CategoryNormalizer.normalizeValue(v) !== target);
      (updatedCategories as unknown as Record<string, string[]>)[type] = filtered;
      setCategories(updatedCategories);
    }

    onRemoveCategory(video.id, type, value);
  };

  const handleRemoveCustomCategory = (type: string, value: string) => {
    if (!video) return;

    const updatedCustomCategories = { ...customCategories };
    if (updatedCustomCategories[type]) {
      const target = CategoryNormalizer.normalizeValue(value);
      updatedCustomCategories[type] = updatedCustomCategories[type].filter(
        (v) => CategoryNormalizer.normalizeValue(v) !== target,
      );
      if (updatedCustomCategories[type].length === 0) {
        delete updatedCustomCategories[type];
      }
      setCustomCategories(updatedCustomCategories);
    }

    onRemoveCategory(video.id, 'custom', `${type}:${value}`);
  };

  const handleAddCategory = () => {
    if (!newCategoryType || !newCategoryValue.trim() || !video) return;

    const updatedCategories = { ...categories };
    const categoryArray = updatedCategories[newCategoryType as keyof VideoCategories];

    if (Array.isArray(categoryArray)) {
      const candidate = CategoryNormalizer.normalizeValue(newCategoryValue);
      const exists = CategoryNormalizer.isDuplicateIgnoreCase(categoryArray, candidate);
      if (!exists) {
        categoryArray.push(candidate);
        (updatedCategories as unknown as Record<string, string[]>)[newCategoryType] =
          CategoryNormalizer.normalizeArray(categoryArray);
        setCategories(updatedCategories);
      }
    }

    setNewCategoryType('');
    setNewCategoryValue('');
  };

  const handleAddCustomCategory = () => {
    if (!newCustomType.trim() || !newCategoryValue.trim()) return;

    const updatedCustomCategories = { ...customCategories };
    const t = CategoryNormalizer.normalizeValue(newCustomType);
    const v = CategoryNormalizer.normalizeValue(newCategoryValue);
    if (!updatedCustomCategories[t]) {
      updatedCustomCategories[t] = [];
    }
    if (!CategoryNormalizer.isDuplicateIgnoreCase(updatedCustomCategories[t], v)) {
      updatedCustomCategories[t].push(v);
      updatedCustomCategories[t] = CategoryNormalizer.normalizeArray(updatedCustomCategories[t]);
      setCustomCategories(updatedCustomCategories);
    }

    setNewCustomType('');
    setNewCategoryValue('');
  };

  const handleCategorySearchSelect = (category: Category) => {
    if (!video) return;

    if (category.isCustom) {
      // Add custom category
      const updatedCustomCategories = { ...customCategories };
      const t = CategoryNormalizer.normalizeValue(category.type);
      const v = CategoryNormalizer.normalizeValue(category.value);
      if (!updatedCustomCategories[t]) {
        updatedCustomCategories[t] = [];
      }
      if (!CategoryNormalizer.isDuplicateIgnoreCase(updatedCustomCategories[t], v)) {
        updatedCustomCategories[t].push(v);
        updatedCustomCategories[t] = CategoryNormalizer.normalizeArray(updatedCustomCategories[t]);
        setCustomCategories(updatedCustomCategories);
      }
    } else {
      // Add standard category
      const updatedCategories = { ...categories };
      const categoryArray = updatedCategories[category.type as keyof VideoCategories];

      if (Array.isArray(categoryArray)) {
        const candidate = CategoryNormalizer.normalizeValue(category.value);
        const exists = CategoryNormalizer.isDuplicateIgnoreCase(categoryArray, candidate);
        if (!exists) {
          categoryArray.push(candidate);
          (updatedCategories as unknown as Record<string, string[]>)[category.type] =
            CategoryNormalizer.normalizeArray(categoryArray);
          setCategories(updatedCategories);
        }
      }
    }
  };

  const handleSave = () => {
    if (!video) return;

    onSave(video.id, {
      categories,
      customCategories,
    });
  };

  const handleCancel = () => {
    if (video) {
      setCategories({ ...video.categories });
      setCustomCategories({ ...video.customCategories });
    }
    onCancel?.();
  };

  const smartSuggestions = useMemo(() => {
    if (!suggestions) return [];
    const items: Array<{ type: string; value: string }> = [];
    for (const [type, values] of Object.entries(suggestions)) {
      const currentValues = categories[type as keyof VideoCategories] || [];
      for (const v of values) {
        const normalized = CategoryNormalizer.normalizeValue(v);
        if (!CategoryNormalizer.isDuplicateIgnoreCase(currentValues, normalized)) {
          items.push({ type, value: normalized });
        }
      }
    }
    return items;
  }, [suggestions, categories]);

  const handleAddSuggestion = (type: string, value: string) => {
    const updatedCategories = { ...categories };
    const categoryArray = updatedCategories[type as keyof VideoCategories];
    if (Array.isArray(categoryArray)) {
      const candidate = CategoryNormalizer.normalizeValue(value);
      if (!CategoryNormalizer.isDuplicateIgnoreCase(categoryArray, candidate)) {
        categoryArray.push(candidate);
        (updatedCategories as unknown as Record<string, string[]>)[type] =
          CategoryNormalizer.normalizeArray(categoryArray);
        setCategories(updatedCategories);
      }
    }
  };

  const suggestedCategories = useMemo(() => {
    const all: Array<{ type: string; value: string }> = [];
    Object.entries(standardOptionsByType).forEach(([type, vals]) => {
      vals.slice(0, 5).forEach((v) => all.push({ type, value: v }));
    });
    const custom: Array<{ type: string; value: string }> = Object.entries(
      customValuesByType,
    ).flatMap(([_, vals]) => vals.slice(0, 5).map((v) => ({ type: 'custom', value: v })));
    // Prioritize a mix
    const mix = [...all.slice(0, 6), ...custom.slice(0, 6)];
    return mix.map(({ type, value }) => ({ type, value }));
  }, [standardOptionsByType, customValuesByType]);

  if (!video) return null;

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="space-y-4">
        {/* Current Standard Categories */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Current Categories</Label>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(categories).map(([type, values]) =>
              values.map((value: string, index: number) => (
                <Badge
                  key={`${type}-${value}-${index}`}
                  variant="secondary"
                  className="inline-flex items-center"
                  data-testid={`category-badge-${type}-${value}`}
                >
                  {value}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveCategory(type, value)}
                    className="ml-1 h-auto p-0 text-muted-foreground hover:text-destructive"
                    data-testid={`button-remove-${type}-${value}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )),
            )}
          </div>
        </div>

        {/* Current Custom Categories */}
        {Object.keys(customCategories).length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Custom Categories</Label>
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(customCategories).map(([type, values]) =>
                values.map((value: string, index: number) => (
                  <Badge
                    key={`custom-${type}-${value}-${index}`}
                    className="inline-flex items-center bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                    data-testid={`custom-badge-${type}-${value}`}
                  >
                    {type}: {value}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCustomCategory(type, value)}
                      className="ml-1 h-auto p-0 text-yellow-600 dark:text-yellow-300 hover:text-destructive"
                      data-testid={`button-remove-custom-${type}-${value}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                )),
              )}
            </div>
          </div>
        )}

        {/* Quick Category Search */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Quick Add Category</Label>
          <CategorySearch
            availableCategories={availableCategories}
            onCategorySelect={handleCategorySearchSelect}
            placeholder="Search and click to add categories..."
            className="mb-4"
            data-testid="quick-category-search"
          />
        </div>

        {/* Add New Standard Category */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Add New Category</Label>
          <div className="flex space-x-2 mb-4">
            <Select
              value={newCategoryType}
              onValueChange={(v) => {
                setNewCategoryType(v);
                setNewCategoryValue('');
              }}
            >
              <SelectTrigger className="flex-1" data-testid="select-category-type">
                <SelectValue placeholder="Select Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="age">Age</SelectItem>
                <SelectItem value="physical">Physical</SelectItem>
                <SelectItem value="ethnicity">Ethnicity</SelectItem>
                <SelectItem value="relationship">Relationship</SelectItem>
                <SelectItem value="acts">Acts</SelectItem>
                <SelectItem value="setting">Setting</SelectItem>
                <SelectItem value="quality">Quality</SelectItem>
                <SelectItem value="performer">Performer</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={newCategoryValue}
              onValueChange={setNewCategoryValue}
              disabled={
                !newCategoryType || (standardOptionsByType[newCategoryType] || []).length === 0
              }
            >
              <SelectTrigger className="flex-1" data-testid="select-category-value">
                <SelectValue placeholder="Select existing value" />
              </SelectTrigger>
              <SelectContent>
                {(standardOptionsByType[newCategoryType] || []).map((val) => (
                  <SelectItem key={val} value={val}>
                    {val}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Or type a new value"
              value={newCategoryValue}
              onChange={(e) => setNewCategoryValue(e.target.value)}
              className="flex-1"
              data-testid="input-category-value"
            />
            <Button
              onClick={handleAddCategory}
              disabled={!newCategoryType || !newCategoryValue.trim()}
              data-testid="button-add-category"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Add New Custom Category */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Add Custom Category</Label>
          <div className="flex space-x-2 mb-4">
            <Select
              value={newCustomType}
              onValueChange={(v) => {
                setNewCustomType(v);
                setNewCategoryValue('');
              }}
            >
              <SelectTrigger className="flex-1" data-testid="select-custom-type">
                <SelectValue placeholder="Select existing type" />
              </SelectTrigger>
              <SelectContent>
                {customTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Or type a new type"
              value={newCustomType}
              onChange={(e) => setNewCustomType(e.target.value)}
              className="flex-1"
              data-testid="input-custom-type"
            />
            <Select
              value={newCategoryValue}
              onValueChange={setNewCategoryValue}
              disabled={!newCustomType || (customValuesByType[newCustomType] || []).length === 0}
            >
              <SelectTrigger className="flex-1" data-testid="select-custom-value">
                <SelectValue placeholder="Select existing value" />
              </SelectTrigger>
              <SelectContent>
                {(customValuesByType[newCustomType] || []).map((val) => (
                  <SelectItem key={val} value={val}>
                    {val}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Or type a new value"
              value={newCategoryValue}
              onChange={(e) => setNewCategoryValue(e.target.value)}
              className="flex-1"
              data-testid="input-custom-value"
            />
            <Button
              onClick={handleAddCustomCategory}
              disabled={!newCustomType.trim() || !newCategoryValue.trim()}
              data-testid="button-add-custom-category"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Smart Suggestions (from filename/path) */}
        {smartSuggestions.length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Smart Suggestions
            </Label>
            <div className="flex flex-wrap gap-2">
              {smartSuggestions.map((s, index) => {
                const colorClasses = getCategoryColorClasses(s.type);
                return (
                  <Badge
                    key={`smart-${s.type}-${s.value}-${index}`}
                    variant="outline"
                    className={`cursor-pointer opacity-60 hover:opacity-100 border-dashed ${colorClasses}`}
                    onClick={() => handleAddSuggestion(s.type, s.value)}
                    data-testid={`smart-suggestion-${s.type}-${s.value}`}
                  >
                    + {s.type}: {s.value}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Suggested Categories */}
        {suggestedCategories.length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Suggested Categories</Label>
            <div className="flex flex-wrap gap-2">
              {suggestedCategories.map((suggestion, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (suggestion.type === 'custom') {
                      setNewCustomType(newCustomType || customTypes[0] || '');
                      setNewCategoryValue(suggestion.value);
                    } else {
                      setNewCategoryType(suggestion.type);
                      setNewCategoryValue(suggestion.value);
                    }
                  }}
                  className="text-xs"
                  data-testid={`button-suggestion-${index}`}
                >
                  {suggestion.value}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-edit">
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} data-testid="button-save-changes">
          Save Changes
        </Button>
      </div>
    </div>
  );
}
