import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { MatchState, ServerMsg, GameEvent, DiffOp } from '../shared/lobbyTypes';
import { applyDiff } from '../game/diff';
import { Renderer } from '../game/Renderer';
import { Hud } from '../hud/Hud';

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
      }
      if (m.t === 'match:diff') {
        applyDiff(stateRef.current, m.ops as DiffOp[]);
        lastTickAt.current = Date.now();
        if (stateRef.current.tick % 5 === 0) setHudState({ ...stateRef.current });
      }
      if (m.t === 'match:event') {
        setEvents(prev => [...prev, ...(m.events as GameEvent[])]);
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
      <Hud state={hudState} myKey={myKey} events={events} ping={ping} onForfeit={handleForfeit} />
    </div>
  );
}
