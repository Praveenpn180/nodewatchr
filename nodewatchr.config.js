// nodewatchr.config.js
export default {
  rules: [
    {
      name: 'oom-killer',
      match: /JavaScript heap out of memory/,
      threshold: { count: 1, windowMs: 1_000 },
      // Rule-level template overrides per adapter type
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
      // Adapter-level default for all rules without a specific override
      template: '🚨 *{{ruleName}}* ({{count}} hits)\n`{{line}}`\n_{{timestamp}}_',
    }
  ]
}