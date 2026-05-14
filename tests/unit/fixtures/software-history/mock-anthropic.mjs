#!/usr/bin/env node
// Minimal stub: speaks just enough of /v1/messages for the classifier.
// Returns canned JSON keyed on the PR number found in the user message.
import http from 'node:http';

const RESPONSES = {
  1: { events: [{ service: 'mattermost',     area: 'chat', kind: 'added',   confidence: 0.9 }] },
  2: { events: [{ service: 'mattermost',     area: 'chat', kind: 'removed', confidence: 0.9 },
                 { service: 'native-chat',    area: 'chat', kind: 'added',   confidence: 0.9 }] },
  3: { events: [{ service: 'unknown',        area: 'other', kind: 'irrelevant', confidence: 0.3 }] },
};

const port = parseInt(process.env.MOCK_PORT ?? '4001', 10);
http.createServer((req, res) => {
  if (req.url !== '/v1/messages') { res.writeHead(404).end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const m = body.match(/PR #(\d+)/);
    const pr = m ? parseInt(m[1], 10) : 0;
    const payload = RESPONSES[pr] ?? { events: [{ service: 'unknown', area: 'other', kind: 'irrelevant', confidence: 0.1 }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'mock',
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    }));
  });
}).listen(port, '127.0.0.1', () => console.error(`mock anthropic on :${port}`));
