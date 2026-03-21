import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'http';
import { RequestMonitor } from '../../src/middleware/RequestMonitor.js';

function makeReqRes(method = 'GET', url = '/test') {
  const req = { method, url, path: url, query: {}, headers: {} };
  const handlers = {};
  const res = {
    statusCode: 200,
    on(ev, fn) { handlers[ev] = fn; return this; },
    _emit(ev)  { handlers[ev]?.(); },
  };
  return { req, res };
}

describe('RequestMonitor', () => {
  it('emits request-alert for slow requests', async () => {
    const monitor = new RequestMonitor({ slowThresholdMs: 10 });
    const cb      = vi.fn();
    monitor.on('request-alert', cb);

    const { req, res } = makeReqRes();
    const mw = monitor.express();

    await new Promise(resolve => {
      mw(req, res, () => {
        setTimeout(() => {
          res.statusCode = 200;
          res._emit('finish');
          resolve();
        }, 30);
      });
    });

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].reason).toBe('slow');
    expect(cb.mock.calls[0][0].elapsedMs).toBeGreaterThanOrEqual(10);
  });

  it('emits request-alert for error status codes', async () => {
    const monitor = new RequestMonitor({ slowThresholdMs: 99999 });
    const cb      = vi.fn();
    monitor.on('request-alert', cb);

    const { req, res } = makeReqRes();
    const mw = monitor.express();

    await new Promise(resolve => {
      mw(req, res, () => {
        res.statusCode = 500;
        res._emit('finish');
        resolve();
      });
    });

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].reason).toBe('error');
    expect(cb.mock.calls[0][0].statusCode).toBe(500);
  });

  it('does not emit for fast successful requests', async () => {
    const monitor = new RequestMonitor({ slowThresholdMs: 99999 });
    const cb      = vi.fn();
    monitor.on('request-alert', cb);

    const { req, res } = makeReqRes();
    const mw = monitor.express();

    await new Promise(resolve => {
      mw(req, res, () => {
        res.statusCode = 200;
        res._emit('finish');
        resolve();
      });
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it('attaches log lines to the active request', async () => {
    const monitor = new RequestMonitor({ slowThresholdMs: 10 });
    const cb      = vi.fn();
    monitor.on('request-alert', cb);

    const { req, res } = makeReqRes();
    const mw = monitor.express();

    await new Promise(resolve => {
      mw(req, res, () => {
        // Simulate the interceptor calling attachLine from inside the request context
        const reqId = [...monitor._active.keys()][0];
        monitor.attachLine({ line: 'DB query started', timestamp: Date.now(), requestId: reqId });
        monitor.attachLine({ line: 'DB query done',    timestamp: Date.now(), requestId: reqId });

        setTimeout(() => {
          res.statusCode = 200;
          res._emit('finish');
          resolve();
        }, 30);
      });
    });

    expect(cb.mock.calls[0][0].logs).toHaveLength(2);
    expect(cb.mock.calls[0][0].logs[0].line).toBe('DB query started');
  });
});
