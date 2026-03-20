// src/Monitor.js
import { EventEmitter }    from 'events';
import { Dispatcher }      from './adapters/Dispatcher.js';
import { resolveAdapters } from './adapters/AdapterRegistry.js';
import { AlertBuffer }     from './engine/AlertBuffer.js';
import { RuleEngine }      from './engine/RuleEngine.js';
import { LineRingBuffer }  from './engine/LineRingBuffer.js';
import { ContextCollector }from './engine/ContextCollector.js';

export class Monitor extends EventEmitter {
  constructor({ rules, adapters: adapterConfigs, dispatcher: dispatcherOptions = {} }) {
    super();
    this._adapterConfigs    = adapterConfigs;
    this._dispatcherOptions = dispatcherOptions;
    this._watchers          = new Set();
    this._watcherHandlers   = new Map();

    const maxBefore = Math.max(0, ...rules.map(r => r.contextBefore ?? 0));
    this._ringBuffer = new LineRingBuffer(maxBefore + 1);

    this.buffer    = new AlertBuffer();
    this.engine    = new RuleEngine(rules);
    this.collector = new ContextCollector();

    this._onMatch = e => {
      const beforeLines = this._ringBuffer.tail(e.rule.contextBefore ?? 0);
      this.collector.stage(e, beforeLines);
    };

    this.engine.on('match', this._onMatch);
    this.collector.on('ready', alert => this.buffer.ingest(alert));
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
    if (this._watchers.has(watcher)) return this;

    const onLine = e => {
      this._ringBuffer.push(e);
      this.engine.evaluate(e);
      this.collector.collectLine(e);
    };

    this._watchers.add(watcher);
    this._watcherHandlers.set(watcher, onLine);
    watcher.on('line', onLine);
    return this;
  }

  stop() {
    this.buffer.stopCleanup();
  }

  swapRules(newRules) {
    const maxBefore = Math.max(0, ...newRules.map(r => r.contextBefore ?? 0));
    this._ringBuffer = new LineRingBuffer(maxBefore + 1);

    const newEngine    = new RuleEngine(newRules);
    const newCollector = new ContextCollector();
    const oldEngine    = this.engine;

    this.engine    = newEngine;
    this.collector = newCollector;

    oldEngine.off('match', this._onMatch);
    this._onMatch = e => {
      const beforeLines = this._ringBuffer.tail(e.rule.contextBefore ?? 0);
      this.collector.stage(e, beforeLines);
    };
    this.engine.on('match', this._onMatch);
    this.collector.on('ready', alert => this.buffer.ingest(alert));

    for (const watcher of this._watchers) {
      const old = this._watcherHandlers.get(watcher);
      if (old) watcher.off('line', old);

      const next = e => {
        this._ringBuffer.push(e);
        this.engine.evaluate(e);
        this.collector.collectLine(e);
      };
      this._watcherHandlers.set(watcher, next);
      watcher.on('line', next);
    }
  }
}
