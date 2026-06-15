import type { SplitVideoFormValues } from '@/components/video/video-splitter';
import type { SplitVideoOptions } from '@/services/video-splitter';

export function splitFormToOptions(
  form: SplitVideoFormValues,
  onProgress?: (stage: string) => void,
): SplitVideoOptions {
  return {
    splitTimeSeconds: form.splitTimeSeconds,
    first: {
      displayName: form.first.displayName,
      filename: form.first.filename,
      categories: form.first.categories,
      customCategories: form.first.customCategories,
    },
    second: {
      displayName: form.second.displayName,
      filename: form.second.filename,
      categories: form.second.categories,
      customCategories: form.second.customCategories,
    },
    onProgress,
  };
}
