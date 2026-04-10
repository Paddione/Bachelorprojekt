export { r as renderers } from '../../chunks/_@astro-renderers_BD3J2jSH.mjs';

const POST = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, type, message } = body;
    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Name, E-Mail und Nachricht sind Pflichtfelder." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const webhookUrl = undefined                                      ;
    if (webhookUrl) ;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    return new Response(JSON.stringify({ error: "Interner Serverfehler." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
