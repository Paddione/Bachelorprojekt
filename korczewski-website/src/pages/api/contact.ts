import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, type, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Name, E-Mail und Nachricht sind Pflichtfelder.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const webhookUrl = import.meta.env.MATTERMOST_WEBHOOK_URL;

    if (webhookUrl) {
      const typeLabels: Record<string, string> = {
        allgemein: 'Allgemeine Anfrage',
        kennenlernen: 'Kennenlerngesprach',
        'ki-beratung': 'KI-Beratung',
        'software-dev': 'Software-Entwicklung',
        deployment: 'Deployment & Infrastruktur',
        opensource: 'Open-Source-Losungen',
      };

      const text = [
        `**Neue Anfrage** von **${name}**`,
        `**Typ:** ${typeLabels[type] || type}`,
        `**E-Mail:** ${email}`,
        phone ? `**Telefon:** ${phone}` : '',
        `---`,
        message,
      ]
        .filter(Boolean)
        .join('\n');

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
