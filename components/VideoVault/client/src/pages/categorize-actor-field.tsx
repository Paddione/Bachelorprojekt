import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { User, X } from 'lucide-react';

export function ActorField({ assignedActors, allKnownActors, onAdd, onRemove }: {
  assignedActors: string[]; allKnownActors: string[];
  onAdd: (name: string) => void; onRemove: (name: string) => void;
}) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.toLowerCase();
    return allKnownActors.filter((a) => a.toLowerCase().includes(q) && !assignedActors.includes(a)).slice(0, 8);
  }, [input, allKnownActors, assignedActors]);

  const handleAdd = (name: string) => {
    const val = name.trim().toLowerCase();
    if (val && !assignedActors.includes(val)) onAdd(val);
    setInput('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 mb-4 p-3" ref={containerRef}>
      <div className="flex items-center gap-2 mb-2">
        <User className="h-4 w-4 text-orange-400" />
        <span className="text-sm font-medium text-orange-400">Actors / Performers</span>
        {assignedActors.length > 0 && (
          <Badge variant="outline" className="text-xs bg-orange-500/20 text-orange-300 border-orange-500/40">
            {assignedActors.length}
          </Badge>
        )}
      </div>
      {assignedActors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {assignedActors.map((actor) => (
            <button key={actor} onClick={() => onRemove(actor)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors hover:bg-destructive/20 bg-orange-500/20 text-orange-300 border-orange-500/40"
              title={`Click to remove ${actor}`}>
              {actor}
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <input ref={inputRef} type="text" value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && input.trim()) handleAdd(suggestions.length > 0 ? suggestions[0] : input);
            if (e.key === 'Escape') { setShowSuggestions(false); inputRef.current?.blur(); }
          }}
          placeholder="Type actor name..."
          className="w-full h-8 px-3 text-sm bg-background/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500/50" />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-30 max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button key={s} className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                onMouseDown={(e) => { e.preventDefault(); handleAdd(s); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
