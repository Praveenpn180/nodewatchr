import { createHash } from 'crypto';
import { EventEmitter } from 'events';

export class AlertBuffer extends EventEmitter {
  constructor() {
    super();
    this._cooldowns = new Map();
  }

  ingest({ rule, line, timestamp, count }) {
    const fingerprint = this._fingerprint(rule.name, line);
    const cooldownKey = rule.name;
    const lastFired = this._cooldowns.get(cooldownKey) ?? 0;
    const cooldown = rule.cooldownMs ?? 60_000;

    if (timestamp - lastFired < cooldown) {
      return;
    }

    this._cooldowns.set(cooldownKey, timestamp);
    this.emit('alert', { rule, line, timestamp, count, fingerprint });
  }

  _fingerprint(ruleName, line) {
    const scrubbed = line
      .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, '<ts>')
      .replace(/\b[0-9a-f-]{8,}\b/gi, '<id>')
      .replace(/\/([\w-]+\/){2,}/g, '/<path>/')
      .replace(/:\d{4,5}\b/g, ':<port>')
      .replace(/\b\d{10,}\b/g, '<n>');

    return createHash('sha1')
      .update(ruleName + ':' + scrubbed)
      .digest('hex')
      .slice(0, 16);
  }

  startCleanup(intervalMs = 600_000) {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [key, lastFired] of this._cooldowns) {
        if (now - lastFired > 3_600_000) {
          this._cooldowns.delete(key);
        }
      }
    }, intervalMs);

    this._cleanupTimer.unref();
  }

  stopCleanup() {
    clearInterval(this._cleanupTimer);
  }
}
