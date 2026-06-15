import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface HelpSection {
  key: string;
  icon: string;
}

const SECTIONS: HelpSection[] = [
  { key: 'gettingStarted', icon: '\u{1F680}' },
  { key: 'scanning', icon: '\u{1F4C1}' },
  { key: 'browsing', icon: '\u{1F3AC}' },
  { key: 'filtering', icon: '\u{1F50D}' },
  { key: 'tagging', icon: '\u{1F3F7}\u{FE0F}' },
  { key: 'focusMode', icon: '\u{1F3AF}' },
  { key: 'duplicates', icon: '\u{1F4CB}' },
  { key: 'mediaTypes', icon: '\u{1F4DA}' },
  { key: 'analytics', icon: '\u{1F4CA}' },
  { key: 'settings', icon: '\u{2699}\u{FE0F}' },
];

export function HelpScreen() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  return (
    <>
      <button
        className="fixed bottom-6 right-6 z-[900] w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 hover:shadow-xl transition-all duration-200 border border-border"
        onClick={() => setIsOpen(true)}
        aria-label={t('help.title', 'Help')}
        title={t('help.title', 'Help')}
        data-testid="help-button"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[800px] w-[92vw] max-h-[85vh] p-0 gap-0 overflow-hidden" data-testid="help-dialog">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{t('help.title', 'Help Guide')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden min-h-0" style={{ height: '65vh' }}>
            {/* Sidebar */}
            <nav className="w-[200px] shrink-0 border-r bg-muted/30 overflow-y-auto p-2 hidden sm:block">
              {SECTIONS.map((section, i) => (
                <button
                  key={section.key}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-left transition-colors ${
                    activeSection === i
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  onClick={() => setActiveSection(i)}
                >
                  <span className="text-base shrink-0">{section.icon}</span>
                  <span className="truncate">{t(`help.sections.${section.key}.title`, section.key)}</span>
                </button>
              ))}
            </nav>

            {/* Mobile tabs */}
            <div className="sm:hidden flex overflow-x-auto border-b p-1 gap-1 shrink-0">
              {SECTIONS.map((section, i) => (
                <button
                  key={section.key}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                    activeSection === i
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={() => setActiveSection(i)}
                >
                  <span>{section.icon}</span>
                  <span>{t(`help.sections.${SECTIONS[i].key}.title`, SECTIONS[i].key)}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6" data-testid="help-content">
              <h3 className="text-lg font-semibold mb-4">
                {t(`help.sections.${SECTIONS[activeSection].key}.title`, SECTIONS[activeSection].key)}
              </h3>
              <ul className="space-y-0">
                {(t(`help.sections.${SECTIONS[activeSection].key}.items`, { returnObjects: true }) as string[]).map(
                  (item: string, i: number) => (
                    <li
                      key={i}
                      className="py-2 px-3 text-sm text-muted-foreground border-b border-border last:border-b-0 relative pl-6"
                    >
                      <span className="absolute left-2 text-primary font-bold">&bull;</span>
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
