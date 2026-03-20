// src/middleware/LogInterceptor.js
import { requestContext } from './RequestContext.js';

export class LogInterceptor {
  constructor({ streams, onLine, onRequestLine, passThrough = true } = {}) {
    this._streams       = streams ?? [process.stdout, process.stderr];
    this._onLine        = onLine;
    this._onRequestLine = onRequestLine;
    this._passThrough   = passThrough;
    this._originals     = new Map();
    this._lineBuffers   = new Map();
  }

  install() {
    for (const stream of this._streams) {
      if (this._originals.has(stream)) continue;

      const originalWrite = stream.write.bind(stream);
      this._originals.set(stream, originalWrite);
      this._lineBuffers.set(stream, '');

      stream.write = (chunk, encoding, callback) => {
        const text = Buffer.isBuffer(chunk)
          ? chunk.toString(encoding ?? 'utf8')
          : String(chunk);

        const buf   = this._lineBuffers.get(stream) + text;
        const lines = buf.split('\n');
        this._lineBuffers.set(stream, lines.pop());

        const timestamp = Date.now();

        for (const line of lines) {
          if (!line) continue;

          this._onLine?.({ line, timestamp });

          const store = requestContext.getStore();
          if (store?.requestId) {
            this._onRequestLine?.({ line, timestamp, requestId: store.requestId });
          }
        }

        if (this._passThrough) {
          return originalWrite(chunk, encoding, callback);
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
      stream.write = originalWrite;
    }
    this._originals.clear();
    this._lineBuffers.clear();
    return this;
  }
}
