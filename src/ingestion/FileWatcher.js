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
    this._reading = null;
    this._readPending = false;
  }

  async start() {
    // Start reading from end of file (don't replay old logs)
    const s = await stat(this.filePath);
    this._offset = s.size;

    this._watcher = watch(this.filePath, {
      persistent: true,
      ignoreInitial: true,
    }).on('change', () => this._scheduleRead());

    await new Promise(resolve => this._watcher.once('ready', resolve));
    return this;
  }

  _scheduleRead() {
    if (this._reading) {
      this._readPending = true;
      return;
    }

    this._reading = this._readNewLines()
      .catch(error => this.emit('error', error))
      .finally(() => {
        this._reading = null;

        if (this._readPending) {
          this._readPending = false;
          this._scheduleRead();
        }
      });
  }

  async _readNewLines() {
    while (true) {
      const { size } = await stat(this.filePath);

      if (size < this._offset) {
        this._offset = 0; // file was rotated/truncated
        this.emit('rotate', { filePath: this.filePath });
      }

      if (size === this._offset) {
        return;
      }

      const start = this._offset;
      this._offset = size;

      await new Promise((resolve, reject) => {
        const stream = createReadStream(this.filePath, {
          start,
          end: size - 1,
        });
        const rl = createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        stream.on('error', reject);
        rl.on('line', line => this.emit('line', { line, timestamp: Date.now() }));
        rl.on('close', resolve);
      });
    }
  }

  stop() {
    this._watcher?.close();
  }
}
