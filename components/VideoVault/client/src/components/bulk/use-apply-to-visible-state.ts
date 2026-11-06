import { useState } from 'react';
import { Category } from '@/types/video';

export function useApplyToVisibleState(
  filteredCount: number,
  availableCategories: Category[],
  type: string,
) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const existingValues = availableCategories
    .filter((c) => c.type === type && !c.isCustom)
    .map((c) => c.value)
    .slice(0, 20);

  const needsConfirm = filteredCount > 50;

  return { open, setOpen, confirmOpen, setConfirmOpen, existingValues, needsConfirm };
}
