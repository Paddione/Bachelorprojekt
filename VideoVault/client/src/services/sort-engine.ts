import { Video, SortField, SortDirection } from '@/types/video';

export class SortEngine {
  static sortVideos(videos: Video[], field: SortField, direction: SortDirection): Video[] {
    const factor = direction === 'desc' ? -1 : 1;
    const withIndex = videos.map((v, idx) => ({ v, idx }));
    withIndex.sort((a, b) => {
      const cmp = this.compareValues(a.v, b.v, field);
      if (cmp !== 0) return cmp * factor;
      // Ensure stable ordering by original index
      return (a.idx - b.idx) * factor;
    });
    return withIndex.map((x) => x.v);
  }

  private static compareValues(a: Video, b: Video, field: SortField): number {
    switch (field) {
      case 'displayName':
        return a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      case 'path':
        return a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true });
      case 'size': {
        const av = Number(a.size) || 0;
        const bv = Number(b.size) || 0;
        return av === bv ? 0 : av < bv ? -1 : 1;
      }
      case 'lastModified': {
        const av = new Date(a.lastModified).getTime() || 0;
        const bv = new Date(b.lastModified).getTime() || 0;
        return av === bv ? 0 : av < bv ? -1 : 1;
      }
      case 'categoryCount': {
        const ac = this.countCategories(a);
        const bc = this.countCategories(b);
        return ac === bc ? 0 : ac < bc ? -1 : 1;
      }
      case 'unassignedCount': {
        const au = this.countUnassignedTypes(a);
        const bu = this.countUnassignedTypes(b);
        return au === bu ? 0 : au < bu ? -1 : 1;
      }
      default:
        return 0;
    }
  }

  private static countCategories(v: Video): number {
    const standard = Object.values(v.categories || {}).reduce<number>((sum, arr: unknown) => {
      const count = Array.isArray(arr) ? arr.length : 0;
      return sum + count;
    }, 0);
    const custom = Object.values(v.customCategories || {}).reduce<number>((sum, arr: unknown) => {
      const count = Array.isArray(arr) ? arr.length : 0;
      return sum + count;
    }, 0);
    return standard + custom;
  }

  private static readonly STANDARD_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality'];

  private static countUnassignedTypes(v: Video): number {
    return this.STANDARD_TYPES.filter(
      (type) => !Array.isArray(v.categories[type]) || v.categories[type].length === 0,
    ).length;
  }
}
