export function getCategoryColorClasses(categoryType: string, isCustom?: boolean): string {
  const baseMap: Record<string, string> = {
    age: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
    physical: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    quality: 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200',
    ethnicity: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200',
    acts: 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200',
    setting: 'bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200',
    performer: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200',
    relationship: 'bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200',
  };

  const defaultClasses = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200';

  if (!isCustom) {
    return baseMap[categoryType] || defaultClasses;
  }

  // Deterministic color assignment for custom categories based on type
  const palette = [
    'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    'bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200',
    'bg-lime-100 dark:bg-lime-900 text-lime-800 dark:text-lime-200',
    'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
    'bg-fuchsia-100 dark:bg-fuchsia-900 text-fuchsia-800 dark:text-fuchsia-200',
    'bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200',
    'bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200',
    'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200',
    'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    'bg-stone-100 dark:bg-stone-900 text-stone-800 dark:text-stone-200',
  ];

  let hash = 0;
  const str = categoryType || '';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % palette.length;
  return palette[idx] || defaultClasses;
}

