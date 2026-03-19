// src/adapters/SlackAdapter.js
import { BaseAdapter } from './BaseAdapter.js';

export class SlackAdapter extends BaseAdapter {
  async send(alert) {
    const { rule, line, timestamp, count } = alert;

    const res = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `🚨 ${rule.name}` },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Matches:*\n${count}` },
              { type: 'mrkdwn', text: `*Time:*\n${this.formatTimestamp(timestamp)}` },
            ],
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Line:*\n\`\`\`${line.slice(0, 500)}\`\`\`` },
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Slack webhook error ${res.status}`);
  }
}