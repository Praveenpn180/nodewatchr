// src/adapters/TelegramAdapter.js
import { BaseAdapter } from './BaseAdapter.js';

export class TelegramAdapter extends BaseAdapter {
  async send(alert) {
    const text = this.formatText(alert);   // ← use template engine, handles overrides

    const res = await fetch(
      `https://api.telegram.org/bot${this.config.token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: this._escape(text),
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

  _escape(str) {
    return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}