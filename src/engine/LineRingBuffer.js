// src/engine/LineRingBuffer.js
export class LineRingBuffer {
  constructor(capacity = 10) {
    this._capacity = capacity;
    this._buf = [];
  }

  push(entry) {
    this._buf.push(entry);
    if (this._buf.length > this._capacity) {
      this._buf.shift();
    }
  }

  // slice(-0) === slice(0) in JS — returns the whole array.
  // Guard explicitly so tail(0) always returns [].
  tail(n) {
    if (n <= 0) return [];
    return this._buf.slice(-n);
  }
}
