export default {
  watchers: [
    { type: 'file', path: './test.log' }
  ],
  rules: [
    {
      name: 'error-detected',
      match: /ERROR|FATAL/i,
      cooldownMs: 5000,
    },
    {
      name: 'oom-killer',
      match: /JavaScript heap out of memory/,
      threshold: { count: 1, windowMs: 1_000 },
      templates: {
        telegram: '💀 *OOM on {{hostname}}*\n`{{line}}`',
        slack:    ':skull: OOM detected on `{{hostname}}` at {{timestamp}}',
      }
    }
  ],
  adapters: [
    {
      type: 'telegram',
      token: process.env.TG_TOKEN,
      chatId: process.env.TG_CHAT_ID,
      template: '🚨 *{{ruleName}}* ({{count}} hits)\n`{{line}}`\n_{{timestamp}}_',
    }
  ]
}