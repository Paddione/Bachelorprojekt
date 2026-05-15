import React, { useState } from 'react';
import type { PlayerSlot } from '../shared/lobbyTypes';

const CHARACTERS = ['blonde-guy', 'brown-guy', 'long-red-girl', 'blonde-long-girl'] as const;
type CharacterId = typeof CHARACTERS[number];

const CHAR_SPRITE: Record<CharacterId, string> = {
  'blonde-guy':       '/arena/warrior-stand-00.png',
  'brown-guy':        '/arena/tank-stand-00.png',
  'long-red-girl':    '/arena/rogue-stand-00.png',
  'blonde-long-girl': '/arena/mage-stand-00.png',
};

interface Props {
  code: string;
  players: PlayerSlot[];
  phase: 'open' | 'starting';
  countdownMs: number;
  myKey: string;
  isHost: boolean;
  onCharacter: (characterId: CharacterId) => void;
  onLeave: () => void;
  onStart: () => void;
}

export function LobbyScene({ code, players, phase, countdownMs, myKey, isHost, onCharacter, onLeave, onStart }: Props) {
  const [charIdx, setCharIdx] = useState(0);

  function cycleChar(delta: 1 | -1) {
    const next = (charIdx + delta + CHARACTERS.length) % CHARACTERS.length;
    setCharIdx(next);
    onCharacter(CHARACTERS[next]);
  }

  const countdownSec = Math.ceil(countdownMs / 1000);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, letterSpacing: '.18em', color: '#C8F76A', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 22, height: 1, background: 'currentColor', display: 'inline-block' }} />
          Arena &middot; Lobby {code}
        </div>
        {phase === 'starting' ? (
          <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 36, margin: '12px 0 0', color: '#C8F76A' }}>
            Starting in {countdownSec}s&hellip;
          </h2>
        ) : (
          <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 36, margin: '12px 0 0' }}>
            Waiting for players &mdash; <em style={{ color: '#C8F76A' }}>{players.filter(p => !p.isBot).length} / 4</em>
          </h2>
        )}
      </div>

      {/* Character picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '16px 20px', border: '1px solid rgba(255,255,255,.08)' }}>
        <button onClick={() => cycleChar(-1)} style={arrowBtn} aria-label="Previous character">&lsaquo;</button>
        <img
          src={CHAR_SPRITE[CHARACTERS[charIdx]]}
          alt={CHARACTERS[charIdx]}
          width={64}
          height={64}
          style={{ imageRendering: 'pixelated' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>Character</div>
          <div style={{ fontFamily: 'inherit', fontSize: 15, marginTop: 4 }}>{CHARACTERS[charIdx].replace(/-/g, ' ')}</div>
        </div>
        <button onClick={() => cycleChar(1)} style={arrowBtn} aria-label="Next character">&rsaquo;</button>
      </div>

      {/* Player roster */}
      <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, overflow: 'hidden' }}>
        {players.map((p, i) => (
          <div key={p.key} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center',
            padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.06)',
            background: p.key === myKey ? 'rgba(200,247,106,.04)' : 'transparent',
          }}>
            <img
              src={CHAR_SPRITE[p.characterId as CharacterId] ?? '/arena/zombie-stand-00.png'}
              alt=""
              width={36}
              height={36}
              style={{ imageRendering: 'pixelated', borderRadius: 4 }}
            />
            <div>
              <div style={{ fontSize: 14 }}>
                {p.displayName}
                {p.key === myKey && <span style={{ color: '#C8F76A', fontFamily: 'monospace', fontSize: 10, letterSpacing: '.14em', marginLeft: 8 }}>YOU</span>}
              </div>
              <div style={{ fontSize: 11, color: '#8A8497', textTransform: 'uppercase', letterSpacing: '.1em' }}>{p.isBot ? 'Bot' : p.brand ?? ''}</div>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: p.isBot ? '#3A2E52' : '#C8F76A' }} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
          <div key={`empty-${i}`} style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.06)', color: '#3A2E52', fontSize: 13 }}>
            &mdash; waiting&hellip;
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onLeave}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: '#8A8497', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Leave lobby
        </button>

        {isHost && phase === 'open' && (
          <button
            onClick={onStart}
            style={{ background: '#C8F76A', border: 'none', color: '#1a0e22', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
          >
            Start Match (with Bots)
          </button>
        )}
      </div>
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: '#C8F76A',
  width: 36, height: 36, borderRadius: 6, cursor: 'pointer', fontSize: 20, lineHeight: 1,
};
