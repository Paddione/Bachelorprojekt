// scripts/llm-proxy/listeners.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { withBearerAuth, startListeners } from './listeners.mjs'

// [T900107] Die beiden discoverBridgeAddress-Tests sind entfallen: der
// k3d-Bridge-Listener existiert nicht mehr. Der Proxy laeuft als Container
// des dev-pod und bindet ueber LLM_PROXY_HOST_BIND direkt.

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

test('startListeners: ohne Override bindet genau ein Listener auf Loopback', async () => {
  const handler = (req, res) => {
    res.writeHead(200)
    res.end('ok')
  }
  // Ohne bindOverride: Loopback-Pfad, genau ein Listener, kein Token.
  const servers = startListeners(handler, 0, { token: null })

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

test('startListeners: bindOverride bindet den vorgegebenen Host', async () => {
  // [Cluster-Betrieb] Im Pod muss der Listener auf dem vorgegebenen Host
  // lauschen (0.0.0.0 fuer Erreichbarkeit ueber die Pod-IP); auf 127.0.0.1
  // waere der Port von aussen tot.
  const handler = (req, res) => {
    res.writeHead(200)
    res.end('ok')
  }
  const servers = startListeners(handler, 0, {
    bindOverride: '0.0.0.0',
    token: 'cluster-token',
  })

  try {
    assert.equal(servers.length, 1)
    await new Promise((resolve) => {
      if (servers[0].listening) return resolve()
      servers[0].once('listening', resolve)
    })
    const addr = servers[0].address()
    assert.equal(addr.address, '0.0.0.0')
  } finally {
    for (const s of servers) s.close()
  }
})

test('startListeners: bindOverride mit Token schuetzt den Listener per Bearer', async () => {
  let called = 0
  const handler = (req, res) => {
    called++
    res.writeHead(200)
    res.end('ok')
  }
  const servers = startListeners(handler, 0, {
    bindOverride: '127.0.0.1',
    token: 'cluster-token',
  })

  try {
    await new Promise((resolve) => {
      if (servers[0].listening) return resolve()
      servers[0].once('listening', resolve)
    })
    const port = servers[0].address().port

    const unauth = await fetch(`http://127.0.0.1:${port}/livez`)
    assert.equal(unauth.status, 401)

    const ok = await fetch(`http://127.0.0.1:${port}/livez`, {
      headers: { authorization: 'Bearer cluster-token' },
    })
    assert.equal(ok.status, 200)
    assert.equal(called, 1)
  } finally {
    for (const s of servers) s.close()
  }
})
