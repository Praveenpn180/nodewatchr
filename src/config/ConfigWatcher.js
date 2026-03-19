// src/config/ConfigWatcher.js
import { watch } from 'chokidar';
import { EventEmitter } from 'events';
import { loadConfig } from './ConfigLoader.js';

export class ConfigWatcher extends EventEmitter {
  constructor(configPath, options = {}) {
    super();
    this.configPath = configPath;
    this.debounceMs = options.debounceMs ?? 300; // editors write in bursts
    this._timer = null;
  }

  start() {
    this._watcher = watch(this.configPath, { persistent: true })
      .on('change', () => this._onchange());
    return this;
  }

  _onchange() {
    // Debounce: editors like VSCode trigger multiple change events per save
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._reload(), this.debounceMs);
  }

  async _reload() {
    try {
      // Bust the ESM import cache so the new JS config is actually re-evaluated
      const url = new URL(this.configPath, import.meta.url).href + `?t=${Date.now()}`;
      const mod  = await import(url);
      const raw  = mod.default ?? mod;
      const newConfig = await loadConfig(this.configPath, raw);
      this.emit('reload', newConfig);
    } catch (err) {
      this.emit('error', err);
    }
  }

  stop() {
    this._watcher?.close();
    clearTimeout(this._timer);
  }
}