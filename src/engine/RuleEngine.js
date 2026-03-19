import { EventEmitter } from 'events';

export class RuleEngine extends EventEmitter {
  constructor(rules) {
    super();

    for (const rule of rules) {
      if (!(rule.match instanceof RegExp)) {
        throw new TypeError(
          `Rule "${rule.name}": match must be a RegExp. ` +
          `Got ${typeof rule.match}. Use ConfigLoader to load rules from config files.`
        );
      }

      if (rule.threshold && rule.rateThreshold) {
        throw new TypeError(
          `Rule "${rule.name}": cannot set both threshold and rateThreshold.`
        );
      }
    }

    this.rules = rules;
    this._thresholdWindows = new Map(
      rules.filter(rule => rule.threshold).map(rule => [rule.name, []])
    );
    this._rateWindows = new Map(
      rules.filter(rule => rule.rateThreshold).map(rule => [rule.name, []])
    );
  }

  evaluate({ line, timestamp }) {
    for (const rule of this.rules) {
      rule.match.lastIndex = 0;

      if (!rule.match.test(line)) {
        continue;
      }

      if (rule.rateThreshold) {
        this._evaluateRate(rule, line, timestamp);
        continue;
      }

      if (rule.threshold) {
        this._evaluateThreshold(rule, line, timestamp);
        continue;
      }

      this.emit('match', { rule, line, timestamp, count: 1 });
    }
  }

  _evaluateThreshold(rule, line, timestamp) {
    const { count: limit, windowMs } = rule.threshold;
    const window = this._thresholdWindows.get(rule.name);

    window.push(timestamp);

    const cutoff = timestamp - windowMs;
    while (window.length && window[0] < cutoff) {
      window.shift();
    }

    if (window.length >= limit) {
      this.emit('match', {
        rule,
        line,
        timestamp,
        count: window.length,
      });

      if (rule.resetOnFire !== false) {
        window.length = 0;
      }
    }
  }

  _evaluateRate(rule, line, timestamp) {
    const window = this._rateWindows.get(rule.name);
    const { shortWindowMs, longWindowMs, multiplier } = rule.rateThreshold;

    window.push(timestamp);

    const longCutoff = timestamp - longWindowMs;
    const shortCutoff = timestamp - shortWindowMs;

    while (window.length && window[0] < longCutoff) {
      window.shift();
    }

    if (window.length > 5_000) {
      window.splice(0, window.length - 5_000);
    }

    const shortCount = window.filter(t => t >= shortCutoff).length;
    const longCount = window.length;
    const shortRate = shortCount / shortWindowMs;
    const longRate = longCount / longWindowMs;

    if (longRate > 0 && shortRate >= longRate * multiplier) {
      this.emit('match', { rule, line, timestamp, count: shortCount });

      if (rule.resetOnFire !== false) {
        window.length = 0;
      }
    }
  }
}
