// src/adapters/TemplateEngine.js
const BUILT_IN_TOKENS = {
  '{{ruleName}}':   a => a.rule.name,
  '{{line}}':       a => a.line,
  '{{count}}':      a => String(a.count),
  '{{fingerprint}}':a => a.fingerprint,
  '{{timestamp}}':  a => new Date(a.timestamp).toISOString(),
  '{{severity}}':   a => a.rule.severity ?? 'warning',
  '{{env}}':        _  => process.env.NODE_ENV ?? 'unknown',
  '{{hostname}}':   _  => new URL('file:///' + process.env.HOSTNAME ?? 'unknown').hostname,
};

export class TemplateEngine {
  constructor(template) {
    if (typeof template !== 'string') {
      throw new TypeError('Template must be a string');
    }
    this.template = template;
  }

  render(alert) {
    return Object.entries(BUILT_IN_TOKENS).reduce(
      (str, [token, fn]) => str.replaceAll(token, fn(alert)),
      this.template
    );
  }

  static default() {
    return new TemplateEngine(
      '[nodewatchr] {{ruleName}}\n' +
      'Severity: {{severity}} | Matches: {{count}} | Time: {{timestamp}}\n' +
      'Line: {{line}}'
    );
  }
}