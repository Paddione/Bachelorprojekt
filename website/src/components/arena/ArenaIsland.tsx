import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ServerMsg, PlayerSlot, MatchState, MatchResult } from './shared/lobbyTypes';
import { PROTOCOL_VERSION } from './shared/lobbyTypes';
import { LobbyScene } from './scenes/LobbyScene';
import { MatchScene } from './scenes/MatchScene';
import { ResultsScene } from './scenes/ResultsScene';
import { SpectatorScene } from './scenes/SpectatorScene';
import { playSlowMo } from './game/sfx';

type Scene = 'loading' | 'lobby' | 'match' | 'spectator' | 'results' | 'error';

interface Props {
  wsUrl: string;
  lobbyCode: string;
  myKey: string;
}

export function ArenaIsland({ wsUrl, lobbyCode, myKey }: Props) {
  const [scene, setScene] = useState<Scene>('loading');
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerSlot[]>([]);
  const [lobbyPhase, setLobbyPhase] = useState<'open' | 'starting'>('open');
  const [countdownMs, setCountdownMs] = useState(0);
  const [initialMatchState, setInitialMatchState] = useState<MatchState | null>(null);
  const [results, setResults] = useState<{ results: MatchResult[]; matchId: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sceneRef = useRef<Scene>('loading');
  const isSpectatorRef = useRef(false);

  sceneRef.current = scene;

  const connect = useCallback(async () => {
    setScene('loading');
    let token: string;
    try {
      const res = await fetch('/api/arena/token', { method: 'POST' });
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      const json = await res.json() as { token: string };
      token = json.token;
    } catch (e: any) {
      setError(String(e.message ?? 'Token fetch failed'));
      setScene('error');
      return;
    }

    const socket = io(wsUrl, {
      path: '/ws',
      transports: ['websocket'],
      auth: { token, protocolVersion: PROTOCOL_VERSION },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('msg', { t: 'lobby:join', code: lobbyCode });
      setScene('lobby');
    });

    socket.on('connect_error', (err: Error) => {
      setError(String(err.message ?? 'Connection failed'));
      setScene('error');
    });

    socket.on('msg', (m: ServerMsg) => {
      switch (m.t) {
        case 'lobby:state': {
          setPlayers(m.players as PlayerSlot[]);
          if (m.phase === 'in-match') {
            const playerKeys = new Set((m.players as PlayerSlot[]).map(p => p.key));
            if (!playerKeys.has(myKey)) {
              isSpectatorRef.current = true;
              socketRef.current?.emit('msg', { t: 'spectator:join', code: m.code });
            }
          } else if (m.phase === 'slow-mo') {
            playSlowMo();
          } else if (m.phase === 'starting') {
            setLobbyPhase('starting');
            setCountdownMs(m.countdownMs ?? 5000);
          } else {
            setLobbyPhase('open');
          }
          break;
        }
        case 'match:full-snapshot':
          setInitialMatchState(m.state as MatchState);
          setScene(isSpectatorRef.current ? 'spectator' : 'match');
          break;
        case 'match:end':
          setResults({ results: m.results as MatchResult[], matchId: m.matchId });
          setScene('results');
          break;
        case 'error':
          setError(m.message);
          setScene('error');
          break;
      }
    });

    socket.on('disconnect', () => {
      if (sceneRef.current !== 'results') {
        setError('Disconnected from arena server');
        setScene('error');
      }
    });
  }, [wsUrl, lobbyCode]);

  useEffect(() => {
    connect();
    return () => { socketRef.current?.disconnect(); };
  }, [connect]);

  const handleCharacter = useCallback((characterId: string) => {
    socketRef.current?.emit('msg', { t: 'lobby:character', characterId });
  }, []);

  const handleLeave = useCallback(() => {
    socketRef.current?.emit('msg', { t: 'lobby:leave' });
    window.location.href = '/portal';
  }, []);

  const handleRematch = useCallback(() => {
    socketRef.current?.emit('msg', { t: 'rematch:vote', yes: true });
  }, []);

  const handleBack = useCallback(() => {
    window.location.href = '/portal';
  }, []);

  if (scene === 'loading') {
    return (
      <div style={{ padding: 32, fontFamily: 'monospace', color: '#8A8497' }}>
        <div style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase' }}>Connecting to arena&hellip;</div>
      </div>
    );
  }

  if (scene === 'error') {
    return (
      <div style={{ padding: 32, fontFamily: 'monospace' }}>
        <div style={{ color: '#D33A2C', fontSize: 13 }}>{error ?? 'Unknown error'}</div>
        <button onClick={connect} style={{ marginTop: 16, padding: '8px 16px', background: '#C8F76A', color: '#1a0e22', border: 'none', cursor: 'pointer', fontWeight: 600, borderRadius: 6 }}>
          Retry
        </button>
      </div>
    );
  }

  if (scene === 'lobby') {
    return (
      <LobbyScene
        code={lobbyCode}
        players={players}
        phase={lobbyPhase}
        countdownMs={countdownMs}
        myKey={myKey}
        onCharacter={handleCharacter}
        onLeave={handleLeave}
      />
    );
  }

  if (scene === 'match' && initialMatchState && socketRef.current) {
    return (
      <MatchScene
        socket={socketRef.current}
        initialState={initialMatchState}
        myKey={myKey}
      />
    );
  }

  if (scene === 'spectator' && initialMatchState && socketRef.current) {
    return (
      <SpectatorScene
        socket={socketRef.current}
        initialState={initialMatchState}
      />
    );
  }

  if (scene === 'results' && results) {
    return (
      <ResultsScene
        results={results.results}
        matchId={results.matchId}
        onRematch={handleRematch}
        onBack={handleBack}
      />
    );
  }

  return null;
}
