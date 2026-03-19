// src/engine/AlertBuffer.js
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class AlertBuffer extends EventEmitter {
  constructor() {
    super();
    // fingerprint → timestamp of last fired alert
    this._cooldowns = new Map();
  }

  ingest({ rule, line, timestamp, count }) {
    const fingerprint = this._fingerprint(rule.name, line);
    const lastFired = this._cooldowns.get(fingerprint) ?? 0;
    const cooldown = rule.cooldownMs ?? 60_000;

    if (timestamp - lastFired < cooldown) return; // still cooling down

    this._cooldowns.set(fingerprint, timestamp);
    this.emit('alert', { rule, line, timestamp, count, fingerprint });
  }

  _fingerprint(ruleName, line) {
    // Scrub common volatile tokens before hashing
    const scrubbed = line
      .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, '<ts>')
      .replace(/\b[0-9a-f-]{8,}\b/gi, '<id>') // UUIDs and hex IDs
      .replace(/\/([\w-]+\/){2,}/g, '/<path>/') // long URL paths
      .replace(/:\d{4,5}\b/g, ':<port>') // port numbers
      .replace(/\b\d{10,}\b/g, '<n>');  // only very long numbers (epoch timestamps, etc.)

    return createHash('sha1')
      .update(ruleName + ':' + scrubbed)
      .digest('hex')
      .slice(0, 16);
  }

  startCleanup(intervalMs = 600_000) {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [fp, lastFired] of this._cooldowns) {
        // Safe to delete once we're well past any rule's cooldown window
        if (now - lastFired > 3_600_000) this._cooldowns.delete(fp);
      }
    }, intervalMs);
    this._cleanupTimer.unref(); // don't keep the process alive
  }

  stopCleanup() {
    clearInterval(this._cleanupTimer);
  }
}
