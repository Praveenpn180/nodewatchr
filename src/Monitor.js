// src/Monitor.js
import { EventEmitter }     from 'events';
import { Dispatcher }       from './adapters/Dispatcher.js';
import { resolveAdapters }  from './adapters/AdapterRegistry.js';
import { AlertBuffer }      from './engine/AlertBuffer.js';
import { RuleEngine }       from './engine/RuleEngine.js';
import { LineRingBuffer }   from './engine/LineRingBuffer.js';
import { ContextCollector } from './engine/ContextCollector.js';

export class Monitor extends EventEmitter {
  constructor({ rules, adapters: adapterConfigs, dispatcher: dispatcherOptions = {} }) {
    super();
    this._adapterConfigs    = adapterConfigs;
    this._dispatcherOptions = dispatcherOptions;
    this._watchers          = new Set();
    this._watcherHandlers   = new Map();

    this._maxContextBefore   = Math.max(0, ...rules.map(r => r.contextBefore ?? 0));
    this._ringBuffer         = new LineRingBuffer(this._maxContextBefore + 1);
    this._currentBeforeLines = [];

    this.buffer    = new AlertBuffer();
    this.engine    = new RuleEngine(rules);
    this.collector = new ContextCollector();

    // _onMatch reads this._currentBeforeLines which is snapshotted in onLine
    // BEFORE the current line is pushed to the ring buffer, so the match line
    // itself is never included in its own before-context.
    this._onMatch = e => {
      const n           = e.rule.contextBefore ?? 0;
      const beforeLines = n > 0 ? this._currentBeforeLines.slice(-n) : [];
      this.collector.stage(e, beforeLines);
    };

    this.engine.on('match', this._onMatch);
    this.collector.on('ready', alert => this.buffer.ingest(alert));
    this.buffer.on('alert',   alert => this._onAlert(alert));
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
      // Correct ordering — all four steps matter:
      //
      // 1. collectLine first: lines arriving after a previous match are fed
      //    to that match's pending after-context before any new match can
      //    be staged by step 4.
      //
      // 2. Snapshot before pushing: _onMatch will read this snapshot, so the
      //    current line is never included in its own before-context.
      //
      // 3. Push current line: makes it available as before-context for future
      //    matches.
      //
      // 4. Evaluate: may fire 'match' which calls _onMatch → reads snapshot.

      this.collector.collectLine(e);                                    // 1
      this._currentBeforeLines = this._ringBuffer.tail(               // 2
        this._maxContextBefore
      );
      this._ringBuffer.push(e);                                         // 3
      this.engine.evaluate(e);                                          // 4
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
    this._maxContextBefore   = Math.max(0, ...newRules.map(r => r.contextBefore ?? 0));
    this._ringBuffer         = new LineRingBuffer(this._maxContextBefore + 1);
    this._currentBeforeLines = [];

    const newEngine    = new RuleEngine(newRules);
    const newCollector = new ContextCollector();
    const oldEngine    = this.engine;

    this.engine    = newEngine;
    this.collector = newCollector;

    oldEngine.off('match', this._onMatch);
    this._onMatch = e => {
      const n           = e.rule.contextBefore ?? 0;
      const beforeLines = n > 0 ? this._currentBeforeLines.slice(-n) : [];
      this.collector.stage(e, beforeLines);
    };
    this.engine.on('match', this._onMatch);
    this.collector.on('ready', alert => this.buffer.ingest(alert));

    for (const watcher of this._watchers) {
      const old = this._watcherHandlers.get(watcher);
      if (old) watcher.off('line', old);

      const next = e => {
        this.collector.collectLine(e);
        this._currentBeforeLines = this._ringBuffer.tail(this._maxContextBefore);
        this._ringBuffer.push(e);
        this.engine.evaluate(e);
      };
      this._watcherHandlers.set(watcher, next);
      watcher.on('line', next);
    }
  }
}
