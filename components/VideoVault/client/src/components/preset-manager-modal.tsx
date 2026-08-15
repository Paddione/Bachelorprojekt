import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterPresetsService } from '@/services/filter-presets';
import { FilterPreset } from '@/types/video';
import { Trash2, Download, Upload, Plus } from 'lucide-react';

interface PresetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPreset: (preset: FilterPreset) => void;
}

export function PresetManagerModal({ isOpen, onClose, onLoadPreset }: PresetManagerModalProps) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPresets(FilterPresetsService.loadAllPresets());
    }
  }, [isOpen]);

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;

    // This would need to be implemented with the current filter state
    // For now, we'll create a placeholder preset
    const newPreset: FilterPreset = {
      name: newPresetName.trim(),
      categories: [],
      searchQuery: '',
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    FilterPresetsService.savePreset(newPreset.name, newPreset.categories, newPreset.searchQuery, {
      dateRange: newPreset.dateRange,
      fileSizeRange: newPreset.fileSizeRange,
      durationRange: newPreset.durationRange,
    });

    setPresets(FilterPresetsService.loadAllPresets());
    setNewPresetName('');
  };

  const handleDeletePreset = (presetName: string) => {
    FilterPresetsService.deletePreset(presetName);
    setPresets(FilterPresetsService.loadAllPresets());
  };

  const handleExportPresets = () => {
    const data = FilterPresetsService.exportPresets();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'videovault-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPresets = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as string;
        const count = FilterPresetsService.importPresets(data);
        setPresets(FilterPresetsService.loadAllPresets());
        alert(t('presets.importSuccess', { count }));
      } catch (error) {
        alert(t('presets.importFailed', { error: (error as Error).message }));
      }
    };
    reader.readAsText(file);
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    onLoadPreset(preset);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('presets.title')}</DialogTitle>
          <DialogDescription>
            {t('presets.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create New Preset */}
          <div className="flex items-center space-x-2">
            <Input
              placeholder={t('presets.newPresetPlaceholder')}
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSavePreset()}
            />
            <Button onClick={handleSavePreset} disabled={!newPresetName.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              {t('common.save')}
            </Button>
          </div>

          {/* Presets List */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {presets.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                {t('presets.noPresets')}
              </p>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.name}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <h4 className="font-medium">{preset.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {preset.categories.length > 0 && `${preset.categories.length} ${t('presets.categories')}`}
                      {preset.searchQuery && ` • "${preset.searchQuery}"`}
                      {preset.dateRange.startDate && preset.dateRange.endDate && ` • ${t('presets.dateRange')}`}
                      {preset.fileSizeRange.min > 0 ||
                        (preset.fileSizeRange.max > 0 && ` • ${t('presets.fileSize')}`)}
                      {preset.durationRange.min > 0 ||
                        (preset.durationRange.max > 0 && ` • ${t('presets.duration')}`)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-load-${preset.name}`}
                      onClick={() => handleLoadPreset(preset)}
                    >
                      {t('presets.load')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-delete-${preset.name}`}
                      onClick={() => handleDeletePreset(preset.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Import/Export */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleExportPresets}>
                <Download className="h-4 w-4 mr-2" />
                {t('common.export')}
              </Button>
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportPresets}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  {t('common.import')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
