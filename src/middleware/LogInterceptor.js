// src/middleware/LogInterceptor.js
import { requestContext } from './RequestContext.js';

export class LogInterceptor {
  constructor({ streams, onLine, onRequestLine, passThrough = true } = {}) {
    this._streams       = streams ?? [process.stdout, process.stderr];
    this._onLine        = onLine;
    this._onRequestLine = onRequestLine;
    this._passThrough   = passThrough;
    this._originals     = new Map();   // stream → original write function reference
    this._lineBuffers   = new Map();   // stream → partial-line string buffer
  }

  install() {
    for (const stream of this._streams) {
      if (this._originals.has(stream)) continue;

      // Store the raw reference — do NOT .bind() here.
      // Binding creates a new function object, making identity checks
      // (stream.write === orig) fail after uninstall.
      const originalWrite = stream.write;
      this._originals.set(stream, originalWrite);
      this._lineBuffers.set(stream, '');

      const self = this;

      stream.write = function interceptedWrite(chunk, encoding, callback) {
        const text = Buffer.isBuffer(chunk)
          ? chunk.toString(encoding ?? 'utf8')
          : String(chunk);

        const buf   = self._lineBuffers.get(stream) + text;
        const lines = buf.split('\n');
        self._lineBuffers.set(stream, lines.pop()); // keep partial trailing line

        const timestamp = Date.now();

        for (const line of lines) {
          if (!line) continue;

          self._onLine?.({ line, timestamp });

          const store = requestContext.getStore();
          if (store?.requestId) {
            self._onRequestLine?.({ line, timestamp, requestId: store.requestId });
          }
        }

        if (self._passThrough) {
          // Call original with the stream as `this` — equivalent to the bound call
          // but without creating a new function reference at install time.
          return originalWrite.call(stream, chunk, encoding, callback);
        } else {
          callback?.();
          return true;
        }
      };
    }
    return this;
  }

  uninstall() {
    for (const [stream, originalWrite] of this._originals) {
      stream.write = originalWrite;   // restores the exact same reference
    }
    this._originals.clear();
    this._lineBuffers.clear();
    return this;
  }
}
