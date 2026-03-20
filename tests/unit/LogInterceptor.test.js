import { describe, it, expect, vi, afterEach } from 'vitest';
import { PassThrough } from 'stream';
import { LogInterceptor } from '../../src/middleware/LogInterceptor.js';

describe('LogInterceptor', () => {
  let interceptor;
  afterEach(() => interceptor?.uninstall());

  it('calls onLine for each newline-delimited chunk', async () => {
    const stream = new PassThrough();
    const onLine = vi.fn();
    interceptor  = new LogInterceptor({ streams: [stream], onLine, passThrough: true });
    interceptor.install();

    stream.write('hello\nworld\n');
    await new Promise(r => setTimeout(r, 10));

    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine.mock.calls[0][0].line).toBe('hello');
    expect(onLine.mock.calls[1][0].line).toBe('world');
  });

  it('buffers partial lines across writes', async () => {
    const stream = new PassThrough();
    const onLine = vi.fn();
    interceptor  = new LogInterceptor({ streams: [stream], onLine, passThrough: false });
    interceptor.install();

    stream.write('hel');
    stream.write('lo\nwor');
    stream.write('ld\n');
    await new Promise(r => setTimeout(r, 10));

    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine.mock.calls[0][0].line).toBe('hello');
    expect(onLine.mock.calls[1][0].line).toBe('world');
  });

  it('restores original write on uninstall', () => {
    const stream = new PassThrough();
    const orig   = stream.write;
    interceptor  = new LogInterceptor({ streams: [stream], onLine: vi.fn() });
    interceptor.install();
    expect(stream.write).not.toBe(orig);
    interceptor.uninstall();
    expect(stream.write).toBe(orig);
  });
});
