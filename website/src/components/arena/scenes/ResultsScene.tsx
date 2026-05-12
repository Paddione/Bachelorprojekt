import React from 'react';
import type { MatchResult } from '../shared/lobbyTypes';

interface Props {
  results: MatchResult[];
  matchId: string;
  onRematch: () => void;
  onBack: () => void;
}

export function ResultsScene({ results, matchId, onRematch, onBack }: Props) {
  const sorted = [...results].sort((a, b) => a.place - b.place);
  const winner = sorted[0];

  return (
    <div style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.18em', color: '#C8F76A', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 22, height: 1, background: 'currentColor', display: 'inline-block' }} />
        Match over &middot; {matchId.slice(-8)}
      </div>

      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 40, margin: '0 0 24px' }}>
        <em style={{ color: '#C8F76A' }}>{winner?.displayName.split('@')[0] ?? '?'}</em> wins.
      </h2>

      <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 56px 56px 80px', gap: 12, padding: '10px 16px', fontFamily: 'monospace', fontSize: 10, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <span>#</span><span>Player</span><span>K</span><span>D</span><span>Status</span>
        </div>
        {sorted.map((r, i) => (
          <div key={r.playerKey} style={{
            display: 'grid', gridTemplateColumns: '36px 1fr 56px 56px 80px', gap: 12,
            padding: '12px 16px', alignItems: 'center',
            borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.04)',
            background: i === 0 ? 'rgba(200,247,106,.04)' : 'transparent',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 16, color: i === 0 ? '#C8F76A' : '#8A8497' }}>{r.place}</span>
            <div>
              <span style={{ fontSize: 14 }}>{r.displayName.split('@')[0]}</span>
              {r.isBot && <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#5BD4D0', marginLeft: 8 }}>BOT</span>}
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{r.kills}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#8A8497' }}>{r.deaths}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: r.forfeit ? '#D33A2C' : '#8A8497', letterSpacing: '.12em', textTransform: 'uppercase' }}>
              {r.forfeit ? 'Forfeit' : String.fromCharCode(8212)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onRematch} style={{ padding: '10px 22px', background: '#C8F76A', color: '#1a0e22', border: 'none', fontWeight: 600, cursor: 'pointer', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}>
          Rematch vote
        </button>
        <button onClick={onBack} style={{ padding: '10px 22px', background: 'transparent', color: '#8A8497', border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}>
          Back to portal
        </button>
      </div>
    </div>
  );
}
