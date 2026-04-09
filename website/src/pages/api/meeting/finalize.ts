import type { APIRoute } from 'astro';
import { getOrCreateCollection, createDocument } from '../../../lib/outline';
import { postToChannel } from '../../../lib/mattermost';

// Finalize a meeting: collect artifacts, create Outline profile, trigger Claude Code.
// Called by the Mattermost "Abschliessen" action or directly via API.
//
// Body: {
//   customerName, customerEmail, meetingType, meetingDate,
//   transcript?, artifacts?, channelId?, roomToken?
// }
export const POST: APIRoute = async ({ request }) => {
  try {
    const {
      customerName,
      customerEmail,
      meetingType,
      meetingDate,
      transcript,
      artifacts,
      channelId,
    } = await request.json();

    if (!customerName || !customerEmail) {
      return new Response(
        JSON.stringify({ error: 'customerName and customerEmail required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results: string[] = [];

    // 1. Get or create Outline collection for this customer
    const collection = await getOrCreateCollection(
      `Kunde: ${customerName}`,
      `Kundenakte fur ${customerName} (${customerEmail})`
    );

    if (collection) {
      results.push(`Outline-Kollektion: ${collection.url}`);

      // 2. Create/update customer profile document
      const profileDoc = await createDocument({
        title: `Profil: ${customerName}`,
        collectionId: collection.id,
        text: `# Kundenprofil: ${customerName}

## Kontaktdaten
- **E-Mail:** ${customerEmail}
- **Erstellt:** ${new Date().toLocaleDateString('de-DE')}

## Coaching-Richtung
_Wird durch Claude Code nach Meetings automatisch aktualisiert._

## Zusammenfassung
_Basiert auf bisherigen Gesprachen und Erkenntnissen._

---
*Dieses Profil wird automatisch durch die Meeting-Pipeline gepflegt.*
`,
      });

      if (profileDoc) {
        results.push(`Profil-Dokument erstellt: ${profileDoc.url}`);
      }

      // 3. Save meeting session document
      const sessionDate = meetingDate || new Date().toLocaleDateString('de-DE');
      const sessionTitle = `${meetingType || 'Meeting'} — ${sessionDate}`;

      let sessionContent = `# ${sessionTitle}\n\n`;
      sessionContent += `**Kunde:** ${customerName} (${customerEmail})\n`;
      sessionContent += `**Datum:** ${sessionDate}\n`;
      sessionContent += `**Typ:** ${meetingType || 'Nicht angegeben'}\n\n`;

      if (transcript) {
        sessionContent += `## Transkript\n\n${transcript}\n\n`;
      }

      if (artifacts && Array.isArray(artifacts) && artifacts.length > 0) {
        sessionContent += `## Artefakte\n\n`;
        for (const artifact of artifacts) {
          sessionContent += `- **${artifact.name || 'Datei'}**: ${artifact.description || artifact.url || 'Keine Beschreibung'}\n`;
        }
        sessionContent += '\n';
      }

      sessionContent += `## Claude Code-Analyse\n\n_Analyse wird nach Finalisierung durch Claude Code erstellt._\n\n`;
      sessionContent += `---\n*Automatisch erstellt am ${new Date().toLocaleString('de-DE')}*\n`;

      const sessionDoc = await createDocument({
        title: sessionTitle,
        collectionId: collection.id,
        text: sessionContent,
      });

      if (sessionDoc) {
        results.push(`Session-Dokument: ${sessionDoc.url}`);
      }
    } else {
      results.push('Outline nicht verfugbar — Dokumente nicht erstellt');
    }

    // 4. Post summary to customer Mattermost channel
    if (channelId) {
      const summaryParts = [
        `### :file_folder: Meeting abgeschlossen: ${meetingType || 'Meeting'}`,
        '',
        `**Kunde:** ${customerName}`,
        `**Datum:** ${meetingDate || new Date().toLocaleDateString('de-DE')}`,
        '',
      ];

      if (transcript) {
        summaryParts.push(':page_facing_up: Transkript gespeichert');
      }
      if (collection) {
        summaryParts.push(`:books: Outline-Kollektion: ${collection.url}`);
      }
      summaryParts.push('', ':robot_face: _Claude Code-Analyse wird erstellt..._');

      await postToChannel(channelId, summaryParts.join('\n'));
    }

    // 5. TODO: Trigger Claude Code to analyze artifacts and update Outline profile
    // This would be a call to Claude Code's MCP or API endpoint.
    // For now, we prepare the structure — Claude Code integration comes when
    // the MCP pipeline is configured.
    results.push('Claude Code-Pipeline: bereit (Trigger bei MCP-Konfiguration)');

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Finalize meeting error:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
