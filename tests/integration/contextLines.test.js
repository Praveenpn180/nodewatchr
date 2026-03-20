import { describe, it, expect, afterEach } from 'vitest';
import { createHarness } from '../helpers/testHarness.js';

describe('context lines', () => {
  let harness;
  afterEach(() => harness?.cleanup());

  it('attaches contextBefore lines to the alert', async () => {
    const dispatched = [];
    harness = await createHarness(
      [{ name: 'ctx-before', match: /FATAL/, contextBefore: 2, contextAfter: 0, cooldownMs: 0 }],
      [(alert) => dispatched.push(alert)]
    );

    await harness.writeLine('INFO  request started');
    await harness.writeLine('DEBUG loading config');
    await harness.writeLine('FATAL something exploded');

    await vi.waitFor(() => expect(dispatched).toHaveLength(1), { timeout: 2000 });

    const roles = dispatched[0].contextLines.map(c => c.role);
    expect(roles).toEqual(['before', 'before', 'match']);
    expect(dispatched[0].contextLines[2].line).toContain('exploded');
  });

  it('waits for contextAfter lines before dispatching', async () => {
    const dispatched = [];
    harness = await createHarness(
      [{ name: 'ctx-after', match: /ERROR/, contextBefore: 0, contextAfter: 2, cooldownMs: 0 }],
      [(alert) => dispatched.push(alert)]
    );

    await harness.writeLine('ERROR boom');
    await new Promise(r => setTimeout(r, 200));
    expect(dispatched).toHaveLength(0);  // still waiting

    await harness.writeLine('INFO  recovery attempt');
    await harness.writeLine('INFO  recovered');

    await vi.waitFor(() => expect(dispatched).toHaveLength(1), { timeout: 2000 });

    const roles = dispatched[0].contextLines.map(c => c.role);
    expect(roles).toEqual(['match', 'after', 'after']);
  });
});
