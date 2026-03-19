// src/ingestion/FileWatcher.js
import { watch } from 'chokidar';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';

export class FileWatcher extends EventEmitter {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this._offset = 0;
  }

  async start() {
    // Start reading from end of file (don't replay old logs)
    const s = await stat(this.filePath);
    this._offset = s.size;

    this._watcher = watch(this.filePath, { persistent: true }).on(
      'change',
      () => this._readNewLines(),
    );
    return this;
  }

  async _readNewLines() {
  const { size } = await stat(this.filePath);

  if (size < this._offset) {
    this._offset = 0;           // file was rotated/truncated
    this.emit('rotate', { filePath: this.filePath });
  }

  if (size === this._offset) return;  // no new data

  const stream = createReadStream(this.filePath, {
    start: this._offset,
    end: size - 1
  });
  this._offset = size;
  const rl = createInterface({ input: stream });
  rl.on('line', (line) => this.emit('line', { line, timestamp: Date.now() }));
}

  stop() {
    this._watcher?.close();
  }
}
