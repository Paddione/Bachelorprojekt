import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/components/ui/theme-provider';
import {
  Library,
  Moon,
  Sun,
  FolderOpen,
  FolderPlus,
  FolderMinus,
  XCircle,
  Settings,
  Lock,
  Copy,
  SlidersHorizontal,
  Tags,
  MoreHorizontal,
  HardDrive,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { AuthService } from '@/services/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  isScanning: boolean;
  scanProgress: { current: number; total: number };
  onScanDirectory: () => void;
  onCreateDirectory?: () => void;
  onDeleteDirectory?: () => void;
  onCancelScan?: () => void;
  onRescanLastRoot?: () => void;
  onOpenSettings?: () => void;
  onToggleFilters?: () => void;
  activeFilterCount?: number;
  isFiltersOpen?: boolean;
}

export function Header({
  isScanning,
  scanProgress,
  onScanDirectory,
  onCreateDirectory,
  onDeleteDirectory,
  onCancelScan,
  onRescanLastRoot,
  onOpenSettings,
  onToggleFilters,
  activeFilterCount = 0,
  isFiltersOpen,
}: HeaderProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [isAdmin, setIsAdmin] = useState(AuthService.cachedIsAdmin);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    void AuthService.refresh();
    const unsubscribe = AuthService.subscribe(setIsAdmin);
    return () => {
      unsubscribe?.();
    };
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <header className="videovault-header sticky top-0 z-100">
      <div className="flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="videovault-logo">
          <Library className="h-8 w-8 text-primary shadow-glow-cyan" />
          <h1 className="text-2xl font-bold">{t('app.title')}</h1>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {onToggleFilters && (
            <Button
              variant={isFiltersOpen ? 'default' : 'outline'}
              size="sm"
              className="px-3 min-h-[40px] lg:hidden"
              data-testid="button-open-filters"
              title="Toggle filters"
              onClick={onToggleFilters}
              aria-pressed={!!isFiltersOpen}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {t('header.filters')}
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          )}

          {onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              data-testid="button-settings"
              className="p-2 min-h-[40px]"
              title={t('header.settings')}
              aria-label="Open settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void (async () => {
                if (isAdmin) {
                  await AuthService.logout();
                } else {
                  await AuthService.promptAndLogin();
                }
              })();
            }}
            data-testid="button-admin-login"
            className="px-3 min-h-[40px]"
            title={isAdmin ? t('header.adminLogout') : t('header.adminLogin')}
          >
            <Lock className="h-4 w-4 mr-1" />
            {t('header.adminLogin')}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
            className="p-2 min-h-[40px]"
            title={t('header.toggleTheme')}
            aria-label={t('header.toggleTheme')}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          {/* Retract/Expand toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-2 min-h-[40px]"
            title={isExpanded ? 'Collapse toolbar' : 'Expand toolbar'}
            aria-label={isExpanded ? 'Collapse toolbar' : 'Expand toolbar'}
            aria-pressed={isExpanded}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Retractable Action Bar */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-40 opacity-100 mt-6' : 'max-h-0 opacity-0 mt-0'
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between p-4 bg-cv-glass-2 rounded-lg border border-cv-border-2">
          {/* Desktop View */}
          <div className="hidden lg:flex flex-wrap items-center gap-3">
            <Button
              onClick={onScanDirectory}
              disabled={isScanning}
              data-testid="button-scan-directory"
              variant="default"
              size="sm"
              className="min-h-[42px] cv-btn-primary shadow-glow-cyan"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              {t('header.scanDirectory')}
            </Button>
          </div>

          <div className="hidden lg:flex flex-wrap items-center gap-2 justify-end">
            <Link href="/duplicates">
              <Button variant="outline" size="sm" data-testid="button-duplicates" className="min-h-[40px]">
                <Copy className="mr-2 h-4 w-4" />
                {t('header.duplicates')}
              </Button>
            </Link>

            <Link href="/tags">
              <Button variant="outline" size="sm" data-testid="button-tags" className="min-h-[40px]">
                <Tags className="mr-2 h-4 w-4" />
                {t('header.tags')}
              </Button>
            </Link>

            <Link href="/browse">
              <Button variant="outline" size="sm" data-testid="button-browse" className="min-h-[40px]">
                <HardDrive className="mr-2 h-4 w-4" />
                {t('header.browse')}
              </Button>
            </Link>

            {onCreateDirectory && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateDirectory}
                data-testid="button-create-directory"
                className="min-h-[40px]"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                {t('header.newFolder')}
              </Button>
            )}

            {onDeleteDirectory && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDeleteDirectory}
                data-testid="button-delete-directory"
                className="min-h-[40px]"
              >
                <FolderMinus className="mr-2 h-4 w-4" />
                {t('header.deleteFolder')}
              </Button>
            )}

            {onToggleFilters && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onToggleFilters}
                className="min-h-[40px]"
                aria-pressed={!!isFiltersOpen}
                data-testid="button-open-filters-desktop"
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                {t('header.filters')}
                {activeFilterCount > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            )}
          </div>

          {/* Mobile View */}
          <div className="flex lg:hidden items-center gap-2 w-full">
            <Button
              onClick={onScanDirectory}
              disabled={isScanning}
              data-testid="button-scan-directory-mobile"
              variant="outline"
              size="sm"
              className="flex-1 min-h-[40px]"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              {t('common.scan')}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="min-h-[40px] px-3" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/duplicates" className="w-full cursor-pointer flex items-center">
                    <Copy className="mr-2 h-4 w-4" /> {t('header.duplicates')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/tags" className="w-full cursor-pointer flex items-center">
                    <Tags className="mr-2 h-4 w-4" /> {t('header.tags')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/browse" className="w-full cursor-pointer flex items-center">
                    <HardDrive className="mr-2 h-4 w-4" /> {t('header.browseHdd')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onCreateDirectory && (
                  <DropdownMenuItem onClick={onCreateDirectory}>
                    <FolderPlus className="mr-2 h-4 w-4" /> {t('header.newFolder')}
                  </DropdownMenuItem>
                )}
                {onDeleteDirectory && (
                  <DropdownMenuItem onClick={onDeleteDirectory} className="text-destructive">
                    <FolderMinus className="mr-2 h-4 w-4" /> {t('header.deleteFolder')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Progress Bar (shown when scanning) */}
      {isScanning && (
        <div className="flex items-center justify-center mt-4 pt-4 border-t border-border">
          <div className="flex items-center space-x-3" data-testid="scan-progress">
            <span className="text-sm text-muted-foreground">{t('header.scanningFiles')}</span>
            <div className="w-48">
              <Progress
                value={
                  scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0
                }
                className="h-2"
              />
            </div>
            <span className="text-sm font-medium text-foreground">
              {scanProgress.current}/{scanProgress.total}
            </span>
            {onCancelScan && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onCancelScan}
                data-testid="button-cancel-scan"
                className="min-h-[38px]"
              >
                <XCircle className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
