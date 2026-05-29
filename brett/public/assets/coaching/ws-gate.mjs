// The inline connectWS() in index.html is the single coaching connection.
// ws.mjs should only open a second socket in mayhem mode.
export function shouldConnectAuxWs(mode) {
  return mode === 'mayhem';
}
