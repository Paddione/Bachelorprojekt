import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { MatchState, ServerMsg, GameEvent, DiffOp } from '../shared/lobbyTypes';
import { applyDiff } from '../game/diff';
import { Renderer } from '../game/Renderer';
import { Hud } from '../hud/Hud';
import * as sfx from '../game/sfx';
import { MAP_H } from '../game/mapData';
import { start as startInputLoop } from '../game/input';
import { ControlsPanel } from '../game/ControlsPanel';

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
  const prevAmmoMap = useRef<Map<string, number>>(new Map());
  const zoneWarnThreshold = Math.min(960, MAP_H) * 0.6 * 0.3; // 97.2
  const [isMuted, setIsMuted] = useState(sfx.isMuted);
  const handleMuteToggle = useCallback(() => {
    sfx.toggleMute();
    setIsMuted(sfx.isMuted);
  }, []);
  const [showControls, setShowControls] = useState(false);
  const [showToast, setShowToast] = useState(true);

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
        // Seed ammo map so first diff doesn't false-fire tracers
        for (const [k, p] of Object.entries((m.state as MatchState).players)) {
          prevAmmoMap.current.set(k, p.weapon.ammo);
        }
      }
      if (m.t === 'match:diff') {
        applyDiff(stateRef.current, m.ops as DiffOp[]);
        lastTickAt.current = Date.now();
        // Shot detection: any player's ammo decreased → tracer + (own player) sound
        for (const op of m.ops as DiffOp[]) {
          if (typeof op.v === 'number' && op.p.startsWith('p.')) {
            const rest = op.p.slice(2);
            const lastDot = rest.lastIndexOf('.');
            if (lastDot >= 0 && rest.slice(lastDot + 1) === 'wammo') {
              const pKey = rest.slice(0, lastDot);
              const prevAmmo = prevAmmoMap.current.get(pKey) ?? null;
              if (prevAmmo !== null && op.v < prevAmmo) {
                const player = stateRef.current.players[pKey];
                if (player) {
                  rendererRef.current?.recordShot(player.x, player.y, player.facing, player.weapon.id);
                  if (pKey === myKey) sfx.playShot(player.weapon.id as 'glock' | 'deagle' | 'm4a1');
                }
              }
              prevAmmoMap.current.set(pKey, op.v);
            }
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stop = startInputLoop({
      socket,
      canvas,
      getServerTick: () => stateRef.current.tick,
      getPlayerFacing: () => {
        const player = stateRef.current.players[myKey];
        return (player as { facing?: number })?.facing ?? 0;
      },
    });
    return stop;
  }, [socket, myKey]);

  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 4000);
    return () => clearTimeout(t);
  }, [showToast]);

  const handleForfeit = useCallback(() => {
    socket.emit('msg', { t: 'forfeit' });
  }, [socket]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 960, margin: '0 auto', userSelect: 'none' }}>
      <style>{`@keyframes arenaToastIn{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
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
      <Hud
        state={hudState}
        myKey={myKey}
        events={events}
        ping={ping}
        onForfeit={handleForfeit}
        isMuted={isMuted}
        onMuteToggle={handleMuteToggle}
        onControls={() => setShowControls(true)}
      />
      {showToast && (
        <div
          onClick={() => setShowToast(false)}
          style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.82)', border: '1px solid #3d2a6e', borderRadius: 6,
            padding: '5px 14px', fontFamily: 'monospace', fontSize: 12, color: '#a89abb',
            zIndex: 20, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
            animation: 'arenaToastIn .25s ease',
          }}
        >
          <span style={{ color: '#c8f76a' }}>WASD</span> move ·{' '}
          <span style={{ color: '#c8f76a' }}>LMB</span> fire ·{' '}
          <span style={{ color: '#c8f76a' }}>E</span> melee ·{' '}
          <span style={{ color: '#c8f76a' }}>Space</span> dodge ·{' '}
          <span style={{ color: '#c8f76a' }}>⚙</span> controls
        </div>
      )}
      {showControls && <ControlsPanel onClose={() => setShowControls(false)} />}
    </div>
  );
}
