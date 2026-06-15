import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppSettingsService } from '@/services/app-settings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AuthService } from '@/services/auth';
import { ApiClient } from '@/services/api-client';
import { VideoDatabase } from '@/services/video-database';
import {
  Settings,
  Save,
  RotateCcw,
  FileVideo,
  Keyboard,
  Monitor,
  Palette,
  ShieldAlert,
  LogIn,
  LogOut,
  Languages,
  Trash2,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface Settings {
  // File scanning preferences
  supportedExtensions: string[];
  maxScanConcurrency: number;

  // UI preferences
  defaultSortField: 'displayName' | 'lastModified' | 'size' | 'path' | 'categoryCount' | 'unassignedCount';
  defaultSortDirection: 'asc' | 'desc';
  uiDensity: 'compact' | 'comfortable' | 'spacious';
  showThumbnails: boolean;
  showHoverPreviews: boolean;

  // Keyboard shortcuts
  enableKeyboardNavigation: boolean;
  enableKeyboardShortcuts: boolean;

  // Performance preferences
  enableVirtualization: boolean;
  virtualizationThreshold: number;
  thumbnailQuality: 'low' | 'medium' | 'high';
  enableSpriteThumbnails: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  supportedExtensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'm4v'],
  maxScanConcurrency: 4,
  defaultSortField: 'displayName',
  defaultSortDirection: 'asc',
  uiDensity: 'comfortable',
  showThumbnails: true,
  showHoverPreviews: true,
  enableKeyboardNavigation: true,
  enableKeyboardShortcuts: true,
  enableVirtualization: true,
  virtualizationThreshold: 60,
  thumbnailQuality: 'medium',
  enableSpriteThumbnails: true,
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

export function SettingsModal({ isOpen, onClose, onSettingsChange }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [isAdmin, setIsAdmin] = useState(AuthService.cachedIsAdmin);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [isProcessingHddExt, setIsProcessingHddExt] = useState(false);

  // Load settings from server on mount
  useEffect(() => {
    void (async () => {
      try {
        const saved = await AppSettingsService.get<Settings>('vv.settings');
        if (saved && typeof saved === 'object') {
          setSettings({ ...DEFAULT_SETTINGS, ...saved });
        }
      } catch { }
    })();
    // also refresh auth state
    void AuthService.refresh();
    const unsub = AuthService.subscribe(setIsAdmin);
    return () => {
      unsub?.();
    };
  }, []);

  // Check for changes compared to server-synced baseline
  useEffect(() => {
    void (async () => {
      try {
        const saved = await AppSettingsService.get<Settings>('vv.settings');
        if (saved) {
          setHasChanges(
            JSON.stringify(settings) !== JSON.stringify({ ...DEFAULT_SETTINGS, ...saved }),
          );
          return;
        }
      } catch { }
      setHasChanges(JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS));
    })();
  }, [settings]);

  const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleExtensionsChange = (value: string) => {
    const extensions = value.split(',').map((ext) => ext.trim().toLowerCase().replace(/^\./, ''));
    handleSettingChange('supportedExtensions', extensions);
  };

  const handleSave = async () => {
    await AppSettingsService.set('vv.settings', settings);
    setHasChanges(false);
    onSettingsChange?.(settings);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
  };

  const handleCleanupMissing = async () => {
    if (!confirm(t('settings.confirmCleanup'))) {
      return;
    }

    setIsCleaning(true);
    try {
      const result = await VideoDatabase.cleanupMissingVideos();
      alert(t('settings.cleanupComplete', { count: result.deletedCount }));
    } catch (error: any) {
      alert(t('settings.cleanupFailed', { error: error.message }));
    } finally {
      setIsCleaning(false);
    }
  };

  const handleRescanMovies = async () => {
    setIsRescanning(true);
    try {
      const result = await ApiClient.post<{ queued: number; message: string }>('/api/processing/movies/rescan');
      alert(result.message);
    } catch (error: any) {
      alert(t('settings.rescanFailed', { error: error.message }));
    } finally {
      setIsRescanning(false);
    }
  };

  const handleIndexHddExt = async () => {
    setIsProcessingHddExt(true);
    try {
      const result = await ApiClient.post<{ indexed: number; skipped: number; errors: number; total: number }>('/api/processing/hdd-ext/index');
      alert(t('settings.indexComplete', { indexed: result.indexed, skipped: result.skipped, errors: result.errors, total: result.total }));
    } catch (error: any) {
      alert(t('settings.indexFailed', { error: error.message }));
    } finally {
      setIsProcessingHddExt(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (confirm(t('settings.unsavedChanges'))) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('settings.title')}
          </DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        {/* Auth status */}
        <div className="mb-2 flex items-center justify-between rounded border p-3 bg-muted/40">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert
              className={isAdmin ? 'text-green-600 h-4 w-4' : 'text-amber-600 h-4 w-4'}
            />
            <span className="text-foreground">
              {isAdmin ? t('settings.loggedInAsAdmin') : t('settings.adminLocked')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isAdmin ? (
              <button
                onClick={() => {
                  void AuthService.promptAndLogin();
                }}
                className="text-primary text-sm inline-flex items-center gap-1"
                data-testid="button-admin-login-inline"
              >
                <LogIn className="h-4 w-4" /> {t('common.login')}
              </button>
            ) : (
              <button
                onClick={() => {
                  void AuthService.logout();
                }}
                className="text-muted-foreground text-sm inline-flex items-center gap-1"
                data-testid="button-admin-logout-inline"
              >
                <LogOut className="h-4 w-4" /> {t('common.logout')}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6 py-4">
          {/* File Scanning Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileVideo className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{t('settings.fileScanning')}</h3>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="extensions">{t('settings.supportedExtensions')}</Label>
                <Input
                  id="extensions"
                  value={settings.supportedExtensions.join(', ')}
                  onChange={(e) => handleExtensionsChange(e.target.value)}
                  placeholder={t('settings.extensionsPlaceholder')}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.extensionsHelp')}
                </p>
              </div>

              <div>
                <Label htmlFor="concurrency">{t('settings.maxConcurrency')}</Label>
                <Select
                  value={settings.maxScanConcurrency.toString()}
                  onValueChange={(value) =>
                    handleSettingChange('maxScanConcurrency', parseInt(value))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">{t('settings.concurrencyFiles', { count: 2 })}</SelectItem>
                    <SelectItem value="4">{t('settings.concurrencyFiles', { count: 4 })}</SelectItem>
                    <SelectItem value="8">{t('settings.concurrencyFiles', { count: 8 })}</SelectItem>
                    <SelectItem value="16">{t('settings.concurrencyFiles', { count: 16 })}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.concurrencyHelp')}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Language Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{t('settings.language')}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="language">{t('settings.displayLanguage')}</Label>
                <Select
                  value={i18n.language}
                  onValueChange={(value) => i18n.changeLanguage(value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t('settings.langEnglish')}</SelectItem>
                    <SelectItem value="de">{t('settings.langGerman')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* UI Preferences Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{t('settings.interface')}</h3>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="defaultSort">{t('settings.defaultSort')}</Label>
                  <Select
                    value={settings.defaultSortField}
                    onValueChange={(value: Settings['defaultSortField']) =>
                      handleSettingChange('defaultSortField', value)
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="displayName">{t('settings.sortName')}</SelectItem>
                      <SelectItem value="lastModified">{t('settings.sortDateModified')}</SelectItem>
                      <SelectItem value="size">{t('settings.sortFileSize')}</SelectItem>
                      <SelectItem value="path">{t('settings.sortPath')}</SelectItem>
                      <SelectItem value="categoryCount">{t('settings.sortCategoryCount')}</SelectItem>
                      <SelectItem value="unassignedCount">Unassigned types</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="sortDirection">{t('settings.sortDirection')}</Label>
                  <Select
                    value={settings.defaultSortDirection}
                    onValueChange={(value: Settings['defaultSortDirection']) =>
                      handleSettingChange('defaultSortDirection', value)
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">{t('settings.sortAscending')}</SelectItem>
                      <SelectItem value="desc">{t('settings.sortDescending')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="uiDensity">{t('settings.uiDensity')}</Label>
                <Select
                  value={settings.uiDensity}
                  onValueChange={(value: Settings['uiDensity']) =>
                    handleSettingChange('uiDensity', value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">{t('settings.densityCompact')}</SelectItem>
                    <SelectItem value="comfortable">{t('settings.densityComfortable')}</SelectItem>
                    <SelectItem value="spacious">{t('settings.densitySpacious')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="showThumbnails">{t('settings.showThumbnails')}</Label>
                  <Switch
                    id="showThumbnails"
                    checked={settings.showThumbnails}
                    onCheckedChange={(checked) => handleSettingChange('showThumbnails', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="showHoverPreviews">{t('settings.showHoverPreviews')}</Label>
                  <Switch
                    id="showHoverPreviews"
                    checked={settings.showHoverPreviews}
                    onCheckedChange={(checked) => handleSettingChange('showHoverPreviews', checked)}
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Keyboard Navigation Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{t('settings.keyboardNavigation')}</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="enableKeyboardNav">{t('settings.enableArrowKeys')}</Label>
                <Switch
                  id="enableKeyboardNav"
                  checked={settings.enableKeyboardNavigation}
                  onCheckedChange={(checked) =>
                    handleSettingChange('enableKeyboardNavigation', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="enableShortcuts">{t('settings.enableShortcuts')}</Label>
                <Switch
                  id="enableShortcuts"
                  checked={settings.enableKeyboardShortcuts}
                  onCheckedChange={(checked) =>
                    handleSettingChange('enableKeyboardShortcuts', checked)
                  }
                />
              </div>

              {settings.enableKeyboardShortcuts && (
                <div className="bg-muted p-3 rounded-md text-sm">
                  <h4 className="font-medium mb-2">{t('settings.availableShortcuts')}</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <kbd className="bg-background px-1 py-0.5 rounded">E</kbd> {t('settings.shortcutEditTags')}
                    </div>
                    <div>
                      <kbd className="bg-background px-1 py-0.5 rounded">R</kbd> {t('settings.shortcutRename')}
                    </div>
                    <div>
                      <kbd className="bg-background px-1 py-0.5 rounded">M</kbd> {t('settings.shortcutMove')}
                    </div>
                    <div>
                      <kbd className="bg-background px-1 py-0.5 rounded">Delete</kbd> {t('settings.shortcutDelete')}
                    </div>
                    <div>
                      <kbd className="bg-background px-1 py-0.5 rounded">Space</kbd> {t('settings.shortcutPlay')}
                    </div>
                    <div>
                      <kbd className="bg-background px-1 py-0.5 rounded">Esc</kbd> {t('settings.shortcutClearFocus')}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Performance Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{t('settings.performance')}</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="enableVirtualization">{t('settings.enableVirtualization')}</Label>
                <Switch
                  id="enableVirtualization"
                  checked={settings.enableVirtualization}
                  onCheckedChange={(checked) =>
                    handleSettingChange('enableVirtualization', checked)
                  }
                />
              </div>

              {settings.enableVirtualization && (
                <div>
                  <Label htmlFor="virtualizationThreshold">{t('settings.virtualizationThreshold')}</Label>
                  <Select
                    value={settings.virtualizationThreshold.toString()}
                    onValueChange={(value) =>
                      handleSettingChange('virtualizationThreshold', parseInt(value))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">{t('settings.videosThreshold', { count: 30 })}</SelectItem>
                      <SelectItem value="60">{t('settings.videosThreshold', { count: 60 })}</SelectItem>
                      <SelectItem value="100">{t('settings.videosThreshold', { count: 100 })}</SelectItem>
                      <SelectItem value="200">{t('settings.videosThreshold', { count: 200 })}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('settings.virtualizationHelp')}
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="thumbnailQuality">{t('settings.thumbnailQuality')}</Label>
                <Select
                  value={settings.thumbnailQuality}
                  onValueChange={(value: Settings['thumbnailQuality']) =>
                    handleSettingChange('thumbnailQuality', value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('settings.qualityLow')}</SelectItem>
                    <SelectItem value="medium">{t('settings.qualityMedium')}</SelectItem>
                    <SelectItem value="high">{t('settings.qualityHigh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="enableSpriteThumbs">{t('settings.enableSpriteThumbnails')}</Label>
                <Switch
                  id="enableSpriteThumbs"
                  checked={settings.enableSpriteThumbnails}
                  onCheckedChange={(checked) =>
                    handleSettingChange('enableSpriteThumbnails', checked)
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.spriteThumbnailsHelp')}
              </p>
            </div>
          </div>

          <Separator />

          {/* Maintenance Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{t('settings.maintenance')}</h3>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <Label>{t('settings.databaseCleanup')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.cleanupHelp')}
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCleanupMissing}
                  disabled={isCleaning || !isAdmin}
                  className="w-fit flex items-center gap-2"
                >
                  {isCleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t('settings.clearMissingEntries')}
                </Button>
                {!isAdmin && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" /> {t('settings.adminRequiredCleanup')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t('settings.rescanMovies')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.rescanMoviesHelp')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRescanMovies}
                  disabled={isRescanning}
                  className="w-fit flex items-center gap-2"
                >
                  {isRescanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('settings.rescanMovies')}
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t('settings.indexHddExt')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.indexHddExtHelp')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleIndexHddExt}
                  disabled={isProcessingHddExt}
                  className="w-fit flex items-center gap-2"
                >
                  {isProcessingHddExt ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('settings.indexHddExt')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={handleReset} className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            {t('settings.resetToDefaults')}
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                void handleSave();
              }}
              disabled={!hasChanges}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {t('settings.saveChanges')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
