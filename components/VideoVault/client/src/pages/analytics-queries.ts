import type { Video } from '@/types/video';

export const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

export interface DateRange { startDate: string; endDate: string }

export interface StatBucket { name: string; value: number }

export interface AnalyticsStats {
  totalVideos: number;
  totalSize: number;
  totalDuration: number;
  topCategories: StatBucket[];
  sizeData: StatBucket[];
  durationData: StatBucket[];
}

export function filterVideos(videos: Video[], selectedRoot: string, range: DateRange): Video[] {
  let res = videos;
  if (selectedRoot !== 'all') res = res.filter((v) => v.rootKey === selectedRoot);
  if (range.startDate) {
    const start = new Date(range.startDate).getTime();
    res = res.filter((v) => new Date(v.lastModified).getTime() >= start);
  }
  if (range.endDate) {
    const end = new Date(range.endDate).getTime() + 86400000;
    res = res.filter((v) => new Date(v.lastModified).getTime() < end);
  }
  return res;
}

function countInto(counts: Record<string, number>, obj: Record<string, string[]> | undefined): void {
  Object.entries(obj || {}).forEach(([type, values]) => {
    if (Array.isArray(values)) values.forEach((val) => {
      const key = `${type}: ${val}`;
      counts[key] = (counts[key] || 0) + 1;
    });
  });
}

function bucketize<T extends string>(keys: T[], pick: (v: Video) => T, videos: Video[]): StatBucket[] {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  videos.forEach((v) => { counts[pick(v)]++; });
  return Object.entries(counts).map(([name, value]) => ({ name, value: value as number }));
}

export function computeStats(videos: Video[]): AnalyticsStats {
  const totalVideos = videos.length;
  const totalSize = videos.reduce((acc, v) => acc + v.size, 0);
  const totalDuration = videos.reduce((acc, v) => acc + (v.metadata?.duration || 0), 0);
  const counts: Record<string, number> = {};
  videos.forEach((v) => { countInto(counts, v.categories); countInto(counts, v.customCategories); });
  const topCategories = Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const sizeData = bucketize(['< 100MB', '100MB - 500MB', '500MB - 1GB', '1GB - 5GB', '> 5GB'] as const, (v) => {
    const mb = v.size / (1024 * 1024);
    if (mb < 100) return '< 100MB';
    if (mb < 500) return '100MB - 500MB';
    if (mb < 1024) return '500MB - 1GB';
    if (mb < 5120) return '1GB - 5GB';
    return '> 5GB';
  }, videos);
  const durationData = bucketize(['< 5m', '5m - 20m', '20m - 1h', '> 1h'] as const, (v) => {
    const minutes = (v.metadata?.duration || 0) / 60;
    if (minutes < 5) return '< 5m';
    if (minutes < 20) return '5m - 20m';
    if (minutes < 60) return '20m - 1h';
    return '> 1h';
  }, videos);
  return { totalVideos, totalSize, totalDuration, topCategories, sizeData, durationData };
}
