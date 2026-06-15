import { useEffect, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { DialogTitle } from '@/components/ui/dialog';
import { filterShortcutGroups, Shortcut } from '@/config/shortcuts';

const isEditableTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.getAttribute !== 'function') return false;
  if (el.isContentEditable) return true;

  const tag = el.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON'].includes(tag)) {
    return true;
  }

  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
};

const ShortcutKeys = ({ keys }: { keys: Shortcut['keys'] }) => (
  <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
    {keys.map((combo) => {
      const parts = combo
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean);
      return (
        <span
          key={combo}
          className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-1 text-[11px] text-muted-foreground"
        >
          {parts.map((part, index) => (
            <span className="flex items-center gap-1" key={`${combo}-${part}-${index}`}>
              {index > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-foreground">
                {part}
              </kbd>
            </span>
          ))}
        </span>
      );
    })}
  </div>
);

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isQuestionMark = event.key === '?' || (event.key === '/' && event.shiftKey);
      if (!isQuestionMark) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      setOpen((prev) => !prev);
      setSearch('');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredGroups = useMemo(() => filterShortcutGroups(search), [search]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSearch('');
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      data-testid="shortcuts-overlay"
      data-state={open ? 'open' : 'closed'}
    >
      <div className="border-b px-4 pt-4 pb-3">
        <DialogTitle className="text-base leading-tight">Keyboard shortcuts</DialogTitle>
        <p className="text-xs text-muted-foreground">
          Press ? to toggle this overlay. Type to search; press Esc to close.
        </p>
      </div>
      <CommandInput
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder="Search shortcuts..."
      />
      <CommandList>
        <CommandEmpty>No shortcuts found.</CommandEmpty>
        {filteredGroups.map((group, index) => (
          <div key={group.id}>
            <CommandGroup heading={group.title}>
              {group.shortcuts.map((shortcut) => (
                <CommandItem
                  key={shortcut.id}
                  value={`${shortcut.title} ${shortcut.description ?? ''} ${shortcut.keys.join(' ')}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{shortcut.title}</span>
                    {(shortcut.description || shortcut.context) && (
                      <span className="text-xs text-muted-foreground">
                        {shortcut.description}
                        {shortcut.description && shortcut.context ? ' · ' : ''}
                        {shortcut.context ?? ''}
                      </span>
                    )}
                  </div>
                  <ShortcutKeys keys={shortcut.keys} />
                </CommandItem>
              ))}
            </CommandGroup>
            {index < filteredGroups.length - 1 && <CommandSeparator />}
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
