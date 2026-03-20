import { BaseAdapter } from './BaseAdapter.js';
import { TemplateEngine } from './TemplateEngine.js';

export class WebhookAdapter extends BaseAdapter {
  async send(alert) {
    const contentType = this.config.contentType ?? 'application/json';
    const headers = {
      'Content-Type': contentType,
      ...(this.config.headers ?? {}),
    };

    const body = this.config.bodyTemplate
      ? new TemplateEngine(this.config.bodyTemplate).render(alert)
      : JSON.stringify({
          ruleName: alert.rule.name,
          severity: alert.rule.severity ?? 'warning',
          line: alert.line,
          count: alert.count,
          fingerprint: alert.fingerprint,
          timestamp: new Date(alert.timestamp).toISOString(),
          contextLines: alert.contextLines ?? [],
        });

    const response = await fetch(this.config.url, {
      method: this.config.method ?? 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`Webhook adapter error ${response.status}`);
    }
  }
}
