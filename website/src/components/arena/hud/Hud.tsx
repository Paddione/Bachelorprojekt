import React from 'react';
import type { MatchState, GameEvent } from '../shared/lobbyTypes';
import { KillFeed } from './KillFeed';

const POWERUP_LABELS: Record<string, string> = {
  shield: 'SHIELD', speed: 'SPEED', damage: 'DMGx2', emp: 'EMP', cloak: 'CLOAK',
};

interface Props {
  state: MatchState;
  myKey: string;
  events: GameEvent[];
  ping: number;
  onForfeit: () => void;
  isMuted: boolean;
  onMuteToggle: () => void;
}

export function Hud({ state, myKey, events, ping, onForfeit, isMuted, onMuteToggle }: Props) {
  const me = state.players[myKey];
  if (!me) return null;

  const { cx, cy, radius } = state.zone;
  const dx = me.x - cx, dy = me.y - cy;
  const isOutsideZone = Math.sqrt(dx * dx + dy * dy) > radius;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Top-left: alive count + ping */}
      <div style={{ position: 'absolute', top: 12, left: 12, fontFamily: 'monospace', fontSize: 11, color: '#8A8497' }}>
        <span style={{ color: '#C8F76A', fontSize: 14, fontWeight: 600 }}>{state.aliveCount}</span>
        <span style={{ marginLeft: 4 }}>alive</span>
        <span style={{ marginLeft: 16, opacity: 0.5 }}>{ping}ms</span>
      </div>

      {/* Top-right: mute button */}
      <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'auto' }}>
        <button
          onClick={onMuteToggle}
          title={isMuted ? 'Unmute SFX' : 'Mute SFX'}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,.12)',
            color: isMuted ? '#8A8497' : '#C8F76A', borderRadius: 6,
            width: 28, height: 28, cursor: 'pointer', fontFamily: 'monospace',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Bottom-left: HP + ammo + powerups */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>HP</span>
          {[0, 1].map(i => (
            <div key={i} style={{ width: 18, height: 18, borderRadius: 3, border: '2px solid #D33A2C', background: i < me.hp ? '#D33A2C' : 'transparent' }} />
          ))}
          {me.armor > 0 && (
            <div style={{ width: 18, height: 14, borderRadius: 3, border: '2px solid #5BD4D0', background: 'rgba(91,212,208,.1)', fontSize: 9, color: '#5BD4D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
              A
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>{me.weapon.id}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 18, color: me.weapon.reloading ? '#8A8497' : '#ECEFF3' }}>
            {me.weapon.reloading ? 'RELOADING' : String(me.weapon.ammo)}
          </span>
        </div>

        {me.activePowerups.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {me.activePowerups.map((ap, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 9, padding: '2px 6px', border: '1px solid rgba(200,247,106,.4)', color: '#C8F76A', borderRadius: 4, background: 'rgba(200,247,106,.08)' }}>
                {POWERUP_LABELS[ap.kind] ?? ap.kind}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zone warning */}
      {isOutsideZone && (
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'monospace', fontSize: 13, color: '#ff3344', letterSpacing: '.14em', textTransform: 'uppercase', background: 'rgba(0,0,0,.6)', padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,51,68,.4)', pointerEvents: 'none' }}>
          Outside zone
        </div>
      )}

      {/* Kill feed */}
      <KillFeed events={events} />

      {/* Forfeit */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, pointerEvents: 'auto' }}>
        <button
          onClick={onForfeit}
          style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.12em', color: '#8A8497', background: 'transparent', border: '1px solid rgba(255,255,255,.12)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', textTransform: 'uppercase' }}
        >
          Forfeit
        </button>
      </div>
    </div>
  );
}
