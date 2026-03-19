// src/ingestion/StreamWatcher.js
import { createInterface } from 'readline';
import { EventEmitter } from 'events';

export class StreamWatcher extends EventEmitter {
  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.options = options;
  }

  start() {
    const rl = createInterface({ input: this.stream, crlfDelay: Infinity });
    rl.on('line', (line) => this.emit('line', { line, timestamp: Date.now() }));
    rl.on('close', () => this.emit('close'));
    this._rl = rl;
    return this;
  }

  stop() {
    this._rl?.close();
  }
}
