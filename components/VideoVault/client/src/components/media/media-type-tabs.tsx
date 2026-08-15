import { Button } from '@/components/ui/button';
import type { MediaType } from '@/types/media';
import { Film, Headphones, BookOpen, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaTypeTabsProps {
  activeTypes: MediaType[];
  counts: {
    video: number;
    audiobook: number;
    ebook: number;
  };
  onChange: (types: MediaType[]) => void;
  className?: string;
}

interface TabConfig {
  type: MediaType | 'all';
  label: string;
  icon: React.ReactNode;
  color: string;
  activeColor: string;
}

const TABS: TabConfig[] = [
  {
    type: 'all',
    label: 'All',
    icon: <LayoutGrid className="h-4 w-4" />,
    color: 'text-muted-foreground',
    activeColor: 'bg-primary text-primary-foreground',
  },
  {
    type: 'video',
    label: 'Videos',
    icon: <Film className="h-4 w-4" />,
    color: 'text-blue-400',
    activeColor: 'bg-blue-600 text-white',
  },
  {
    type: 'audiobook',
    label: 'Audiobooks',
    icon: <Headphones className="h-4 w-4" />,
    color: 'text-purple-400',
    activeColor: 'bg-purple-600 text-white',
  },
  {
    type: 'ebook',
    label: 'Ebooks',
    icon: <BookOpen className="h-4 w-4" />,
    color: 'text-green-400',
    activeColor: 'bg-green-600 text-white',
  },
];

export function MediaTypeTabs({
  activeTypes,
  counts,
  onChange,
  className,
}: MediaTypeTabsProps) {
  const allTypes: MediaType[] = ['video', 'audiobook', 'ebook'];
  const isAllActive =
    activeTypes.length === 3 ||
    activeTypes.length === 0 ||
    (activeTypes.includes('video') &&
      activeTypes.includes('audiobook') &&
      activeTypes.includes('ebook'));

  const handleTabClick = (type: MediaType | 'all') => {
    if (type === 'all') {
      onChange(allTypes);
    } else {
      onChange([type]);
    }
  };

  const getCount = (type: MediaType | 'all'): number => {
    if (type === 'all') {
      return counts.video + counts.audiobook + counts.ebook;
    }
    return counts[type];
  };

  const isActive = (type: MediaType | 'all'): boolean => {
    if (type === 'all') {
      return isAllActive;
    }
    return !isAllActive && activeTypes.length === 1 && activeTypes[0] === type;
  };

  return (
    <div className={cn('flex items-center gap-1 p-1 bg-muted/50 rounded-lg', className)}>
      {TABS.map((tab) => {
        const active = isActive(tab.type);
        const count = getCount(tab.type);

        return (
          <Button
            key={tab.type}
            variant={active ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleTabClick(tab.type)}
            className={cn(
              'flex items-center gap-2 transition-all',
              active ? tab.activeColor : tab.color,
              !active && 'hover:bg-muted',
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                active ? 'bg-white/20' : 'bg-muted',
              )}
            >
              {count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
