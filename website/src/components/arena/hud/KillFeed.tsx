import React, { useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../shared/lobbyTypes';

interface KillEntry { id: number; text: string; at: number; }

export function KillFeed({ events }: { events: GameEvent[] }) {
  const [entries, setEntries] = useState<KillEntry[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const newEntries = events.flatMap<KillEntry>(e => {
      if (e.e === 'kill') return [{ id: counterRef.current++, text: `${e.killer.split('@')[0]} x ${e.victim.split('@')[0]} [${e.weapon}]`, at: Date.now() }];
      if (e.e === 'kill-zone') return [{ id: counterRef.current++, text: `${e.victim.split('@')[0]} x [zone]`, at: Date.now() }];
      return [];
    });
    if (newEntries.length === 0) return;
    setEntries(prev => [...prev, ...newEntries].slice(-5));
  }, [events]);

  useEffect(() => {
    const id = setInterval(() => {
      setEntries(prev => prev.filter(e => Date.now() - e.at < 4_000));
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', pointerEvents: 'none' }}>
      {entries.map(e => (
        <div key={e.id} style={{ fontFamily: 'monospace', fontSize: 11, color: '#eceff3', background: 'rgba(18,13,28,.75)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,.06)' }}>
          {e.text}
        </div>
      ))}
    </div>
  );
}
