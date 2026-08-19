/**
 * Testtreiber fuer repo-guard: ruft apply() mit einem Fake-Kontext auf und
 * gibt die Entscheidung je Fall als eine JSON-Zeile aus.
 *
 * Warum ein Treiber und kein grep: Die drei Defekte aus T012965 (exec.args,
 * process.cwd(), {action:...}) waren allesamt nur beim AUSFUEHREN sichtbar —
 * der Quelltext las sich in jeder Fassung plausibel.
 *
 * Usage: node repo-guard-drive.mjs <pfad-zu-repo-guard.mjs>
 */
const [, , modulePath] = process.argv
const mod = await import(modulePath)

let listener
const ctx = {
  on(event, fn) {
    if (event === 'tools/pre-execute') listener = fn
  },
}
mod.apply(ctx)

if (typeof listener !== 'function') {
  console.log(JSON.stringify({ case: 'registration', ok: false, note: 'kein tools/pre-execute-Listener registriert' }))
  process.exit(1)
}
console.log(JSON.stringify({ case: 'registration', ok: true }))

const SESSION_CWD = '/tmp/session-workspace'
const agent = { session: { header: { cwd: SESSION_CWD } } }
const NEXT = { kind: 'allow', via: 'next' }
const next = async () => NEXT

const cases = [
  { case: 'write-inside', exec: { name: 'Write', arguments: { file_path: `${SESSION_CWD}/src/a.ts` }, agent } },
  { case: 'write-outside', exec: { name: 'Write', arguments: { file_path: '/etc/passwd' }, agent } },
  { case: 'write-escape-dotdot', exec: { name: 'Edit', arguments: { file_path: `${SESSION_CWD}/../outside.txt` }, agent } },
  { case: 'read-tool-outside', exec: { name: 'Read', arguments: { file_path: '/etc/passwd' }, agent } },
  { case: 'no-agent', exec: { name: 'Write', arguments: { file_path: '/etc/passwd' } } },
  { case: 'prefix-trap', exec: { name: 'Write', arguments: { file_path: `${SESSION_CWD}-evil/x.txt` }, agent } },
]

for (const c of cases) {
  const decision = await listener(c.exec, next)
  console.log(JSON.stringify({ case: c.case, kind: decision?.kind ?? null, delegated: decision === NEXT, reason: decision?.reason ?? '' }))
}
