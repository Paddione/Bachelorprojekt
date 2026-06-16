'use strict'
const { execFileSync } = require('child_process')
const path = require('path')
const REPO = process.env.REPO || '/home/patrick/Bachelorprojekt'
const SCRIPT = path.join(REPO, 'scripts/agent-msg.sh')

function broadcast(text, label) {
  try {
    execFileSync('bash', [SCRIPT, 'post', String(text).slice(0, 512)], {
      stdio: 'ignore', timeout: 5000,
      env: { ...process.env, AGENT_MSG_LABEL: label || 'factory' },
    })
  } catch (_) { /* fail-open */ }
}

module.exports = { broadcast }
