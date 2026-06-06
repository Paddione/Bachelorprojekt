export const meta = {
  name: 'pipeline-spike',
  description: 'Throwaway Phase 0 probe',
  phases: [{ title: 'Spike' }]
}

async function main() {
  const A = args ?? {}
  const dry_run = A.dry_run !== false && A.dry_run !== 'false'
  console.log(JSON.stringify({ spike: 'pipeline', nested: true, agents: 0, dry_run }));
  return { ok: true, agents: 0, dry_run };
}
await main();
