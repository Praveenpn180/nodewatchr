import { describe, it, expect } from 'vitest';
import { LineRingBuffer } from '../../src/engine/LineRingBuffer.js';

describe('LineRingBuffer', () => {
  it('keeps at most capacity entries', () => {
    const buf = new LineRingBuffer(3);
    for (let i = 0; i < 5; i++) buf.push({ line: `L${i}`, timestamp: i });
    expect(buf.tail(10)).toHaveLength(3);
    expect(buf.tail(10).map(e => e.line)).toEqual(['L2', 'L3', 'L4']);
  });

  it('tail(n) returns last n entries', () => {
    const buf = new LineRingBuffer(10);
    for (let i = 0; i < 6; i++) buf.push({ line: `L${i}`, timestamp: i });
    expect(buf.tail(2).map(e => e.line)).toEqual(['L4', 'L5']);
  });

  it('tail(0) returns empty array', () => {
    const buf = new LineRingBuffer(10);
    buf.push({ line: 'x', timestamp: 1 });
    expect(buf.tail(0)).toEqual([]);
  });
});
