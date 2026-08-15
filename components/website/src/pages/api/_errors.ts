export function errorResponse(code: string, requestId: string, status = 500): Response {
  return new Response(JSON.stringify({ error: code, requestId }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
