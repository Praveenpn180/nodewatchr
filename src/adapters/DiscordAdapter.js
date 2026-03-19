// src/adapters/DiscordAdapter.js
import { BaseAdapter } from './BaseAdapter.js';

const SEVERITY_COLORS = { critical: 0xE24B4A, warning: 0xEF9F27, info: 0x378ADD };

export class DiscordAdapter extends BaseAdapter {
  async send(alert) {
    const { rule, line, timestamp, count } = alert;
    const color = SEVERITY_COLORS[rule.severity] ?? SEVERITY_COLORS.warning;

    const res = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `🚨 ${rule.name}`,
          color,
          fields: [
            { name: 'Matches', value: String(count), inline: true },
            { name: 'Time', value: this.formatTimestamp(timestamp), inline: true },
            { name: 'Line', value: `\`\`\`${line.slice(0, 1000)}\`\`\`` },
          ],
          footer: { text: 'alertengine-js' },
          timestamp: new Date(timestamp).toISOString(),
        }],
      }),
    });

    if (!res.ok) throw new Error(`Discord webhook error ${res.status}`);
  }
}