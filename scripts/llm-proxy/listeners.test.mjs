// scripts/llm-proxy/listeners.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { discoverBridgeAddress, withBearerAuth, startListeners } from './listeners.mjs'

test('discoverBridgeAddress: liefert Gateway-Adresse wenn exec erfolgreich ist', () => {
  const mockExec = (cmd, args) => {
    assert.equal(cmd, 'docker')
    assert.deepEqual(args, ['network', 'inspect', 'k3d-mentolder-dev', '-f', '{{range .IPAM.Config}}{{.Gateway}}{{end}}'])
    return '172.23.0.1\n'
  }
  const res = discoverBridgeAddress('k3d-mentolder-dev', mockExec)
  assert.equal(res, '172.23.0.1')
})

test('discoverBridgeAddress: gibt null zurueck wenn exec wirft', () => {
  const mockExec = () => {
    throw new Error('docker not found')
  }
  const res = discoverBridgeAddress('k3d-mentolder-dev', mockExec)
  assert.equal(res, null)
})

test('withBearerAuth: ohne authorization Header liefert 401 und ruft Handler nicht auf', async () => {
  let called = false
  const innerHandler = (req, res) => {
    called = true
    res.writeHead(200)
    res.end('ok')
  }
  const wrapped = withBearerAuth(innerHandler, 'secret-token-123')

  const server = http.createServer(wrapped)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const res = await fetch(`http://127.0.0.1:${port}/test`)
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.deepEqual(body, { error: { code: 'unauthorized' } })
    assert.equal(called, false)
  } finally {
    server.close()
  }
})

test('withBearerAuth: mit falschem Token liefert 401', async () => {
  let called = false
  const innerHandler = (req, res) => {
    called = true
    res.writeHead(200)
    res.end('ok')
  }
  const wrapped = withBearerAuth(innerHandler, 'secret-token-123')

  const server = http.createServer(wrapped)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      headers: { authorization: 'Bearer wrong-token' },
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.deepEqual(body, { error: { code: 'unauthorized' } })
    assert.equal(called, false)
  } finally {
    server.close()
  }
})

test('withBearerAuth: mit korrektem Token ruft inneren Handler auf', async () => {
  let called = 0
  const innerHandler = (req, res) => {
    called++
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  }
  const wrapped = withBearerAuth(innerHandler, 'secret-token-123')

  const server = http.createServer(wrapped)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      headers: { authorization: 'Bearer secret-token-123' },
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { ok: true })
    assert.equal(called, 1)
  } finally {
    server.close()
  }
})

test('startListeners: ohne Token aber mit Adresse startet nur Loopback-Listener', async () => {
  const handler = (req, res) => {
    res.writeHead(200)
    res.end('ok')
  }
  const servers = startListeners(handler, 0, {
    bindOverride: '127.0.0.1',
    token: null,
  })

  try {
    assert.equal(servers.length, 1)
    await new Promise((resolve) => {
      if (servers[0].listening) return resolve()
      servers[0].once('listening', resolve)
    })
    const addr = servers[0].address()
    assert.equal(addr.address, '127.0.0.1')
  } finally {
    for (const s of servers) s.close()
  }
})
