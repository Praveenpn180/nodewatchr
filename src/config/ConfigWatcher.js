// src/config/ConfigWatcher.js
import { watch } from 'chokidar';
import { EventEmitter } from 'events';
import { loadLocalConfig, resolveConfig } from './ConfigLoader.js';

export class ConfigWatcher extends EventEmitter {
  constructor(configPath, options = {}) {
    super();
    this.configPath = configPath;
    this.debounceMs = options.debounceMs ?? 300; // editors write in bursts
    this.fetchImpl = options.fetchImpl;
    this._currentConfig = options.initialConfig ?? null;
    this._timer = null;
    this._pollTimer = null;
  }

  start() {
    this._watcher = watch(this.configPath, {
      persistent: true,
      ignoreInitial: true,
    })
      .on('change', () => this._onchange());
    if (this._currentConfig) {
      this._syncRemotePolling();
    } else {
      void this._primeCurrentConfig();
    }
    return this;
  }

  _onchange() {
    // Debounce: editors like VSCode trigger multiple change events per save
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._reload(), this.debounceMs);
  }

  async _reload() {
    try {
      const localConfig = await loadLocalConfig(this.configPath, { cacheBust: true });
      const newConfig = await resolveConfig(localConfig, {
        fetchImpl: this.fetchImpl,
        allowRemoteFailureFallback: false,
      });

      if (this._isSameConfig(this._currentConfig, newConfig)) {
        this._syncRemotePolling();
        return;
      }

      this._currentConfig = newConfig;
      this._syncRemotePolling();
      this.emit('reload', newConfig);
    } catch (err) {
      this.emit('error', err);
    }
  }

  stop() {
    this._watcher?.close();
    clearTimeout(this._timer);
    clearInterval(this._pollTimer);
  }

  async _primeCurrentConfig() {
    try {
      const localConfig = await loadLocalConfig(this.configPath);
      this._currentConfig = await resolveConfig(localConfig, {
        fetchImpl: this.fetchImpl,
      });
      this._syncRemotePolling();
    } catch (err) {
      this.emit('error', err);
    }
  }

  _syncRemotePolling() {
    clearInterval(this._pollTimer);

    if (!this._currentConfig?.remote) {
      return;
    }

    this._pollTimer = setInterval(() => {
      void this._reload();
    }, this._currentConfig.remote.pollIntervalMs);
    this._pollTimer.unref?.();
  }

  _isSameConfig(previousConfig, nextConfig) {
    if (!previousConfig) return false;

    return JSON.stringify(previousConfig, this._stringifyValue)
      === JSON.stringify(nextConfig, this._stringifyValue);
  }

  _stringifyValue(_key, value) {
    if (value instanceof RegExp) {
      return value.toString();
    }
    return value;
  }
}
