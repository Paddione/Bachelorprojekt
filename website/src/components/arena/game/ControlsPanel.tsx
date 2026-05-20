// website/src/components/arena/game/ControlsPanel.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  type ArenaBindings, DEFAULT_BINDINGS,
  loadBindings, saveBinding,
} from './input';

type Tab = 'move' | 'combat' | 'utility';

interface ActionRow {
  action: keyof ArenaBindings | null;
  label: string;
  fixed?: string;
}

const TABS: { id: Tab; label: string; rows: ActionRow[] }[] = [
  {
    id: 'move', label: 'Bewegung',
    rows: [
      { action: 'up',    label: 'Vorwärts' },
      { action: 'down',  label: 'Rückwärts' },
      { action: 'left',  label: 'Links' },
      { action: 'right', label: 'Rechts' },
      { action: 'dodge', label: 'Ausweichen' },
    ],
  },
  {
    id: 'combat', label: 'Kampf',
    rows: [
      { action: null,    label: 'Schießen',  fixed: 'LMB' },
      { action: 'melee', label: 'Nahkampf' },
      { action: 'pickup', label: 'Aufheben' },
    ],
  },
  {
    id: 'utility', label: 'Sonstiges',
    rows: [
      { action: null, label: 'Nachladen', fixed: 'automatisch' },
    ],
  },
];

function codeLabel(code: string): string {
  const map: Record<string, string> = {
    Space: 'Leertaste', ShiftLeft: 'Shift L', ShiftRight: 'Shift R',
    Mouse0: 'LMB', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

interface Props {
  onClose: () => void;
}

export function ControlsPanel({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('move');
  const [bindings, setBindings] = useState<ArenaBindings>(loadBindings);
  const [rebinding, setRebinding] = useState<keyof ArenaBindings | null>(null);

  const handleChipClick = useCallback((action: keyof ArenaBindings) => {
    setRebinding(action);
  }, []);

  const handleReset = useCallback(() => {
    Object.keys(DEFAULT_BINDINGS).forEach(k => {
      saveBinding(k as keyof ArenaBindings, DEFAULT_BINDINGS[k as keyof ArenaBindings]);
    });
    setBindings(loadBindings());
    setRebinding(null);
    window.dispatchEvent(new CustomEvent('arena:keybindings-changed'));
  }, []);

  useEffect(() => {
    if (!rebinding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === 'Escape') { setRebinding(null); return; }
      const conflicting = (Object.keys(bindings) as (keyof ArenaBindings)[])
        .find(k => k !== rebinding && bindings[k] === e.code);
      if (conflicting) saveBinding(conflicting, bindings[rebinding]);
      saveBinding(rebinding, e.code);
      const updated = loadBindings();
      setBindings(updated);
      setRebinding(null);
      window.dispatchEvent(new CustomEvent('arena:keybindings-changed'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rebinding, bindings]);

  const tab = TABS.find(t => t.id === activeTab)!;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 30, fontFamily: 'monospace',
      }}
    >
      <div style={{
        background: '#120d1c', border: '1px solid #3d2a6e', borderRadius: 10,
        minWidth: 320, maxWidth: 400, width: '90%', padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ color: '#c8f76a', letterSpacing: '.12em', fontSize: 13 }}>STEUERUNG</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#6a5a8a', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: t.id === activeTab ? '#2a1e4e' : '#1a1030',
                border: `1px solid ${t.id === activeTab ? '#c8f76a' : '#2e1f55'}`,
                color: t.id === activeTab ? '#c8f76a' : '#6a5a8a',
                borderRadius: 4, padding: '4px 12px',
                font: '11px monospace', cursor: 'pointer', letterSpacing: '.08em',
              }}
            >{t.label}</button>
          ))}
        </div>

        <div style={{ minHeight: 140 }}>
          {tab.rows.map(row => (
            <div
              key={row.label}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid #1e1640',
              }}
            >
              <span style={{ color: '#c0b8d0', fontSize: 12 }}>{row.label}</span>
              {row.fixed ? (
                <span style={{
                  background: '#1e1640', border: '1px solid #2e1f55', borderRadius: 3,
                  color: '#6a5a8a', padding: '2px 10px', fontSize: 11,
                }}>{row.fixed}</span>
              ) : (
                <button
                  onClick={() => row.action && handleChipClick(row.action)}
                  style={{
                    background: rebinding === row.action ? '#4a0a0a' : '#1e1640',
                    border: `1px solid ${rebinding === row.action ? '#ff4444' : '#3d2a6e'}`,
                    borderRadius: 3,
                    color: rebinding === row.action ? '#fff' : '#c8f76a',
                    padding: '2px 10px', font: '11px monospace', cursor: 'pointer', minWidth: 52,
                  }}
                >
                  {rebinding === row.action ? 'Taste drücken…' : codeLabel(bindings[row.action!])}
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handleReset}
            style={{ background: 'none', border: 'none', color: '#4a3870', font: '11px monospace', cursor: 'pointer' }}
          >Zurücksetzen</button>
          <span style={{ fontSize: 10, color: '#3a2a5e' }}>
            {rebinding ? 'ESC zum Abbrechen' : 'Klicke eine Taste zum Ändern'}
          </span>
        </div>
      </div>
    </div>
  );
}
