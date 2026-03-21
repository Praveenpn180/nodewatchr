// src/Monitor.js
import { EventEmitter } from 'events';
import { Dispatcher } from './adapters/Dispatcher.js';
import { resolveAdapters } from './adapters/AdapterRegistry.js';
import { AlertBuffer } from './engine/AlertBuffer.js';
import { RuleEngine } from './engine/RuleEngine.js';
import { LineRingBuffer } from './engine/LineRingBuffer.js';
import { ContextCollector } from './engine/ContextCollector.js';
import { createStorageSink } from './storage/StorageAdapterRegistry.js';

export class Monitor extends EventEmitter {
  constructor({
    rules,
    adapters: adapterConfigs = [],
    dispatcher: dispatcherOptions = {},
    storage,
    storageSink = null,
  }) {
    super();
    this._adapterConfigs = adapterConfigs;
    this._dispatcherOptions = dispatcherOptions;
    this._storageConfig = storage;
    this._watchers = new Set();
    this._watcherHandlers = new Map();
    this.storageSink = storageSink;

    this.buffer = new AlertBuffer();
    this._applyRuleSet(rules);
    this.buffer.on('alert', alert => this._onAlert(alert));
  }

  async _onAlert(alert) {
    this.emit('alert', alert);
    this.storageSink?.push(alert);
    await this.dispatcher?.dispatch(alert);
  }

  async start() {
    if (!this.dispatcher) {
      this.dispatcher = await this._createDispatcher(this._adapterConfigs);
    }

    if (!this.storageSink && this._storageConfig) {
      this.storageSink = await createStorageSink(this._storageConfig);
    }

    this.buffer.startCleanup();
    return this;
  }

  attachWatcher(watcher) {
    if (this._watchers.has(watcher)) return this;

    const onLine = entry => this._processLine(entry);
    this._watchers.add(watcher);
    this._watcherHandlers.set(watcher, onLine);
    watcher.on('line', onLine);
    return this;
  }

  async stop() {
    this.buffer.stopCleanup();
    await this.storageSink?.stop();
  }

  async reconfigure({
    rules = this.engine.rules,
    adapters = this._adapterConfigs,
    storage = this._storageConfig,
  }) {
    const nextDispatcher = await this._createDispatcher(adapters);
    const nextStorageSink = storage
      ? await createStorageSink(storage)
      : null;
    const previousStorageSink = this.storageSink;

    this._adapterConfigs = adapters;
    this._storageConfig = storage;
    this.dispatcher = nextDispatcher;
    this.storageSink = nextStorageSink;
    this._applyRuleSet(rules);

    await previousStorageSink?.stop();
    return this;
  }

  async swapRules(newRules) {
    return this.reconfigure({ rules: newRules });
  }

  async _createDispatcher(adapterConfigs) {
    const adapters = await resolveAdapters(adapterConfigs);
    return new Dispatcher(adapters, this._dispatcherOptions);
  }

  _applyRuleSet(rules) {
    this._maxContextBefore = Math.max(0, ...rules.map(rule => rule.contextBefore ?? 0));
    this._ringBuffer = new LineRingBuffer(this._maxContextBefore + 1);
    this._currentBeforeLines = [];

    const nextEngine = new RuleEngine(rules);
    const nextCollector = new ContextCollector();
    const previousEngine = this.engine;

    this.engine = nextEngine;
    this.collector = nextCollector;

    if (previousEngine && this._onMatch) {
      previousEngine.off('match', this._onMatch);
    }

    // Snapshot is taken before the current line is pushed, so the match line
    // never leaks into its own before-context.
    this._onMatch = event => {
      const count = event.rule.contextBefore ?? 0;
      const beforeLines = count > 0 ? this._currentBeforeLines.slice(-count) : [];
      this.collector.stage(event, beforeLines);
    };

    this.engine.on('match', this._onMatch);
    this.collector.on('ready', alert => this.buffer.ingest(alert));

    for (const watcher of this._watchers) {
      const oldHandler = this._watcherHandlers.get(watcher);
      if (oldHandler) watcher.off('line', oldHandler);

      const nextHandler = entry => this._processLine(entry);
      this._watcherHandlers.set(watcher, nextHandler);
      watcher.on('line', nextHandler);
    }
  }

  _processLine(entry) {
    this.collector.collectLine(entry);
    this._currentBeforeLines = this._ringBuffer.tail(this._maxContextBefore);
    this._ringBuffer.push(entry);
    this.engine.evaluate(entry);
  }
}
