export class StorageSink {
  constructor(adapter, { batchSize = 100, flushIntervalMs = 5_000 } = {}) {
    this._adapter = adapter;
    this._batchSize = batchSize;
    this._queue = [];
    this._flushPromise = null;
    this._timer = setInterval(() => {
      void this.flush();
    }, flushIntervalMs);
    this._timer.unref?.();
  }

  push(entry) {
    this._queue.push({ ...entry, savedAt: Date.now() });
    if (this._queue.length >= this._batchSize) {
      void this.flush();
    }
  }

  async flush() {
    if (!this._queue.length) return;
    if (this._flushPromise) return this._flushPromise;

    this._flushPromise = this._drainQueue()
      .finally(() => {
        this._flushPromise = null;
      });

    return this._flushPromise;
  }

  async _drainQueue() {
    while (this._queue.length) {
      const batch = this._queue.splice(0, this._batchSize);

      try {
        await this._adapter.writeBatch(batch);
      } catch (error) {
        console.error('[alertengine-js] storage flush failed:', error.message);
      }
    }
  }

  async stop() {
    clearInterval(this._timer);
    await this.flush();
  }
}
