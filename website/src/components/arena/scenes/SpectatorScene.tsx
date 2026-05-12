import React, { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { MatchState, ServerMsg, GameEvent, DiffOp } from '../shared/lobbyTypes';
import { applyDiff } from '../game/diff';
import { Renderer } from '../game/Renderer';
import * as sfx from '../game/sfx';

interface Props {
  socket: Socket;
  initialState: MatchState;
}

export function SpectatorScene({ socket, initialState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const stateRef = useRef<MatchState>(structuredClone(initialState));
  const [hudState, setHudState] = useState<MatchState>(initialState);
  const [followTarget, setFollowTarget] = useState<string>(() => {
    const firstAlive = Object.entries(initialState.players).find(([, p]) => p.alive);
    return firstAlive?.[0] ?? Object.keys(initialState.players)[0] ?? '';
  });
  const [isSlowMo, setIsSlowMo] = useState(false);
  const [isMuted, setIsMuted] = useState(sfx.isMuted);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    // Spectator has no own player — pass empty string so no ring is drawn
    renderer.startTicker(() => stateRef.current, '');
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, []);

  useEffect(() => {
    rendererRef.current?.setFollowTarget(followTarget);
  }, [followTarget]);

  useEffect(() => {
    rendererRef.current?.setTickerSpeed(isSlowMo ? 0.2 : 1.0);
  }, [isSlowMo]);

  useEffect(() => {
    function onMsg(m: ServerMsg) {
      if (m.t === 'match:full-snapshot') {
        stateRef.current = m.state as MatchState;
        setHudState(m.state as MatchState);
      }
      if (m.t === 'match:diff') {
        applyDiff(stateRef.current, m.ops as DiffOp[]);
        if (stateRef.current.tick % 5 === 0) setHudState({ ...stateRef.current });
      }
      if (m.t === 'match:event') {
        for (const ev of m.events as GameEvent[]) {
          if (ev.e === 'slow-mo') {
            setIsSlowMo(true);
            rendererRef.current?.setTickerSpeed(0.2);
          }
        }
      }
    }
    socket.on('msg', onMsg);
    return () => { socket.off('msg', onMsg); };
  }, [socket]);

  const alivePlayers = Object.entries(hudState.players).filter(([, p]) => p.alive);
  const followed = hudState.players[followTarget];

  const handleMuteToggle = () => {
    sfx.toggleMute();
    setIsMuted(sfx.isMuted);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', userSelect: 'none' }}>
      {/* Player picker */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase', marginRight: 4 }}>
          Spectating
        </span>
        {alivePlayers.map(([key, player]) => (
          <button
            key={key}
            onClick={() => setFollowTarget(key)}
            style={{
              fontFamily: 'monospace', fontSize: 11, padding: '4px 12px',
              background: key === followTarget ? '#C8F76A' : 'transparent',
              color: key === followTarget ? '#1a0e22' : '#8A8497',
              border: '1px solid ' + (key === followTarget ? '#C8F76A' : 'rgba(255,255,255,.15)'),
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            {player.displayName.split('@')[0]}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', width: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', aspectRatio: '960/540', background: '#120d1c' }}
        />
        {/* Slow-mo vignette */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
          backdropFilter: 'saturate(0.3)',
          opacity: isSlowMo ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Read-only HUD for followed player */}
      {followed && (
        <div style={{ display: 'flex', gap: 24, padding: '10px 0', alignItems: 'center', fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>HP</span>
            {[0, 1].map(i => (
              <div key={i} style={{ width: 16, height: 16, borderRadius: 3, border: '2px solid #D33A2C', background: i < followed.hp ? '#D33A2C' : 'transparent' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>{followed.weapon.id}</span>
            <span style={{ fontSize: 16, color: followed.weapon.reloading ? '#8A8497' : '#ECEFF3' }}>
              {followed.weapon.reloading ? 'RLD' : String(followed.weapon.ammo)}
            </span>
          </div>
          {followed.activePowerups.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {followed.activePowerups.map((ap, i) => (
                <div key={i} style={{ fontSize: 9, padding: '2px 6px', border: '1px solid rgba(200,247,106,.4)', color: '#C8F76A', borderRadius: 4, background: 'rgba(200,247,106,.08)' }}>
                  {ap.kind.toUpperCase()}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handleMuteToggle}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.12)', color: isMuted ? '#8A8497' : '#C8F76A', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <a href="/portal" style={{ fontSize: 11, letterSpacing: '.12em', color: '#8A8497', textDecoration: 'none', textTransform: 'uppercase' }}>
              Back to portal
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
