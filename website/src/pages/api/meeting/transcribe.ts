import type { APIRoute } from 'astro';
import { transcribeAudio, formatTranscript } from '../../../lib/whisper';


// Upload an audio file for transcription.
// Sends to faster-whisper, posts result to the customer's Mattermost channel.
//
// Multipart form: file (audio), channelId (optional), customerName (optional)
export const POST: APIRoute = async ({ request , locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'Keine Audiodatei hochgeladen.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convert File to Buffer for whisper
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Transcribe
    const result = await transcribeAudio(buffer, file.name);

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Transkription fehlgeschlagen. Ist der Whisper-Service erreichbar?' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const formatted = formatTranscript(result);

    return new Response(
      JSON.stringify({
        success: true,
        text: result.text,
        formatted,
        language: result.language,
        duration: result.duration,
        segmentCount: result.segments?.length || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    locals.requestLogger.error({ err }, 'Transcription upload error:');
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
