import { describe, it, expect, vi } from 'vitest';
import { ContextCollector } from '../../src/engine/ContextCollector.js';

const rule = (contextAfter = 0) => ({
  name: 'test-rule',
  severity: 'warning',
  contextAfter,
  contextBefore: 0,
  cooldownMs: 0,
});

describe('ContextCollector', () => {
  it('emits ready immediately when contextAfter is 0', () => {
    const col  = new ContextCollector();
    const cb   = vi.fn();
    col.on('ready', cb);

    col.stage({ rule: rule(0), line: 'MATCH', timestamp: 1, count: 1 }, []);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].contextLines).toHaveLength(1);
    expect(cb.mock.calls[0][0].contextLines[0].role).toBe('match');
  });

  it('waits for contextAfter lines before emitting', () => {
    const col = new ContextCollector();
    const cb  = vi.fn();
    col.on('ready', cb);

    const before = [{ line: 'B1', timestamp: 0 }];
    col.stage({ rule: rule(2), line: 'MATCH', timestamp: 1, count: 1 }, before);
    expect(cb).not.toHaveBeenCalled();

    col.collectLine({ line: 'A1', timestamp: 2 });
    expect(cb).not.toHaveBeenCalled();

    col.collectLine({ line: 'A2', timestamp: 3 });
    expect(cb).toHaveBeenCalledOnce();

    const { contextLines } = cb.mock.calls[0][0];
    expect(contextLines.map(c => c.role)).toEqual(['before', 'match', 'after', 'after']);
    expect(contextLines.map(c => c.line)).toEqual(['B1', 'MATCH', 'A1', 'A2']);
  });
});
