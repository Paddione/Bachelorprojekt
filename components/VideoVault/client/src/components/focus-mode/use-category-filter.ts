import { useMemo, useState } from 'react';

export function useCategoryFilter(
  selectedValues: string[],
  availableValues: string[],
  popularValues: string[],
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const unselectedValues = useMemo(() => {
    const selectedSet = new Set(selectedValues.map((v) => v.toLowerCase()));
    return availableValues.filter((v) => !selectedSet.has(v.toLowerCase()));
  }, [availableValues, selectedValues]);

  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) {
      const popularSet = new Set(popularValues.map((v) => v.toLowerCase()));
      const popular = unselectedValues.filter((v) => popularSet.has(v.toLowerCase()));
      const others = unselectedValues.filter((v) => !popularSet.has(v.toLowerCase()));
      return [...popular, ...others].slice(0, 20);
    }
    const query = searchQuery.toLowerCase();
    return unselectedValues.filter((v) => v.toLowerCase().includes(query)).slice(0, 20);
  }, [unselectedValues, popularValues, searchQuery]);

  const needsSearch = unselectedValues.length > 10;

  return {
    searchQuery, setSearchQuery, showSearch, setShowSearch,
    unselectedValues, filteredValues, needsSearch,
  };
}

export function isDuplicateSelection(selectedValues: string[], value: string): boolean {
  const t = value.trim().toLowerCase();
  return selectedValues.some((v) => v.toLowerCase() === t);
}
