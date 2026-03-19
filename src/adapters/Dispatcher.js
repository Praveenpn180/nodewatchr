// src/adapters/Dispatcher.js
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export class Dispatcher {
  constructor(adapters, options = {}) {
    this.adapters = adapters;
    this.maxRetries = options.maxRetries ?? 3;
    this.deadLetterDir = options.deadLetterDir ?? '.nodewatchr/failed';
  }

  async dispatch(alert) {
    const results = await Promise.allSettled(
      this.adapters.map(adapter => this._sendWithRetry(adapter, alert))
    );

    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        await this._writeDeadLetter(alert, this.adapters[i], result.reason);
      }
    }
  }

  async _sendWithRetry(adapter, alert, attempt = 1) {
    try {
      await adapter.send(alert);
    } catch (err) {
      if (attempt >= this.maxRetries) throw err;

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      await new Promise(r => setTimeout(r, delay));
      return this._sendWithRetry(adapter, alert, attempt + 1);
    }
  }

  async _writeDeadLetter(alert, adapter, error) {
    await mkdir(this.deadLetterDir, { recursive: true });
    const filename = `${Date.now()}-${alert.fingerprint}.json`;
    await writeFile(
      join(this.deadLetterDir, filename),
      JSON.stringify({
        alert,
        adapter: adapter.constructor.name,
        error: error.message,
        failedAt: new Date().toISOString(),
      }, null, 2)
    );
  }
}