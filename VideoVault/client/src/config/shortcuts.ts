export type Shortcut = {
  id: string;
  title: string;
  keys: string[];
  description?: string;
  context?: string;
};

export type ShortcutGroup = {
  id: string;
  title: string;
  shortcuts: Shortcut[];
};

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'global',
    title: 'Global',
    shortcuts: [
      {
        id: 'open-help',
        title: 'Open shortcuts help',
        keys: ['?'],
        description: 'Toggle the shortcuts overlay from anywhere in the app.',
      },
      {
        id: 'toggle-sidebar',
        title: 'Toggle sidebar',
        keys: ['Ctrl + B', 'Cmd + B'],
        description: 'Collapse or expand the navigation sidebar.',
      },
    ],
  },
  {
    id: 'focus-mode',
    title: 'Focus Mode',
    shortcuts: [
      {
        id: 'open-focus-mode',
        title: 'Open focus mode',
        keys: ['F'],
        description: 'Open focused video in Focus Mode for detailed editing.',
        context: 'Focused video card',
      },
      {
        id: 'focus-prev-next',
        title: 'Previous / Next video',
        keys: ['J', 'K'],
        description: 'Navigate to previous or next video in the playlist.',
        context: 'Focus Mode',
      },
      {
        id: 'focus-save',
        title: 'Save changes',
        keys: ['Ctrl + S', 'Cmd + S'],
        description: 'Save all pending changes to the current video.',
        context: 'Focus Mode',
      },
      {
        id: 'focus-generate-name',
        title: 'Generate name',
        keys: ['G'],
        description: 'Generate display name and filename from categories.',
        context: 'Focus Mode',
      },
      {
        id: 'focus-exit',
        title: 'Exit focus mode',
        keys: ['Escape'],
        description: 'Return to the library view.',
        context: 'Focus Mode',
      },
    ],
  },
  {
    id: 'library-navigation',
    title: 'Library browsing',
    shortcuts: [
      {
        id: 'navigate-grid',
        title: 'Move focus across videos',
        keys: ['Arrow Up', 'Arrow Down', 'Arrow Left', 'Arrow Right'],
        description: 'Keyboard navigation in grid/list view.',
        context: 'Library grid/list view',
      },
      {
        id: 'jump-list',
        title: 'Jump to first/last video',
        keys: ['Home', 'End'],
        description: 'Moves keyboard focus to the start or end of the list.',
        context: 'Library grid/list view',
      },
      {
        id: 'open-focused-video',
        title: 'Open focused video',
        keys: ['Enter', 'Space'],
        description: 'Starts playback for the focused video card.',
        context: 'Library grid/list view',
      },
      {
        id: 'clear-focus-selection',
        title: 'Clear focus and selection',
        keys: ['Escape'],
        description: 'Exit keyboard navigation and deselect videos.',
        context: 'Library grid/list view',
      },
    ],
  },
  {
    id: 'video-card',
    title: 'Video card actions',
    shortcuts: [
      {
        id: 'edit-tags',
        title: 'Edit tags',
        keys: ['E'],
        description: 'Opens tag editor for the focused video.',
        context: 'Focused video card',
      },
      {
        id: 'rename',
        title: 'Rename video',
        keys: ['R'],
        description: 'Starts renaming the focused video.',
        context: 'Focused video card',
      },
      {
        id: 'move',
        title: 'Move video',
        keys: ['M'],
        description: 'Opens move dialog for the focused video.',
        context: 'Focused video card',
      },
      {
        id: 'delete',
        title: 'Delete video',
        keys: ['Delete'],
        description: 'Prompts before deleting the focused video from disk.',
        context: 'Focused video card',
      },
    ],
  },
  {
    id: 'playback',
    title: 'Player controls',
    shortcuts: [
      {
        id: 'toggle-playback',
        title: 'Play / Pause',
        keys: ['Space'],
        description: 'Toggle playback while the player is focused.',
        context: 'Video player modal',
      },
      {
        id: 'seek',
        title: 'Seek',
        keys: ['Arrow Left', 'Arrow Right'],
        description: 'Seek 5 seconds; hold Shift for 30 second jumps.',
        context: 'Video player modal',
      },
      {
        id: 'mute',
        title: 'Mute / Unmute',
        keys: ['M'],
        context: 'Video player modal',
      },
      {
        id: 'fullscreen',
        title: 'Toggle fullscreen',
        keys: ['F'],
        context: 'Video player modal',
      },
      {
        id: 'prev-next',
        title: 'Previous / Next video',
        keys: ['J', 'K'],
        description: 'Moves to previous/next video in the current playlist.',
        context: 'Video player modal',
      },
    ],
  },
];

export const normalize = (value: string): string => value.normalize('NFKD').toLowerCase();

export const filterShortcutGroups = (query: string): ShortcutGroup[] => {
  const needle = normalize(query.trim());
  if (!needle) return SHORTCUT_GROUPS;

  return SHORTCUT_GROUPS.map((group) => {
    const shortcuts = group.shortcuts.filter((shortcut) => {
      const haystack = [
        shortcut.title,
        shortcut.description ?? '',
        shortcut.keys.join(' '),
        shortcut.context ?? '',
        group.title,
      ]
        .map(normalize)
        .join(' ');
      return haystack.includes(needle);
    });
    return { ...group, shortcuts };
  }).filter((group) => group.shortcuts.length > 0);
};
