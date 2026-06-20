import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';

type State = 'idle' | 'recording' | 'review';

function Waveform({ active, bars = 28 }: { active: boolean; bars?: number }) {
  const hs = useRef(Array.from({ length: bars }, (_, i) => 5 + Math.abs(Math.sin(i * 1.3)) * 16)).current;
  return (
    <div className="waveform" aria-hidden="true">
      {hs.map((h, i) => (
        <i key={i} style={{ height: `${active ? h : Math.max(4, h * 0.4)}px`, opacity: active ? 1 : 0.5 }} />
      ))}
    </div>
  );
}

export function MicDock({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = useState<State>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);

  useEffect(() => () => {
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    if (lastBlobRef.current) URL.revokeObjectURL(URL.createObjectURL(lastBlobRef.current));
  }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        lastBlobRef.current = blob;
        stream.getTracks().forEach((t) => t.stop());
        try {
          const { text } = await api.transcribe(blob);
          setTranscript(text);
          setState('review');
        } catch (e: any) {
          setError(`Transkription fehlgeschlagen: ${e.message}`);
          setState('idle');
        }
      };
      recorderRef.current = rec;
      rec.start();
      setState('recording');
    } catch (e: any) {
      setError(`Mikrofon-Zugriff verweigert: ${e.message}`);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const click = () => {
    if (state === 'idle') startRecording();
    else if (state === 'recording') stopRecording();
    else setState('idle');
  };

  const playBack = () => {
    if (!lastBlobRef.current) return;
    if (!playbackRef.current) playbackRef.current = new Audio();
    playbackRef.current.src = URL.createObjectURL(lastBlobRef.current);
    playbackRef.current.play().catch(() => {});
  };

  const accept = () => {
    onTranscript(transcript);
    setTranscript('');
    setState('idle');
  };

  return (
    <>
      <button
        className={'mic-btn' + (state === 'recording' ? ' rec' : '')}
        onClick={click}
        aria-pressed={state !== 'idle'}
        aria-label={state === 'idle' ? 'Aufnahme starten' : state === 'recording' ? 'Aufnahme beenden' : 'Aufnahme verwerfen'}
        title="Coach-Mikrofon"
        type="button"
      >
        {state === 'recording' ? <Icons.pause /> : <Icons.mic />}
      </button>
      {state === 'recording' && (
        <div className="row" style={{ gap: 8 }}>
          <Waveform active />
          <span className="hint">Aufnahme …</span>
        </div>
      )}
      {state !== 'recording' && (
        <span className="hint">{state === 'review' ? 'Transkription prüfen' : error ? `⚠ ${error}` : 'Bereit'}</span>
      )}
      {state === 'review' && (
        <div className="transcript" style={{ marginTop: 12, gridColumn: '1 / -1' }}>
          <div className="tr-head">
            <span className="lab">Transkription · Review</span>
            <Waveform active={false} />
            <div className="tr-acts">
              <button className="btn btn-ghost btn-sm" onClick={playBack} type="button"><Icons.play />Abspielen</button>
              <button className="btn btn-ghost btn-sm" onClick={startRecording} type="button"><Icons.replace />Ersetzen</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setTranscript(''); setState('idle'); }} type="button"><Icons.trash />Löschen</button>
            </div>
          </div>
          <textarea className="textarea" value={transcript} onChange={(e) => setTranscript(e.target.value)} aria-label="Transkription bearbeiten" />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={accept} type="button">In Eingabe übernehmen <Icons.arrow /></button>
          </div>
        </div>
      )}
    </>
  );
}
