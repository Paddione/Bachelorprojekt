// faster-whisper transcription helper.
// Sends audio files to the whisper service and returns transcripts.
// Uses the OpenAI-compatible API (fedirz/faster-whisper-server).

const WHISPER_URL = import.meta.env.WHISPER_URL || 'http://whisper.workspace.svc.cluster.local:8000';

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

// Transcribe an audio file (Buffer or Blob).
// Returns the full transcript text and optional word-level segments.
export async function transcribeAudio(
  audioData: Buffer | Blob,
  filename: string = 'audio.wav',
  language: string = 'de',
): Promise<TranscriptionResult | null> {
  try {
    const formData = new FormData();

    if (audioData instanceof Buffer) {
      formData.append('file', new Blob([audioData]), filename);
    } else {
      formData.append('file', audioData, filename);
    }

    formData.append('model', 'Systran/faster-whisper-medium');
    formData.append('language', language);
    formData.append('response_format', 'verbose_json');

    const res = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      console.error('[whisper] Transcription failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json();

    return {
      text: data.text || '',
      language: data.language || language,
      duration: data.duration || 0,
      segments: data.segments?.map((s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
    };
  } catch (err) {
    console.error('[whisper] Transcription error:', err);
    return null;
  }
}

// Format transcript segments into readable text with timestamps
export function formatTranscript(result: TranscriptionResult): string {
  if (!result.segments || result.segments.length === 0) {
    return result.text;
  }

  return result.segments
    .map((s) => {
      const startMin = Math.floor(s.start / 60);
      const startSec = Math.floor(s.start % 60).toString().padStart(2, '0');
      return `[${startMin}:${startSec}] ${s.text.trim()}`;
    })
    .join('\n');
}
