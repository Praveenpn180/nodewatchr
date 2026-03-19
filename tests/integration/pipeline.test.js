// tests/integration/pipeline.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHarness } from '../helpers/testHarness.js';

describe('full pipeline', () => {
  let harness;
  afterEach(() => harness?.cleanup());

  it('fires an alert when regex rule matches', async () => {
    const dispatched = [];
    harness = await createHarness(
      [{ name: 'errors', match: /ERROR/, cooldownMs: 0 }],
      [(alert) => dispatched.push(alert)]
    );

    await harness.writeLine('2024-01-01 ERROR something broke');
    await vi.waitFor(() => expect(dispatched).toHaveLength(1), { timeout: 2000 });

    expect(dispatched[0].rule.name).toBe('errors');
    expect(dispatched[0].line).toContain('something broke');
  });

  it('respects threshold — does not fire until count is reached', async () => {
    const dispatched = [];
    harness = await createHarness(
      [{ name: 'threshold-rule', match: /WARN/, threshold: { count: 3, windowMs: 5000 }, cooldownMs: 0 }],
      [(alert) => dispatched.push(alert)]
    );

    await harness.writeLine('WARN one');
    await harness.writeLine('WARN two');
    await new Promise(r => setTimeout(r, 200)); // settle
    expect(dispatched).toHaveLength(0);          // not yet

    await harness.writeLine('WARN three');
    await vi.waitFor(() => expect(dispatched).toHaveLength(1), { timeout: 2000 });
  });

  it('suppresses duplicate alerts within cooldown window', async () => {
    const dispatched = [];
    harness = await createHarness(
      [{ name: 'cooldown-rule', match: /FATAL/, cooldownMs: 10_000 }],
      [(alert) => dispatched.push(alert)]
    );

    await harness.writeLine('FATAL crash');
    await vi.waitFor(() => expect(dispatched).toHaveLength(1), { timeout: 2000 });

    await harness.writeLine('FATAL crash again');
    await new Promise(r => setTimeout(r, 300));
    expect(dispatched).toHaveLength(1); // cooldown suppressed the second one
  });

  it('routes to multiple adapter stubs independently', async () => {
    const stubA = vi.fn(), stubB = vi.fn();
    harness = await createHarness(
      [{ name: 'multi', match: /ERROR/, cooldownMs: 0 }],
      [stubA, stubB]
    );

    await harness.writeLine('ERROR in both adapters');
    await vi.waitFor(() => expect(stubA).toHaveBeenCalledOnce(), { timeout: 2000 });
    expect(stubB).toHaveBeenCalledOnce();
  });

  it('continues routing if one adapter stub throws', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('network down'));
    const working = vi.fn();
    harness = await createHarness(
      [{ name: 'resilience', match: /ERROR/, cooldownMs: 0 }],
      [failing, working]
    );

    await harness.writeLine('ERROR adapter failure test');
    await vi.waitFor(() => expect(working).toHaveBeenCalledOnce(), { timeout: 2000 });
  });
});