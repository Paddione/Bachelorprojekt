import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, X, Plus, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { colorFor } from './categorize-queries';

export function CompletionRing({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? filled / total : 0;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative flex items-center gap-1.5" title={`${filled}/${total} category types assigned`}>
      <svg width="34" height="34" className="-rotate-90">
        <circle cx="17" cy="17" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
        <circle cx="17" cy="17" r={radius} fill="none" stroke={pct >= 1 ? '#22c55e' : '#3b82f6'}
          strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-muted-foreground">{filled}</span>
    </div>
  );
}

function AssignedChips({ type, assigned, unassigned, onAdd, onRemove }: {
  type: string; assigned: string[]; unassigned: string[];
  onAdd: (v: string) => void; onRemove: (v: string) => void;
}) {
  const colors = colorFor(type);
  return (
    <div className="flex flex-wrap gap-1.5">
      {assigned.map((value) => (
        <DropdownMenu key={value}>
          <DropdownMenuTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors hover:opacity-80 ${colors.badge}`}>{value}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => onRemove(value)} className="text-destructive">
              <X className="mr-2 h-3.5 w-3.5" />Remove "{value}"
            </DropdownMenuItem>
            {unassigned.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Replace with:</div>
                {unassigned.slice(0, 10).map((alt) => (
                  <DropdownMenuItem key={alt} onClick={() => { onRemove(value); onAdd(alt); }}>{alt}</DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  );
}

export function CategoryGroup({ type, index, assignedValues, availableValues, onAdd, onRemove, isExpanded, onToggle }: {
  type: string; index: number; assignedValues: string[]; availableValues: string[];
  onAdd: (value: string) => void; onRemove: (value: string) => void;
  isExpanded: boolean; onToggle: () => void;
}) {
  const [customInput, setCustomInput] = useState('');
  const colors = colorFor(type);
  const unassigned = availableValues.filter((v) => v !== 'unassigned' && !assignedValues.includes(v));
  const addCustom = () => {
    const val = customInput.trim().toLowerCase();
    if (val && !assignedValues.includes(val)) { onAdd(val); setCustomInput(''); }
  };
  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} mb-2 transition-colors ${assignedValues.length ? '' : 'opacity-70'}`}>
      <button className={`w-full flex items-center justify-between px-3 py-2 ${colors.text} font-medium text-sm capitalize`} onClick={onToggle}>
        <span className="flex items-center gap-2">
          {assignedValues.length > 0
            ? <Check className="h-3.5 w-3.5 text-green-400" />
            : <span className="h-3.5 w-3.5 rounded-full border border-current opacity-40 inline-block" />}
          <span>{type}</span>
          <kbd className="text-[10px] opacity-40 font-mono ml-1">{index + 1}</kbd>
        </span>
        <span className="flex items-center gap-2">
          {assignedValues.length > 0 && <Badge variant="outline" className={`text-xs ${colors.badge}`}>{assignedValues.length}</Badge>}
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {assignedValues.length > 0 && (
            <AssignedChips type={type} assigned={assignedValues} unassigned={unassigned} onAdd={onAdd} onRemove={onRemove} />
          )}
          {unassigned.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={`h-7 text-xs gap-1 ${colors.text}`}>
                  <Plus className="h-3 w-3" />Add {type}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-48">
                {unassigned.map((val) => (
                  <DropdownMenuItem key={val} onClick={() => onAdd(val)}>{val}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="flex gap-1">
            <input type="text" value={customInput} onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') addCustom(); }}
              placeholder={`New ${type}...`}
              className="flex-1 h-7 px-2 text-xs bg-background/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
            {customInput.trim() && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addCustom}><Plus className="h-3 w-3" /></Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
