// src/middleware/RequestMonitor.js
import { EventEmitter } from 'events';
import { requestContext, createRequestId } from './RequestContext.js';

export class RequestMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.slowThresholdMs  = options.slowThresholdMs  ?? 1000;
    this.errorStatusCodes = options.errorStatusCodes ?? [500, 502, 503, 504];
    this.captureHeaders   = options.captureHeaders   ?? false;
    this.captureBody      = options.captureBody      ?? false;
    this.maxLogLines      = options.maxLogLines      ?? 50;
    this._active          = new Map();
  }

  attachLine({ line, timestamp, requestId }) {
    const entry = this._active.get(requestId);
    if (!entry) return;
    if (entry.logs.length < this.maxLogLines) {
      entry.logs.push({ line, timestamp });
    }
  }

  _start(requestId, meta) {
    this._active.set(requestId, { ...meta, logs: [] });
  }

  _finish(requestId, statusCode) {
    const entry = this._active.get(requestId);
    if (!entry) return;
    this._active.delete(requestId);

    const elapsedMs = Date.now() - entry.startedAt;
    const isSlow    = elapsedMs >= this.slowThresholdMs;
    const isError   = this.errorStatusCodes.includes(statusCode);

    if (!isSlow && !isError) return;

    const alert = {
      requestId:  entry.requestId,
      method:     entry.method,
      path:       entry.path,
      query:      entry.query,
      headers:    entry.headers,
      body:       entry.body,
      statusCode,
      elapsedMs,
      logs:       entry.logs,
      startedAt:  entry.startedAt,
      finishedAt: Date.now(),
      reason:     isSlow && isError ? 'slow+error' : isSlow ? 'slow' : 'error',
    };

    this.emit('request-alert', alert);
  }

  express() {
    return (req, res, next) => {
      const requestId = createRequestId();

      this._start(requestId, {
        requestId,
        method:    req.method,
        path:      req.path ?? req.url,
        query:     req.query,
        headers:   this.captureHeaders ? req.headers : undefined,
        body:      this.captureBody    ? req.body    : undefined,
        startedAt: Date.now(),
      });

      const finish = () => this._finish(requestId, res.statusCode);
      res.on('finish', finish);
      res.on('close',  finish);

      requestContext.run({ requestId }, next);
    };
  }

  fastify() {
    const self = this;
    return async function plugin(fastify) {
      fastify.addHook('onRequest', (req, _reply, done) => {
        const requestId = createRequestId();
        req.alertengineId = requestId;
        self._start(requestId, {
          requestId,
          method:    req.method,
          path:      req.url,
          startedAt: Date.now(),
        });
        requestContext.run({ requestId }, done);
      });

      fastify.addHook('onResponse', (req, reply, done) => {
        self._finish(req.alertengineId, reply.statusCode);
        done();
      });
    };
  }
}
