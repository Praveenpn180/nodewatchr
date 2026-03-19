# alertengine-js

> Configurable log monitoring and alerting for Node.js applications.

Watch `stdout`, `stderr`, or log files and fire alerts to **Telegram**, **Slack**, **Discord**, or **Email** when configurable rules are triggered — with zero build step required.

[![CI](https://github.com/Praveenpn180/alertengine-js/actions/workflows/ci.yml/badge.svg)](https://github.com/Praveenpn180/alertengine-js/actions/workflows/ci.yml)
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
- **Custom adapter support** — install any `alertengine-*` adapter from npm
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

This shows how to add alertengine-js to a real Node.js project — a production Express API that writes logs to a file and needs to alert the team when things go wrong.

### Step 1 — Install

```bash
pnpm add alertengine-js
```

### Step 2 — Set up your notification channel

Pick one to start. You can add more later by adding entries to the `adapters` array.

<details>
<summary><strong>Telegram</strong> (recommended — free, instant, no workspace needed)</summary>

1. Open Telegram → search `@BotFather` → send `/newbot`
2. Follow the prompts and copy the token it gives you
3. Send any message to your new bot to start the chat
4. Open this URL in your browser (replace `YOUR_TOKEN`):
   `https://api.telegram.org/botYOUR_TOKEN/getUpdates`
5. Find `"id"` inside the `"chat"` object in the response

```bash
# Add to your .env file
TG_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TG_CHAT_ID=987654321
```
</details>

<details>
<summary><strong>Slack</strong></summary>

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch
2. Under **Features**, click **Incoming Webhooks** → toggle on → Add New Webhook to Workspace
3. Choose a channel and click Allow
4. Copy the webhook URL

```bash
# Add to your .env file
SLACK_WEBHOOK=https://hooks.slack.com/services/T00000/B00000/XXXXXXXX
```
</details>

<details>
<summary><strong>Discord</strong></summary>

1. Open Discord → go to your server → channel settings → Integrations → Webhooks
2. Click New Webhook, give it a name, choose a channel
3. Copy the webhook URL

```bash
# Add to your .env file
DISCORD_WEBHOOK=https://discord.com/api/webhooks/000000/XXXXXXXX
```
</details>

<details>
<summary><strong>Email (SMTP)</strong></summary>

Works with Gmail, AWS SES, Mailgun, Postmark, or any SMTP provider.

```bash
# Add to your .env file
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password   # Gmail: use an App Password, not your login password
ALERT_FROM=alerts@yourapp.com
ALERT_TO=oncall@yourteam.com
```
</details>

### Step 3 — Create the config file

Create `alertengine.config.js` in your project root. This example monitors an Express API log file for the most common production failure patterns:

```js
// alertengine.config.js
export default {
  watchers: [
    // Watch wherever your app writes logs
    // For PM2:     /root/.pm2/logs/your-app-out.log
    // For Docker:  mount the log file as a volume and point here
    // For Winston: wherever you configured your file transport
    { type: 'file', path: './logs/app.log' },
  ],

  rules: [
    {
      // Fire the moment any unhandled error or fatal message appears
      name: 'fatal-error',
      match: /FATAL|unhandledRejection|uncaughtException/i,
      cooldownMs: 60_000,       // at most once per minute
      severity: 'critical',
    },
    {
      // Alert after 10 errors accumulate within 2 minutes — avoids noise
      // from a single bad request but catches a real error wave
      name: 'error-spike',
      match: /\bERROR\b/i,
      threshold: { count: 10, windowMs: 120_000 },
      cooldownMs: 300_000,      // silence for 5 minutes after firing
      severity: 'warning',
    },
    {
      // Out-of-memory crashes — always critical, fire immediately
      name: 'oom-killer',
      match: /JavaScript heap out of memory/,
      threshold: { count: 1, windowMs: 1_000 },
      cooldownMs: 0,
      severity: 'critical',
      templates: {
        telegram: '💀 *OOM crash on {{hostname}}*\n`{{line}}`\n_{{timestamp}}_',
        slack:    ':skull: *OOM crash* on `{{hostname}}`\n>{{line}}',
      },
    },
    {
      // Detect a sudden log rate spike — catches cascading failures
      // before individual error patterns do
      name: 'log-rate-spike',
      match: /.+/,
      rateThreshold: {
        shortWindowMs: 10_000,   // last 10 seconds
        longWindowMs:  300_000,  // vs 5-minute baseline
        multiplier:    15,        // fire if 15× busier than normal
      },
      cooldownMs: 120_000,
      severity: 'warning',
    },
  ],

  adapters: [
    // All adapters run in parallel — a failure in one does not block others
    {
      type:     'telegram',
      token:    process.env.TG_TOKEN,
      chatId:   process.env.TG_CHAT_ID,
      // Default template for all rules that don't define their own
      template: '🚨 *[{{severity}}] {{ruleName}}*\n`{{line}}`\n_{{env}} • {{hostname}} • {{timestamp}}_',
    },
  ],
}
```

### Step 4 — Load your `.env` and run

```bash
# Using dotenv-cli (pnpm add -D dotenv-cli)
dotenv -- npx alertengine-js --config ./alertengine.config.js

# Or export vars manually in your shell
export $(cat .env | xargs) && npx alertengine-js --config ./alertengine.config.js
```

### Step 5 — Run it alongside your app in production

The most common production setup is running alertengine-js as a sidecar process via PM2:

```js
// ecosystem.config.cjs  (your existing PM2 config)
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'src/server.js',
      // Make sure your app writes logs to a file PM2 or Winston controls
    },
    {
      // alertengine-js runs as a separate process watching the same log file
      name: 'alertengine-js',
      script: 'node_modules/.bin/alertengine-js',
      args: '--config ./alertengine.config.js',
      watch: false,
      env: {
        TG_TOKEN:    process.env.TG_TOKEN,
        TG_CHAT_ID:  process.env.TG_CHAT_ID,
        NODE_ENV:    'production',
      },
    },
  ],
}
```

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

alertengine-js will now restart automatically if it crashes, and both processes are managed together. You'll start receiving alerts the moment your app logs a matching line.

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

Create a `alertengine.config.js` file (or `.json`) in your project root:

```js
// alertengine.config.js
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

Multiple adapters can run simultaneously — add as many as you need to the `adapters` array. All are called in parallel when an alert fires. A failure in one (e.g. Telegram is rate-limited) never blocks the others.

```js
adapters: [
  { type: 'telegram', ... },
  { type: 'slack',    ... },
  { type: 'discord',  ... },
  { type: 'email',    ... },
]
```

---

### Telegram

The fastest adapter to get working — no workspace, no OAuth, just a bot token and a chat ID. Free with no message limits at alert volumes.

**Getting your credentials:**

```
1. Open Telegram → search @BotFather → send /newbot
2. Give your bot a name (e.g. "MyApp Alerts") and a username (e.g. myapp_alerts_bot)
3. BotFather replies with your token — copy it

4. Search for your new bot and send it any message (e.g. "hello")
   This step is required — bots cannot message you until you initiate contact

5. Open this URL in your browser (replace YOUR_TOKEN):
   https://api.telegram.org/botYOUR_TOKEN/getUpdates

6. In the JSON response, find:
   result[0].message.chat.id  ← this is your TG_CHAT_ID
```

**`.env`:**
```bash
TG_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TG_CHAT_ID=987654321
```

**Config:**
```js
{
  type:     'telegram',
  token:    process.env.TG_TOKEN,    // required
  chatId:   process.env.TG_CHAT_ID,  // required
  threadId: '42',                    // optional — send to a specific topic in a supergroup
  template: '🚨 *[{{severity}}] {{ruleName}}*\n`{{line}}`\n_{{timestamp}}_',
}
```

**Sending to a Telegram channel instead of a personal chat:**

Add your bot as an admin to the channel, then use the channel's username or numeric ID as `chatId`:

```js
chatId: '@your_channel_username'   // public channel
chatId: '-1001234567890'           // private channel (negative number with -100 prefix)
```

| Field | Required | Description |
|---|---|---|
| `token` | ✅ | Bot API token from @BotFather |
| `chatId` | ✅ | Personal chat ID, group ID, or channel username |
| `threadId` | — | Topic ID for supergroups with topics enabled |
| `template` | — | Message template — supports Telegram MarkdownV2 |

---

### Slack

Uses [Incoming Webhooks](https://api.slack.com/messaging/webhooks) — a single URL, no OAuth tokens or scopes to manage.

**Getting your webhook URL:**

```
1. Go to https://api.slack.com/apps → Create New App → From scratch
2. Name it (e.g. "alertengine-js") and select your workspace
3. In the left sidebar: Features → Incoming Webhooks → toggle On
4. Click "Add New Webhook to Workspace"
5. Choose the channel where alerts should appear → click Allow
6. Copy the webhook URL — it looks like:
   https://hooks.slack.com/services/T.../B.../XXXXXXXX...
```

**`.env`:**
```bash
SLACK_WEBHOOK=https://hooks.slack.com/services/T.../B.../XXXXXXXX...
```

**Config:**
```js
{
  type:       'slack',
  webhookUrl: process.env.SLACK_WEBHOOK,  // required
  template:   ':rotating_light: *[{{severity}}] {{ruleName}}*\n>{{line}}\n_{{env}} • {{hostname}} • {{timestamp}}_',
}
```

Alerts are sent as [Block Kit](https://api.slack.com/block-kit) messages with a header, severity and match count fields, and the matched log line in a code block.

| Field | Required | Description |
|---|---|---|
| `webhookUrl` | ✅ | Incoming webhook URL from api.slack.com/apps |
| `template` | — | Message template — supports Slack mrkdwn formatting |

---

### Discord

Uses [Discord webhooks](https://discord.com/developers/docs/resources/webhook) — available on any server channel without any special permissions setup.

**Getting your webhook URL:**

```
1. Open Discord → right-click your server → Server Settings → Integrations → Webhooks
   (or: open the channel → click the gear icon → Integrations → Webhooks)
2. Click "New Webhook"
3. Give it a name and choose the channel
4. Click "Copy Webhook URL"
```

**`.env`:**
```bash
DISCORD_WEBHOOK=https://discord.com/api/webhooks/1234567890/XXXXXXXXXXXXXXXX
```

**Config:**
```js
{
  type:       'discord',
  webhookUrl: process.env.DISCORD_WEBHOOK,  // required
  template:   '**[{{severity}}] {{ruleName}}**\n```{{line}}```\n{{env}} • {{hostname}} • {{timestamp}}',
}
```

Alerts are sent as rich embeds — automatically colour-coded by severity:

| Severity | Embed colour |
|---|---|
| `critical` | 🔴 Red |
| `warning` | 🟡 Amber |
| `info` | 🔵 Blue |

| Field | Required | Description |
|---|---|---|
| `webhookUrl` | ✅ | Discord webhook URL |
| `template` | — | Message template — supports Discord markdown |

---

### Email

Uses [nodemailer](https://nodemailer.com) — works with Gmail, AWS SES, Mailgun, Postmark, Sendgrid, or any SMTP provider. The transport is created once at startup and reused for all sends.

**Gmail setup:**

Gmail requires an App Password (not your login password) when 2FA is enabled:
```
1. Go to myaccount.google.com → Security → 2-Step Verification → App passwords
2. Create a new app password for "Mail"
3. Use that 16-character password as SMTP_PASS
```

**`.env`:**
```bash
# Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop    # App Password (spaces are fine)
ALERT_FROM=you@gmail.com
ALERT_TO=oncall@yourteam.com

# AWS SES (us-east-1)
# SMTP_HOST=email-smtp.us-east-1.amazonaws.com
# SMTP_PORT=587
# SMTP_USER=AKIAIOSFODNN7EXAMPLE
# SMTP_PASS=your_ses_smtp_password
```

**Config:**
```js
{
  type:  'email',
  host:  process.env.SMTP_HOST,
  port:  Number(process.env.SMTP_PORT),
  user:  process.env.SMTP_USER,
  pass:  process.env.SMTP_PASS,
  from:  process.env.ALERT_FROM,
  to:    process.env.ALERT_TO,   // comma-separate for multiple: 'a@x.com,b@x.com'
}
```

Emails are sent with both a plain text body (using the template) and an HTML body with a formatted card layout.

| Field | Required | Description |
|---|---|---|
| `host` | ✅ | SMTP server hostname |
| `port` | ✅ | `587` for STARTTLS, `465` for SSL, `25` for plain |
| `user` | ✅ | SMTP username |
| `pass` | ✅ | SMTP password or app-specific password |
| `from` | ✅ | Sender address |
| `to` | ✅ | Recipient address(es) — comma-separated |

---

### Using all four adapters together

```js
// alertengine.config.js — full multi-adapter example
export default {
  watchers: [
    { type: 'file', path: './logs/app.log' },
  ],
  rules: [
    {
      name: 'fatal-error',
      match: /FATAL|unhandledRejection|uncaughtException/i,
      cooldownMs: 60_000,
      severity: 'critical',
      // Override message per adapter for critical alerts
      templates: {
        telegram: '🚨 *CRITICAL: {{ruleName}}*\n`{{line}}`\n_{{timestamp}}_',
        slack:    ':fire: *CRITICAL: {{ruleName}}*\n>{{line}}',
        discord:  '🔥 **CRITICAL: {{ruleName}}**\n```{{line}}```',
      },
    },
    {
      name: 'error-spike',
      match: /\bERROR\b/i,
      threshold: { count: 10, windowMs: 120_000 },
      cooldownMs: 300_000,
      severity: 'warning',
    },
  ],
  adapters: [
    // Personal Telegram alert — instant, always on
    {
      type:     'telegram',
      token:    process.env.TG_TOKEN,
      chatId:   process.env.TG_CHAT_ID,
      template: '⚠️ *[{{severity}}] {{ruleName}}*\n`{{line}}`\n_{{env}} • {{timestamp}}_',
    },
    // Team Slack channel — for visibility across the team
    {
      type:       'slack',
      webhookUrl: process.env.SLACK_WEBHOOK,
      template:   ':warning: *[{{severity}}] {{ruleName}}* ({{count}} matches)\n>{{line}}\n_{{timestamp}}_',
    },
    // Discord server — for community or open source projects
    {
      type:       'discord',
      webhookUrl: process.env.DISCORD_WEBHOOK,
    },
    // Email — for formal incident records and on-call rotation
    {
      type: 'email',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.ALERT_FROM,
      to:   process.env.ALERT_TO,
    },
  ],
}
```

---

### Custom adapters

Any npm package that exports a class extending `BaseAdapter` can be used as an adapter. Name your package `alertengine-*` for discoverability.

**Installing a custom adapter:**

```bash
pnpm add alertengine-pagerduty
```

```js
// alertengine.config.js
adapters: [
  { type: 'alertengine-pagerduty', routingKey: process.env.PD_KEY }
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
[alertengine-js] {{ruleName}}
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
| `-c, --config <path>` | `./alertengine.config.js` | Path to config file |
| `--no-hot-reload` | — | Disable live config reload on file change |
| `--dead-letter-dir <path>` | `.alertengine/failed` | Directory for failed alert logs |
| `-V, --version` | — | Print version number |
| `-h, --help` | — | Print help |

**Examples:**

```bash
# Use a custom config path
npx alertengine-js --config /etc/myapp/alertengine.config.js

# Disable hot reload (useful in Docker where inotify may be limited)
npx alertengine-js --no-hot-reload

# Custom dead-letter directory
npx alertengine-js --dead-letter-dir /var/log/alertengine-js/failed
```

**Hot config reload:**

When hot reload is enabled (the default), editing your config file while alertengine-js is running automatically swaps in the new rules without restarting. If the new config fails Zod validation, the error is logged and the previous valid config continues running.

---

## Programmatic usage

You can use alertengine-js as a library inside your own application without the CLI:

```js
import { Monitor, FileWatcher, StreamWatcher, loadConfig } from 'alertengine-js';

// Load and validate config from file
const config = await loadConfig('./alertengine.config.js');

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
// plugins/alertengine-js.js
import fp from 'fastify-plugin';
import { PassThrough } from 'stream';
import { Monitor, StreamWatcher } from 'alertengine-js';

export default fp(async function(fastify, opts) {
  const logStream = new PassThrough();
  const monitor = new Monitor({ rules: opts.rules, adapters: opts.adapters });

  monitor.attachWatcher(new StreamWatcher(logStream, { ownsStream: true }));
  await monitor.start();

  fastify.addHook('onClose', () => monitor.stop());
}, { name: 'alertengine-js' });
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
alertengine-js/
├── bin/
│   └── alertengine-js.js      # CLI entry point
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
├── alertengine.config.example.js
├── package.json
└── pnpm-lock.yaml
```

---

## Contributing

```bash
# Clone and install
git clone https://github.com/Praveenpn180/alertengine-js.git
cd alertengine-js
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