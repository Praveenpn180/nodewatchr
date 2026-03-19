import { EventEmitter } from 'events';
import { Dispatcher } from './adapters/Dispatcher.js';
import { resolveAdapters } from './adapters/AdapterRegistry.js';
import { AlertBuffer } from './engine/AlertBuffer.js';
import { RuleEngine } from './engine/RuleEngine.js';

export class Monitor extends EventEmitter {
  constructor({ rules, adapters: adapterConfigs, dispatcher: dispatcherOptions = {} }) {
    super();
    this._adapterConfigs = adapterConfigs;
    this._dispatcherOptions = dispatcherOptions;
    this._watchers = new Set();
    this._watcherHandlers = new Map();
    this.buffer = new AlertBuffer();
    this.engine = new RuleEngine(rules);
    this._onMatch = e => this.buffer.ingest(e);

    this.engine.on('match', this._onMatch);
    this.buffer.on('alert', alert => this._onAlert(alert));
  }

  async _onAlert(alert) {
    this.emit('alert', alert);
    await this.dispatcher?.dispatch(alert);
  }

  async start() {
    if (!this.dispatcher) {
      const adapters = await resolveAdapters(this._adapterConfigs);
      this.dispatcher = new Dispatcher(adapters, this._dispatcherOptions);
    }

    this.buffer.startCleanup();
    return this;
  }

  attachWatcher(watcher) {
    if (this._watchers.has(watcher)) {
      return this;
    }

    const onLine = e => this.engine.evaluate(e);
    this._watchers.add(watcher);
    this._watcherHandlers.set(watcher, onLine);
    watcher.on('line', onLine);
    return this;
  }

  stop() {
    this.buffer.stopCleanup();
  }

  swapRules(newRules) {
    const newEngine = new RuleEngine(newRules);
    const oldEngine = this.engine;

    this.engine = newEngine;
    oldEngine.off('match', this._onMatch);
    this.engine.on('match', this._onMatch);

    for (const watcher of this._watchers) {
      const oldOnLine = this._watcherHandlers.get(watcher);
      const nextOnLine = e => this.engine.evaluate(e);

      if (oldOnLine) {
        watcher.off('line', oldOnLine);
      }

      this._watcherHandlers.set(watcher, nextOnLine);
      watcher.on('line', nextOnLine);
    }
  }
}
