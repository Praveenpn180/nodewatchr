// src/Monitor.js — updated for Phase 3
import { RuleEngine }      from './engine/RuleEngine.js';
import { AlertBuffer }     from './engine/AlertBuffer.js';
import { Dispatcher }      from './adapters/Dispatcher.js';
import { resolveAdapters } from './adapters/AdapterRegistry.js';

export class Monitor extends EventEmitter {
  constructor({ rules, adapters: adapterConfigs, dispatcher: dispatcherOptions = {} }) {
    super();
    this._adapterConfigs    = adapterConfigs;
    this._dispatcherOptions = dispatcherOptions;
    this.engine = new RuleEngine(rules);
    this.buffer = new AlertBuffer();

    this.engine.on('match', e  => this.buffer.ingest(e));
    this.buffer.on('alert', alert => this._onAlert(alert));
  }

  async _onAlert(alert) {
    this.emit('alert', alert);           // still available for programmatic use
    await this.dispatcher?.dispatch(alert);
  }

  async start() {
    const adapters = await resolveAdapters(this._adapterConfigs);
    this.dispatcher = new Dispatcher(adapters, this._dispatcherOptions);
    this.buffer.startCleanup();
    return this;
  }

  attachWatcher(watcher) {
    watcher.on('line', e => this.engine.evaluate(e));
    return this;
  }

  stop() {
    this.buffer.stopCleanup();
  }

  swapRules(newRules) {
  // Validate the new rules construct cleanly before touching live state
  const newEngine = new RuleEngine(newRules);

  // Swap atomically — no window where the monitor is rule-less
  const oldEngine = this.engine;
  this.engine = newEngine;

  // Re-wire: buffer was listening to old engine's 'match' events
  oldEngine.removeAllListeners('match');
  this.engine.on('match', e => this.buffer.ingest(e));

  // Re-wire all active watchers to the new engine
  for (const watcher of this._watchers) {
    watcher.removeAllListeners('line');
    watcher.on('line', e => this.engine.evaluate(e));
  }
}
attachWatcher(watcher) {
  this._watchers ??= [];
  this._watchers.push(watcher);
  watcher.on('line', e => this.engine.evaluate(e));
  return this;
}
}