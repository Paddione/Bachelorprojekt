import { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useVideoManager } from '@/hooks/use-video-manager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, VideoCategories, CustomCategories } from '@/types/video';
import {
  ArrowLeft,
  Merge,
  Plus,
  X,
  FolderInput,
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const STANDARD_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality', 'performer'];

const TYPE_COLORS: Record<string, string> = {
  age: 'border-blue-500/30 bg-blue-500/5',
  physical: 'border-pink-500/30 bg-pink-500/5',
  ethnicity: 'border-amber-500/30 bg-amber-500/5',
  relationship: 'border-purple-500/30 bg-purple-500/5',
  acts: 'border-red-500/30 bg-red-500/5',
  setting: 'border-green-500/30 bg-green-500/5',
  quality: 'border-cyan-500/30 bg-cyan-500/5',
  performer: 'border-orange-500/30 bg-orange-500/5',
};

const TYPE_TEXT_COLORS: Record<string, string> = {
  age: 'text-blue-400', physical: 'text-pink-400', ethnicity: 'text-amber-400',
  relationship: 'text-purple-400', acts: 'text-red-400', setting: 'text-green-400',
  quality: 'text-cyan-400', performer: 'text-orange-400',
};

// Collect all category values grouped by type across all videos
function buildCategoryIndex(videos: Video[]): Record<string, Map<string, number>> {
  const index: Record<string, Map<string, number>> = {};

  for (const v of videos) {
    // Standard
    for (const [type, values] of Object.entries(v.categories)) {
      if (!Array.isArray(values)) continue;
      if (!index[type]) index[type] = new Map();
      for (const val of values) {
        index[type].set(val, (index[type].get(val) || 0) + 1);
      }
    }
    // Custom
    for (const [type, values] of Object.entries(v.customCategories)) {
      const key = `custom:${type}`;
      if (!index[key]) index[key] = new Map();
      for (const val of values) {
        index[key].set(val, (index[key].get(val) || 0) + 1);
      }
    }
  }
  return index;
}

// Apply merge across all videos: replace oldValues with newValue in targetType
function applyMerge(
  videos: Video[],
  merges: Array<{ sourceType: string; sourceValue: string }>,
  targetType: string,
  targetValue: string,
): Video[] {
  return videos.map((v) => {
    let changed = false;
    const cats = { ...v.categories } as VideoCategories;
    const custom = { ...v.customCategories } as CustomCategories;

    for (const { sourceType, sourceValue } of merges) {
      const isSourceCustom = sourceType.startsWith('custom:');
      const rawSourceType = isSourceCustom ? sourceType.slice(7) : sourceType;
      const isTargetCustom = targetType.startsWith('custom:');
      const rawTargetType = isTargetCustom ? targetType.slice(7) : targetType;

      // Check if this video has the source value
      let hasSource = false;
      if (isSourceCustom) {
        const arr = custom[rawSourceType] || [];
        if (arr.includes(sourceValue)) {
          custom[rawSourceType] = arr.filter((x) => x !== sourceValue);
          if (custom[rawSourceType].length === 0) delete custom[rawSourceType];
          hasSource = true;
        }
      } else {
        const arr = (cats[rawSourceType] as string[]) || [];
        if (arr.includes(sourceValue)) {
          cats[rawSourceType] = arr.filter((x) => x !== sourceValue);
          hasSource = true;
        }
      }

      if (hasSource) {
        // Add target value
        if (isTargetCustom) {
          const arr = custom[rawTargetType] || [];
          if (!arr.includes(targetValue)) custom[rawTargetType] = [...arr, targetValue];
        } else {
          const arr = (cats[rawTargetType] as string[]) || [];
          if (!arr.includes(targetValue)) cats[rawTargetType] = [...arr, targetValue];
        }
        changed = true;
      }
    }

    return changed ? { ...v, categories: cats, customCategories: custom } : v;
  });
}

// Move a value from one type to another across all videos
function applyMove(
  videos: Video[],
  sourceType: string,
  value: string,
  targetType: string,
): Video[] {
  return applyMerge(videos, [{ sourceType, sourceValue: value }], targetType, value);
}

// --- Merge Dialog ---
function MergeDialog({
  categoryIndex,
  allTypes,
  onMerge,
  onClose,
}: {
  categoryIndex: Record<string, Map<string, number>>;
  allTypes: string[];
  onMerge: (sources: Array<{ type: string; value: string }>, targetType: string, targetValue: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Array<{ type: string; value: string }>>([]);
  const [targetName, setTargetName] = useState('');
  const [targetType, setTargetType] = useState(allTypes[0] || '');

  const toggleSelection = (type: string, value: string) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.type === type && s.value === value);
      if (exists) return prev.filter((s) => !(s.type === type && s.value === value));
      return [...prev, { type, value }];
    });
  };

  const canMerge = selected.length >= 2 && targetName.trim() && targetType;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Merge className="h-5 w-5 text-primary" />Merge Categories
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Select 2+ category values to merge. All videos with any selected value will receive the new merged name.
          </p>

          {/* Pick source values */}
          <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3 bg-background/50">
            {allTypes.map((type) => {
              const values = categoryIndex[type];
              if (!values || values.size === 0) return null;
              const displayType = type.startsWith('custom:') ? type.slice(7) : type;
              return (
                <div key={type}>
                  <span className={`text-xs font-medium capitalize ${TYPE_TEXT_COLORS[displayType] || 'text-muted-foreground'}`}>
                    {displayType}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1 mb-2">
                    {Array.from(values.entries()).map(([val, count]) => {
                      const isSelected = selected.some((s) => s.type === type && s.value === val);
                      return (
                        <button
                          key={`${type}:${val}`}
                          onClick={() => toggleSelection(type, val)}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/30 border-border hover:bg-muted/60'
                          }`}
                        >
                          {val} <span className="opacity-50">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {selected.length >= 2 && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Merging: {selected.map((s) => (
                  <Badge key={`${s.type}:${s.value}`} variant="outline" className="text-xs">{s.value}</Badge>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">New name</label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="Merged category name..."
                    className="w-full h-9 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Target metacategory</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="w-full h-9 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {allTypes.map((t) => (
                      <option key={t} value={t}>{t.startsWith('custom:') ? t.slice(7) : t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!canMerge}
            onClick={() => { onMerge(selected, targetType, targetName.trim().toLowerCase()); onClose(); }}
          >
            <Merge className="h-3.5 w-3.5 mr-1" />Merge {selected.length} values
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Main Category Manager Page ---
export default function CategoryManagerPage() {
  const [, setLocation] = useLocation();
  const { state, actions } = useVideoManager();
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [newMetaName, setNewMetaName] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(STANDARD_TYPES));

  // Build index: type → {value → count}
  const categoryIndex = useMemo(() => buildCategoryIndex(state.videos), [state.videos]);

  // All type keys (standard + custom)
  const allTypes = useMemo(() => {
    const types: string[] = [...STANDARD_TYPES];
    for (const key of Object.keys(categoryIndex)) {
      if (!types.includes(key)) types.push(key);
    }
    return types;
  }, [categoryIndex]);

  // Bulk update: apply a transformation to all videos
  const bulkUpdate = useCallback(
    (transform: (videos: Video[]) => Video[]) => {
      const updated = transform(state.videos);
      // Find changed videos and persist each
      for (const v of updated) {
        const original = state.videos.find((o) => o.id === v.id);
        if (!original) continue;
        if (
          JSON.stringify(v.categories) !== JSON.stringify(original.categories) ||
          JSON.stringify(v.customCategories) !== JSON.stringify(original.customCategories)
        ) {
          actions.updateVideoCategories(v.id, { categories: v.categories, customCategories: v.customCategories });
        }
      }
    },
    [state.videos, actions],
  );

  const handleMerge = useCallback(
    (sources: Array<{ type: string; value: string }>, targetType: string, targetValue: string) => {
      bulkUpdate((videos) =>
        applyMerge(videos, sources.map((s) => ({ sourceType: s.type, sourceValue: s.value })), targetType, targetValue),
      );
    },
    [bulkUpdate],
  );

  const handleMove = useCallback(
    (sourceType: string, value: string, targetType: string) => {
      bulkUpdate((videos) => applyMove(videos, sourceType, value, targetType));
    },
    [bulkUpdate],
  );

  const handleCreateMeta = useCallback(() => {
    const name = newMetaName.trim().toLowerCase();
    if (!name) return;
    // Custom metacategories exist implicitly — they appear once a value is assigned.
    // We just add it to the expanded set so it shows up.
    setExpandedTypes((prev) => new Set([...prev, `custom:${name}`]));
    setNewMetaName('');
  }, [newMetaName]);

  const handleDeleteValue = useCallback(
    (type: string, value: string) => {
      if (!confirm(`Remove "${value}" from all videos in "${type.startsWith('custom:') ? type.slice(7) : type}"?`)) return;
      bulkUpdate((videos) =>
        videos.map((v) => {
          const isCustom = type.startsWith('custom:');
          const rawType = isCustom ? type.slice(7) : type;
          if (isCustom) {
            const arr = v.customCategories[rawType] || [];
            if (!arr.includes(value)) return v;
            const filtered = arr.filter((x) => x !== value);
            const custom = { ...v.customCategories };
            if (filtered.length === 0) delete custom[rawType];
            else custom[rawType] = filtered;
            return { ...v, customCategories: custom };
          } else {
            const arr = (v.categories[rawType] as string[]) || [];
            if (!arr.includes(value)) return v;
            return { ...v, categories: { ...v.categories, [rawType]: arr.filter((x) => x !== value) } };
          }
        }),
      );
    },
    [bulkUpdate],
  );

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 border-b bg-card/80 backdrop-blur-sm">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" />Library
        </Button>
        <h1 className="text-lg font-semibold flex-1">Category Manager</h1>
        <Button variant="outline" size="sm" onClick={() => setShowMergeDialog(true)}>
          <Merge className="h-4 w-4 mr-1" />Merge
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-4">
        {/* Create new metacategory */}
        <div className="flex items-center gap-2 p-4 rounded-lg border border-dashed border-border bg-muted/20">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={newMetaName}
            onChange={(e) => setNewMetaName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateMeta(); }}
            placeholder="New metacategory name..."
            className="flex-1 h-8 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button size="sm" variant="outline" disabled={!newMetaName.trim()} onClick={handleCreateMeta}>
            Create
          </Button>
        </div>

        {/* Metacategory cards */}
        {allTypes.map((type) => {
          const values = categoryIndex[type];
          const displayType = type.startsWith('custom:') ? type.slice(7) : type;
          const isStandard = STANDARD_TYPES.includes(type);
          const isExpanded = expandedTypes.has(type);
          const colorClass = TYPE_COLORS[displayType] || 'border-slate-500/30 bg-slate-500/5';
          const textColor = TYPE_TEXT_COLORS[displayType] || 'text-slate-400';
          const valueCount = values?.size ?? 0;
          const videoCount = values ? Array.from(values.values()).reduce((a, b) => a + b, 0) : 0;

          // Other types this value could be moved to
          const otherTypes = allTypes.filter((t) => t !== type);

          return (
            <div key={type} className={`rounded-lg border ${colorClass}`}>
              {/* Card header */}
              <button
                className={`w-full flex items-center justify-between px-4 py-3 ${textColor} font-medium`}
                onClick={() => toggleType(type)}
              >
                <span className="flex items-center gap-2 capitalize">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {displayType}
                  {!isStandard && <Badge variant="outline" className="text-[10px]">custom</Badge>}
                </span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-normal">
                  <span>{valueCount} values</span>
                  <span>{videoCount} assignments</span>
                </div>
              </button>

              {/* Values list */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  {valueCount === 0 ? (
                    <p className="text-xs text-muted-foreground/50 italic">No values yet. Assign categories to videos to populate this type.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Array.from(values!.entries())
                        .sort((a, b) => b[1] - a[1])
                        .map(([val, count]) => (
                          <DropdownMenu key={val}>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium bg-background/50 hover:bg-background transition-colors cursor-pointer"
                              >
                                {val}
                                <span className="text-muted-foreground/50">({count})</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                              {/* Move to another metacategory */}
                              {otherTypes.length > 0 && (
                                <>
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
                                    <FolderInput className="h-3 w-3 inline mr-1" />Move to metacategory:
                                  </div>
                                  {otherTypes.slice(0, 12).map((t) => (
                                    <DropdownMenuItem
                                      key={t}
                                      onClick={() => handleMove(type, val, t)}
                                    >
                                      {t.startsWith('custom:') ? t.slice(7) : t}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDeleteValue(type, val)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete from all videos ({count})
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Merge dialog */}
      {showMergeDialog && (
        <MergeDialog
          categoryIndex={categoryIndex}
          allTypes={allTypes}
          onMerge={handleMerge}
          onClose={() => setShowMergeDialog(false)}
        />
      )}
    </div>
  );
}
