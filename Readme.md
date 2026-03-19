# alertengine-js

> Configurable log monitoring and alerting for Node.js applications.

Watch `stdout`, `stderr`, or log files and fire alerts to **Telegram**, **Slack**, **Discord**, or **Email** when configurable rules are triggered — with zero build step required.

[![CI](https://github.com/Praveenpn180/nodewatchr/actions/workflows/ci.yml/badge.svg)](https://github.com/Praveenpn180/nodewatchr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/alertengine-js)](https://www.npmjs.com/package/alertengine-js)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Table of contents

- [Features](#features)
- [Install](#install)
- [Quickstart](#quickstart)
- [How it works](#how-it-works)
- [Config reference](#config-reference)
  - [Watchers](#watchers)
  - [Rules](#rules)
  - [Adapters](#adapters)
- [Notification adapters](#notification-adapters)
  - [Telegram](#telegram)
  - [Slack](#slack)
  - [Discord](#discord)
  - [Email](#email)
  - [Custom adapters](#custom-adapters)
- [Alert templating](#alert-templating)
- [CLI usage](#cli-usage)
- [Programmatic usage](#programmatic-usage)
- [Examples](#examples)
  - [Express](#express)
  - [Fastify](#fastify)
  - [Next.js](#nextjs)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **File and stream watching** — tail log files or attach to any Node.js `Readable` stream
- **Three rule types** — regex match, threshold counting, and rate-spike detection
- **Alert deduplication** — fingerprints alerts to suppress noise and prevent storm conditions
- **Per-rule cooldowns** — configurable silence windows after an alert fires
- **Four built-in adapters** — Telegram, Slack, Discord, and Email (SMTP)
- **Custom adapter support** — install any `alertengine-js-*` adapter from npm
- **Alert templating** — per-rule, per-adapter message templates with token substitution
- **Hot config reload** — edit rules without restarting the process
- **Dead-letter logging** — failed alerts written to disk for replay
- **Zero build step** — pure ESM, runs directly on Node.js 18+

---

## Install

```bash
# pnpm
pnpm add alertengine-js

# npm
npm install alertengine-js

# yarn
yarn add alertengine-js
```

---

## Quickstart

**1. Copy the example config:**

```bash
cp alertengine-js.config.example.js alertengine-js.config.js
```

**2. Set your notification credentials as environment variables:**

```bash
# Telegram (see "Telegram setup" below for how to get these)
export TG_TOKEN=your_bot_token
export TG_CHAT_ID=your_chat_id
```

**3. Create a log file to watch:**

```bash
touch test.log
```

**4. Run:**

```bash
npx alertengine-js --config ./alertengine-js.config.js
```

**5. Trigger a test alert in a second terminal:**

```bash
echo "ERROR Something broke in production" >> test.log
```

You should receive a Telegram message within 1–2 seconds.

---

## How it works

```
Log source          Rule engine         Alert buffer        Dispatcher
──────────          ───────────         ────────────        ──────────
stdout/stderr  →    regex match    →    fingerprint    →    Telegram
log files      →    threshold      →    deduplication  →    Slack
custom stream  →    rate spike     →    cooldown       →    Discord
                                                        →    Email
                                                        →    Custom
```

Every line emitted by a watcher is evaluated against all configured rules. If a rule matches and the alert buffer allows it through (deduplication + cooldown check), the dispatcher calls all configured adapters in parallel. A failing adapter never blocks the others — errors are retried with exponential backoff and written to a dead-letter log on disk.

---

## Config reference

Create a `alertengine-js.config.js` file (or `.json`) in your project root:

```js
// alertengine-js.config.js
export default {
  watchers: [ ... ],
  rules:    [ ... ],
  adapters: [ ... ],
}
```

### Watchers

Define what to monitor. At least one watcher is required.

```js
watchers: [
  // Watch a log file (tails from current end — does not replay old lines)
  { type: 'file', path: '/var/log/app.log' },

  // Watch a Node.js stream (e.g. a child process's stdout)
  { type: 'stream', source: childProcess.stdout },
]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `'file'` \| `'stream'` | ✅ | Watcher type |
| `path` | `string` | If `type: 'file'` | Absolute or relative path to the log file |
| `source` | `Readable` | If `type: 'stream'` | Any Node.js readable stream |

---

### Rules

Rules define what patterns to look for and when to fire.

```js
rules: [
  {
    name: 'error-spike',
    match: /ERROR|FATAL/i,
    threshold: { count: 5, windowMs: 60_000 },
    cooldownMs: 300_000,
    severity: 'critical',
  }
]
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | `string` | ✅ | — | Unique rule identifier — used in alert messages and templates |
| `match` | `RegExp` \| `string` | ✅ | — | Pattern to test against each log line. Strings are converted to `RegExp` |
| `threshold` | `object` | — | — | Fire only after N matches within a time window (see below) |
| `rateThreshold` | `object` | — | — | Fire on sudden rate spikes relative to a rolling baseline (see below) |
| `cooldownMs` | `number` | — | `60000` | Minimum milliseconds between alerts for the same rule |
| `severity` | `'critical'` \| `'warning'` \| `'info'` | — | `'warning'` | Passed through to templates and adapters |
| `resetOnFire` | `boolean` | — | `true` | Clear the match window after firing. Set `false` for sustained-incident detection |
| `templates` | `object` | — | — | Per-adapter message template overrides (see [Alert templating](#alert-templating)) |

> **Note:** `threshold` and `rateThreshold` are mutually exclusive. Using both on the same rule throws a validation error at startup.

#### Threshold config

Fire after N matching lines occur within a sliding time window:

```js
threshold: {
  count:    5,      // number of matches required
  windowMs: 60_000, // sliding window size in milliseconds
}
```

#### Rate threshold config

Fire when the short-term match rate spikes above a multiple of the rolling baseline:

```js
rateThreshold: {
  shortWindowMs: 5_000,    // measure rate over last 5 seconds
  longWindowMs:  300_000,  // compare against 5-minute baseline
  multiplier:    10,        // fire if short rate ≥ 10× baseline rate
}
```

---

### Adapters

At least one adapter is required. Multiple adapters run in parallel — a failure in one does not affect others.

```js
adapters: [
  { type: 'telegram', token: process.env.TG_TOKEN, chatId: process.env.TG_CHAT_ID },
  { type: 'slack',    webhookUrl: process.env.SLACK_WEBHOOK },
]
```

See [Notification adapters](#notification-adapters) for per-adapter config fields.

---

## Notification adapters

### Telegram

The simplest adapter to set up — no OAuth, just a bot token and a chat ID.

**Setup (5 minutes):**

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow the prompts
3. Copy the token BotFather gives you → `TG_TOKEN`
4. Start a conversation with your new bot (send any message)
5. Open `https://api.telegram.org/botYOUR_TOKEN/getUpdates` in your browser
6. Find `"id"` inside the `"chat"` object → `TG_CHAT_ID`

```js
{
  type:     'telegram',
  token:    process.env.TG_TOKEN,   // required
  chatId:   process.env.TG_CHAT_ID, // required
  threadId: '12345',                // optional — for topic-based supergroups
  template: '🚨 *{{ruleName}}*\n`{{line}}`\n_{{timestamp}}_', // optional
}
```

| Field | Required | Description |
|---|---|---|
| `token` | ✅ | Bot API token from @BotFather |
| `chatId` | ✅ | Chat or channel ID to send messages to |
| `threadId` | — | Message thread ID for topic-based supergroups |
| `template` | — | Custom message template (MarkdownV2 formatting) |

---

### Slack

Uses [Incoming Webhooks](https://api.slack.com/messaging/webhooks) — no OAuth flow required.

**Setup:**

1. Go to `api.slack.com/apps` → Create New App → From scratch
2. Enable **Incoming Webhooks** and add a webhook to your workspace
3. Copy the webhook URL → `SLACK_WEBHOOK`

```js
{
  type:       'slack',
  webhookUrl: process.env.SLACK_WEBHOOK, // required
  template:   ':rotating_light: *{{ruleName}}* — {{count}} matches', // optional
}
```

---

### Discord

Uses [Discord webhooks](https://discord.com/developers/docs/resources/webhook) — available on any channel.

**Setup:**

1. Open Discord → Channel Settings → Integrations → Webhooks → New Webhook
2. Copy the webhook URL → `DISCORD_WEBHOOK`

```js
{
  type:       'discord',
  webhookUrl: process.env.DISCORD_WEBHOOK, // required
  template:   '🚨 **{{ruleName}}** — {{count}} matches at {{timestamp}}', // optional
}
```

Alert embeds are automatically colour-coded by severity: red for `critical`, amber for `warning`, blue for `info`.

---

### Email

Uses [nodemailer](https://nodemailer.com) — works with any SMTP provider (Gmail, AWS SES, Mailgun, Postmark, etc.).

```js
{
  type:     'email',
  host:     process.env.SMTP_HOST,  // e.g. 'smtp.gmail.com'
  port:     587,
  user:     process.env.SMTP_USER,
  pass:     process.env.SMTP_PASS,
  from:     'alerts@yourapp.com',
  to:       'oncall@yourteam.com',  // comma-separated for multiple recipients
}
```

| Field | Required | Description |
|---|---|---|
| `host` | ✅ | SMTP server hostname |
| `port` | ✅ | SMTP port (`587` for TLS, `465` for SSL, `25` for plain) |
| `user` | ✅ | SMTP username |
| `pass` | ✅ | SMTP password or app-specific password |
| `from` | ✅ | Sender address |
| `to` | ✅ | Recipient address(es) — comma-separated string |

---

### Custom adapters

Any npm package that exports a class extending `BaseAdapter` can be used as an adapter. Name your package `alertengine-js-*` for discoverability.

**Installing a custom adapter:**

```bash
pnpm add nodewatchr-pagerduty
```

```js
// alertengine-js.config.js
adapters: [
  { type: 'nodewatchr-pagerduty', routingKey: process.env.PD_KEY }
]
```

**Building your own:**

```js
// my-adapter/index.js
import { BaseAdapter } from 'alertengine-js/adapters/base';

export default class MyAdapter extends BaseAdapter {
  async send(alert) {
    const message = this.formatText(alert); // uses template engine
    await myNotificationService.send(message);
  }
}
```

The `send(alert)` method receives an alert object with these fields:

| Field | Type | Description |
|---|---|---|
| `rule` | `object` | The rule that fired (includes `name`, `severity`, `templates`, etc.) |
| `line` | `string` | The matched log line |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `count` | `number` | Number of matches in the window |
| `fingerprint` | `string` | 16-character deduplication hash |

---

## Alert templating

Every adapter uses a default message template. You can override it at three levels — from lowest to highest priority:

**1. Global default** (built into the module):
```
[nodewatchr] {{ruleName}}
Severity: {{severity}} | Matches: {{count}} | Time: {{timestamp}}
Line: {{line}}
```

**2. Adapter-level template** (applies to all rules for that adapter):
```js
adapters: [
  {
    type: 'telegram',
    token: process.env.TG_TOKEN,
    chatId: process.env.TG_CHAT_ID,
    template: '🚨 *{{ruleName}}* ({{count}} hits)\n`{{line}}`\n_{{timestamp}}_',
  }
]
```

**3. Rule-level template** (highest priority — overrides the adapter template for a specific rule):
```js
rules: [
  {
    name: 'oom-killer',
    match: /JavaScript heap out of memory/,
    templates: {
      telegram: '💀 *OOM on {{hostname}}*\n`{{line}}`',
      slack:    ':skull: OOM detected on `{{hostname}}` at {{timestamp}}',
    }
  }
]
```

### Available tokens

| Token | Description |
|---|---|
| `{{ruleName}}` | Name of the rule that fired |
| `{{line}}` | The matched log line |
| `{{count}}` | Number of matches in the window |
| `{{timestamp}}` | ISO 8601 timestamp |
| `{{severity}}` | Rule severity (`critical`, `warning`, `info`) |
| `{{fingerprint}}` | Deduplication hash |
| `{{hostname}}` | Machine hostname (`process.env.HOSTNAME`) |
| `{{env}}` | Node environment (`process.env.NODE_ENV`) |

---

## CLI usage

```bash
npx alertengine-js [options]
```

| Option | Default | Description |
|---|---|---|
| `-c, --config <path>` | `./alertengine-js.config.js` | Path to config file |
| `--no-hot-reload` | — | Disable live config reload on file change |
| `--dead-letter-dir <path>` | `.nodewatchr/failed` | Directory for failed alert logs |
| `-V, --version` | — | Print version number |
| `-h, --help` | — | Print help |

**Examples:**

```bash
# Use a custom config path
npx alertengine-js --config /etc/myapp/alertengine-js.config.js

# Disable hot reload (useful in Docker where inotify may be limited)
npx alertengine-js --no-hot-reload

# Custom dead-letter directory
npx alertengine-js --dead-letter-dir /var/log/nodewatchr/failed
```

**Hot config reload:**

When hot reload is enabled (the default), editing your config file while nodewatchr is running automatically swaps in the new rules without restarting. If the new config fails Zod validation, the error is logged and the previous valid config continues running.

---

## Programmatic usage

You can use nodewatchr as a library inside your own application without the CLI:

```js
import { Monitor, FileWatcher, StreamWatcher, loadConfig } from 'alertengine-js';

// Load and validate config from file
const config = await loadConfig('./alertengine-js.config.js');

// Or construct config inline
const monitor = new Monitor({
  rules: [
    {
      name: 'error-detected',
      match: /ERROR|FATAL/i,
      cooldownMs: 30_000,
    }
  ],
  adapters: [
    { type: 'telegram', token: process.env.TG_TOKEN, chatId: process.env.TG_CHAT_ID }
  ]
});

// Attach one or more watchers
const fileWatcher   = new FileWatcher('/var/log/app.log');
const streamWatcher = new StreamWatcher(process.stderr, { ownsStream: false });

monitor.attachWatcher(fileWatcher);
monitor.attachWatcher(streamWatcher);

// Start everything
await monitor.start();
await fileWatcher.start();
await streamWatcher.start();

// Tap alerts programmatically (optional — adapters still fire regardless)
monitor.on('alert', (alert) => {
  console.log(`[alert] ${alert.rule.name} — ${alert.count} match(es)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  monitor.stop();
  process.exit(0);
});
```

---

## Examples

### Express

Watch a child process's stdout and stderr for errors:

```js
// monitor.js
import { spawn } from 'child_process';
import { Monitor, StreamWatcher } from 'alertengine-js';

const child = spawn('node', ['server.js'], { stdio: ['inherit', 'pipe', 'pipe'] });

const monitor = new Monitor({
  rules: [
    { name: 'unhandled-rejection', match: /UnhandledPromiseRejection/, cooldownMs: 30_000 },
    { name: 'high-latency',        match: /response time \d{4,}ms/,    cooldownMs: 60_000 },
  ],
  adapters: [
    { type: 'telegram', token: process.env.TG_TOKEN, chatId: process.env.TG_CHAT_ID }
  ]
});

monitor.attachWatcher(new StreamWatcher(child.stdout, { ownsStream: false }));
monitor.attachWatcher(new StreamWatcher(child.stderr, { ownsStream: false }));
await monitor.start();
```

### Fastify

Use as a Fastify plugin that taps into the Pino log stream:

```js
// plugins/nodewatchr.js
import fp from 'fastify-plugin';
import { PassThrough } from 'stream';
import { Monitor, StreamWatcher } from 'alertengine-js';

export default fp(async function(fastify, opts) {
  const logStream = new PassThrough();
  const monitor = new Monitor({ rules: opts.rules, adapters: opts.adapters });

  monitor.attachWatcher(new StreamWatcher(logStream, { ownsStream: true }));
  await monitor.start();

  fastify.addHook('onClose', () => monitor.stop());
}, { name: 'nodewatchr' });
```

### Next.js

Use with the [Next.js instrumentation hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation) (Next.js 13.4+):

```js
// instrumentation.js (project root)
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { Monitor, FileWatcher } = await import('alertengine-js');

  const monitor = new Monitor({
    rules: [
      { name: 'build-error', match: /Build error occurred/,      cooldownMs: 0 },
      { name: 'api-crash',   match: /Error: .+ at .*pages\/api/, cooldownMs: 30_000 },
    ],
    adapters: [
      { type: 'slack', webhookUrl: process.env.SLACK_WEBHOOK }
    ]
  });

  const watcher = new FileWatcher('.next/server/logs/app.log');
  monitor.attachWatcher(watcher);
  await monitor.start();
  await watcher.start();
}
```

---

## Project structure

```
nodewatchr/
├── bin/
│   └── nodewatchr.js          # CLI entry point
├── src/
│   ├── index.js               # Public API exports
│   ├── bootstrap.js           # CLI startup logic (also importable)
│   ├── Monitor.js             # Main orchestrator class
│   ├── ingestion/
│   │   ├── FileWatcher.js     # Tails log files using chokidar
│   │   └── StreamWatcher.js   # Attaches to Node.js Readable streams
│   ├── engine/
│   │   ├── RuleEngine.js      # Regex, threshold, and rate rule evaluation
│   │   └── AlertBuffer.js     # Deduplication and cooldown enforcement
│   ├── adapters/
│   │   ├── BaseAdapter.js     # Abstract base class for all adapters
│   │   ├── AdapterRegistry.js # Resolves adapter type strings to instances
│   │   ├── Dispatcher.js      # Parallel dispatch with retry and dead-letter
│   │   ├── TelegramAdapter.js
│   │   ├── SlackAdapter.js
│   │   ├── DiscordAdapter.js
│   │   └── EmailAdapter.js
│   ├── config/
│   │   ├── ConfigLoader.js    # Zod schema validation
│   │   └── ConfigWatcher.js   # Hot reload on config file change
│   └── adapters/
│       └── TemplateEngine.js  # {{token}} substitution engine
├── tests/
│   ├── unit/
│   └── integration/
├── examples/
│   ├── express/
│   ├── fastify/
│   └── nextjs/
├── alertengine-js.config.example.js
├── package.json
└── pnpm-lock.yaml
```

---

## Contributing

```bash
# Clone and install
git clone https://github.com/Praveenpn180/nodewatchr.git
cd nodewatchr
pnpm install

# Run tests
pnpm test

# Run in watch mode
pnpm test:watch

# Lint
pnpm lint
```

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

**Releasing** (maintainers only):

```bash
pnpm version patch   # or minor / major
git push origin main --follow-tags
# GitHub Actions handles npm publish automatically
```

---

## License

[MIT](./LICENSE) — Praveen PN, 2026
