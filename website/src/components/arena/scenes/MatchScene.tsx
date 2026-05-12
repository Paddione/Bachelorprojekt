import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { MatchState, ServerMsg, GameEvent, DiffOp } from '../shared/lobbyTypes';
import { applyDiff } from '../game/diff';
import { Renderer } from '../game/Renderer';
import { Hud } from '../hud/Hud';
import * as sfx from '../game/sfx';
import { MAP_H } from '../game/mapData';

interface Props {
  socket: Socket;
  initialState: MatchState;
  myKey: string;
}

export function MatchScene({ socket, initialState, myKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const stateRef = useRef<MatchState>(structuredClone(initialState));
  const [hudState, setHudState] = useState<MatchState>(initialState);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ping, setPing] = useState(0);
  const lastTickAt = useRef(Date.now());
  const [isSlowMo, setIsSlowMo] = useState(false);
  const prevAmmoRef = useRef<number | null>(null);
  const zoneWarnThreshold = Math.min(960, MAP_H) * 0.6 * 0.3; // 97.2
  const [isMuted, setIsMuted] = useState(sfx.isMuted);
  const handleMuteToggle = useCallback(() => {
    sfx.toggleMute();
    setIsMuted(sfx.isMuted);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    renderer.startTicker(() => stateRef.current, myKey);
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, [myKey]);

  useEffect(() => {
    const id = setInterval(() => {
      setPing(Math.max(0, Date.now() - lastTickAt.current - 33));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onMsg(m: ServerMsg) {
      if (m.t === 'match:full-snapshot') {
        stateRef.current = m.state as MatchState;
        setHudState(m.state as MatchState);
        lastTickAt.current = Date.now();
        prevAmmoRef.current = (m.state as MatchState).players[myKey]?.weapon.ammo ?? null;
      }
      if (m.t === 'match:diff') {
        applyDiff(stateRef.current, m.ops as DiffOp[]);
        lastTickAt.current = Date.now();
        // Shot detection: own player's ammo decreased
        for (const op of m.ops as DiffOp[]) {
          if (op.p === `p.${myKey}.wammo` && typeof op.v === 'number') {
            if (prevAmmoRef.current !== null && op.v < prevAmmoRef.current) {
              const weaponId = stateRef.current.players[myKey]?.weapon.id;
              if (weaponId) sfx.playShot(weaponId as 'glock' | 'deagle' | 'm4a1');
            }
            prevAmmoRef.current = op.v;
          }
        }
        // Zone warning: shrinking and below 30% of initial radius
        const zone = stateRef.current.zone;
        if (zone.shrinking && zone.radius < zoneWarnThreshold) sfx.playZoneWarning();
        if (!zone.shrinking) sfx.resetZoneWarnFlag();
        if (stateRef.current.tick % 5 === 0) setHudState({ ...stateRef.current });
      }
      if (m.t === 'match:event') {
        const evs = m.events as GameEvent[];
        setEvents(prev => [...prev, ...evs]);
        for (const ev of evs) {
          if (ev.e === 'slow-mo') {
            setIsSlowMo(true);
            rendererRef.current?.setTickerSpeed(0.2);
            sfx.playSlowMo();
          }
          if (ev.e === 'kill' || ev.e === 'kill-zone') sfx.playDeath();
        }
      }
    }
    socket.on('msg', onMsg);
    return () => { socket.off('msg', onMsg); };
  }, [socket]);

  const handleForfeit = useCallback(() => {
    socket.emit('msg', { t: 'forfeit' });
  }, [socket]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 960, margin: '0 auto', userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', aspectRatio: '960/540', background: '#120d1c' }}
      />
      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
          backdropFilter: 'saturate(0.3)',
          opacity: isSlowMo ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: 'none',
        }}
      />
      <Hud state={hudState} myKey={myKey} events={events} ping={ping} onForfeit={handleForfeit} isMuted={isMuted} onMuteToggle={handleMuteToggle} />
    </div>
  );
}
