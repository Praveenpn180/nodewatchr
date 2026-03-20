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

  tail(n) {
    return this._buf.slice(-n);
  }
}
