import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookAdapter } from '../../src/adapters/WebhookAdapter.js';

const alert = {
  rule: { name: 'fatal-error', severity: 'critical' },
  line: 'ERROR boom',
  count: 2,
  fingerprint: 'abc123',
  timestamp: Date.UTC(2026, 2, 20, 12, 0, 0),
  contextLines: [{ role: 'match', line: 'ERROR boom', timestamp: Date.UTC(2026, 2, 20, 12, 0, 0) }],
};

describe('WebhookAdapter', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts the default JSON payload', async () => {
    const adapter = new WebhookAdapter({ url: 'https://hooks.example.test' });
    await adapter.send(alert);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, options] = globalThis.fetch.mock.calls[0];

    expect(url).toBe('https://hooks.example.test');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toMatchObject({
      ruleName: 'fatal-error',
      severity: 'critical',
      line: 'ERROR boom',
      count: 2,
      fingerprint: 'abc123',
    });
  });

  it('renders a custom body template and forwards custom headers', async () => {
    const adapter = new WebhookAdapter({
      url: 'https://hooks.example.test',
      method: 'PUT',
      contentType: 'text/plain',
      headers: { 'X-Test': '1' },
      bodyTemplate: '{{ruleName}}:{{line}}',
    });

    await adapter.send(alert);

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.method).toBe('PUT');
    expect(options.headers).toEqual({
      'Content-Type': 'text/plain',
      'X-Test': '1',
    });
    expect(options.body).toBe('fatal-error:ERROR boom');
  });
});
