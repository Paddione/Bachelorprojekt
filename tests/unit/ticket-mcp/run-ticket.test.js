import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runTicket } from '../../../scripts/ticket-mcp/lib/run-ticket.js';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ticket-mcp-test-'));
});

afterEach(() => rmSync(tmpDir, { recursive: true }));

describe('runTicket', () => {
  it('returns stdout on success', async () => {
    const script = join(tmpDir, 'ok.sh');
    writeFileSync(script, '#!/usr/bin/env bash\necho ok\n');
    const result = await runTicket([], { TICKET_SH: script });
    assert.equal(result.trim(), 'ok');
  });

  it('throws on non-zero exit', async () => {
    const script = join(tmpDir, 'fail.sh');
    writeFileSync(script, '#!/usr/bin/env bash\nexit 1\n');
    await assert.rejects(
      () => runTicket([], { TICKET_SH: script }),
      /exit code 1/
    );
  });
});
