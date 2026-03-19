// src/adapters/TelegramAdapter.js
import { BaseAdapter } from './BaseAdapter.js';

export class TelegramAdapter extends BaseAdapter {
  async send(alert) {
    const { rule, line, timestamp, count } = alert;
    const text = [
      `🚨 *${this._escape(rule.name)}*`,
      `\`${this._escape(line.slice(0, 300))}\``,  // cap line length
      `*Matches:* ${count}  |  *Time:* ${this.formatTimestamp(timestamp)}`,
    ].join('\n');

    const res = await fetch(
      `https://api.telegram.org/bot${this.config.token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: 'MarkdownV2',
          ...(this.config.threadId && { message_thread_id: this.config.threadId }),
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram API error ${res.status}: ${body}`);
    }
  }

  // MarkdownV2 requires escaping these characters
  _escape(str) {
    return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}