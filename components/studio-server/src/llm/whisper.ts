export async function transcribe(whisperUrl: string, audioBuffer: Buffer, mimeType: string): Promise<string> {
  const form = new FormData();
  const ab = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
  form.append('file', new Blob([ab], { type: mimeType }), 'recording.webm');
  form.append('model', 'Systran/faster-whisper-small');
  form.append('language', 'de');
  form.append('response_format', 'json');
  const r = await fetch(`${whisperUrl.replace(/\/$/, '')}/v1/audio/transcriptions`, {
    method: 'POST',
    body: form,
  });
  if (!r.ok) throw new Error(`whisper ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { text?: string };
  return j.text ?? '';
}
