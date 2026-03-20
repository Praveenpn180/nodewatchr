// src/engine/ContextCollector.js
import { EventEmitter } from 'events';

export class ContextCollector extends EventEmitter {
  constructor() {
    super();
    this._pending = new Map();
  }

  collectLine(lineEntry) {
    for (const [key, pending] of this._pending) {
      pending.afterLines.push(lineEntry);
      if (pending.afterLines.length >= pending.contextAfter) {
        this._pending.delete(key);
        this.emit('ready', this._buildAlert(pending));
      }
    }
  }

  stage(matchEvent, beforeLines) {
    const { rule, line, timestamp, count } = matchEvent;
    const contextAfter = rule.contextAfter ?? 0;

    const contextLines = [
      ...beforeLines.map(e => ({ ...e, role: 'before' })),
      { line, timestamp, role: 'match' },
    ];

    if (contextAfter === 0) {
      this.emit('ready', { rule, line, timestamp, count, contextLines });
      return;
    }

    const key = `${rule.name}:${timestamp}`;
    this._pending.set(key, {
      rule, line, timestamp, count,
      contextLines,
      afterLines: [],
      contextAfter,
    });
  }

  _buildAlert({ rule, line, timestamp, count, contextLines, afterLines }) {
    return {
      rule, line, timestamp, count,
      contextLines: [
        ...contextLines,
        ...afterLines.map(e => ({ ...e, role: 'after' })),
      ],
    };
  }
}
