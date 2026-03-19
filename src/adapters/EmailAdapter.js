// src/adapters/EmailAdapter.js
import nodemailer from 'nodemailer';
import { BaseAdapter } from './BaseAdapter.js';

export class EmailAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    // Transport is created once — reused across all sends
    this._transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(alert) {
    const { rule, count } = alert;

    await this._transport.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: `[alertengine-js] ${rule.name} — ${count} match${count > 1 ? 'es' : ''}`,
      text: this.formatText(alert),
      html: this._html(alert),
    });
  }

  _html({ rule, line, timestamp, count }) {
    return `
      <h2 style="color:#E24B4A">🚨 ${rule.name}</h2>
      <table>
        <tr><td><b>Matches</b></td><td>${count}</td></tr>
        <tr><td><b>Time</b></td><td>${this.formatTimestamp(timestamp)}</td></tr>
      </table>
      <pre style="background:#f5f5f5;padding:12px">${line}</pre>
    `;
  }
}
