import React from 'react';
import { Icons } from './Icons';
import type { StandardLevel } from '../lib/types';

interface Props {
  standards: StandardLevel[];
  active: number;
  done: boolean[];
  highlights: number[];
  onSelect: (i: number) => void;
  railRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function WorkspaceRail({ standards, active, done, highlights, onSelect, railRef, onKeyDown }: Props) {
  return (
    <>
      <nav
        className="ws-rail"
        aria-label="Gesprächsverlauf · 10 Ebenen"
        ref={railRef}
        onKeyDown={onKeyDown}
        tabIndex={-1}
      >
        <div className="rail-head"><div className="t">Gesprächsverlauf</div></div>
        {standards.map((l, i) => (
          <button
            key={l.level_no}
            className={'lvl' + (i === active ? ' is-active' : '') + (done[i] ? ' done' : '') + (highlights.includes(l.level_no) ? ' highlight' : '')}
            aria-current={i === active ? 'step' : undefined}
            tabIndex={i === active ? 0 : -1}
            onClick={() => onSelect(i)}
          >
            <span className="lvl-no">{done[i] ? <Icons.check size={13} /> : l.no}</span>
            <span className="lvl-name">{l.name}</span>
          </button>
        ))}
      </nav>
      <div className="ws-railbar" aria-hidden="true">
        {standards.map((l, i) => (
          <button key={l.level_no} className={'chip' + (i === active ? ' is-active' : '')} onClick={() => onSelect(i)}>
            <span className="mono">{l.no}</span> {l.name}
          </button>
        ))}
      </div>
    </>
  );
}
