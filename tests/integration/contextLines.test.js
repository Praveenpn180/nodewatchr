import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHarness } from '../helpers/testHarness.js';

describe('context lines', () => {
  let harness;
  afterEach(() => harness?.cleanup());

  it('attaches contextBefore lines to the alert', async () => {
    const dispatched = [];
    harness = await createHarness(
      [{
        name:          'ctx-before',
        match:         /FATAL/,
        contextBefore: 2,
        contextAfter:  0,
        cooldownMs:    0,
      }],
      [(alert) => dispatched.push(alert)]
    );

    await harness.writeLine('INFO  request started');
    await harness.writeLine('DEBUG loading config');
    await harness.writeLine('FATAL something exploded');

    await vi.waitFor(
      () => expect(dispatched).toHaveLength(1),
      { timeout: 5000, interval: 50 }
    );

    const ctx = dispatched[0].contextLines;
    expect(ctx).toBeDefined();

    const roles = ctx.map(c => c.role);
    expect(roles).toEqual(['before', 'before', 'match']);

    // The two before-lines must be INFO and DEBUG — not the match line itself
    expect(ctx[0].line).toContain('request started');
    expect(ctx[1].line).toContain('loading config');
    expect(ctx[2].line).toContain('exploded');
  });

  it('waits for contextAfter lines before dispatching', async () => {
    const dispatched = [];
    harness = await createHarness(
      [{
        name:          'ctx-after',
        match:         /ERROR/,
        contextBefore: 0,
        contextAfter:  2,
        cooldownMs:    0,
      }],
      [(alert) => dispatched.push(alert)]
    );

    await harness.writeLine('ERROR boom');

    // Alert must NOT fire yet — still waiting for 2 after-lines
    await new Promise(r => setTimeout(r, 300));
    expect(dispatched).toHaveLength(0);

    await harness.writeLine('INFO  recovery attempt');
    await harness.writeLine('INFO  recovered');

    await vi.waitFor(
      () => expect(dispatched).toHaveLength(1),
      { timeout: 5000, interval: 50 }
    );

    const ctx = dispatched[0].contextLines;
    expect(ctx).toBeDefined();

    const roles = ctx.map(c => c.role);
    expect(roles).toEqual(['match', 'after', 'after']);
    expect(ctx[0].line).toContain('boom');
    expect(ctx[1].line).toContain('recovery');
    expect(ctx[2].line).toContain('recovered');
  });
});
