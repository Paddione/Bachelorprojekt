import type { APIRoute } from 'astro';

// `commit`/`builtAt` come from the ARG/ENV pair baked into the runtime stage of
// website/Dockerfile (T002202). They let an E2E run tell the code under test
// apart from the deploy it is actually hitting — without them a run against
// prod measures both at once and files tickets against bugs that do not exist
// in the repo (T002192).
//
// Both fields are ALWAYS present. Falling back to the literal 'unknown' rather
// than omitting them matters: an absent field reads as `undefined`, and a
// consumer comparing `undefined !== undefined` would conclude "no drift" at
// the exact moment the build-arg chain has broken.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({
    ok: true,
    commit: process.env.GIT_SHA || 'unknown',
    builtAt: process.env.BUILT_AT || 'unknown',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
