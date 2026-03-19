# nodewatchr

Log monitoring and alerting for Node.js. Watch stdout, stderr, or log files
and fire alerts to Telegram, Slack, Discord, or email when configurable
rules are triggered.

## Install

pnpm add @yourname/nodewatchr

## Quickstart

npx nodewatchr --config ./nodewatchr.config.js

## Config reference

### Rules
| Field          | Type     | Required | Description                         |
|----------------|----------|----------|-------------------------------------|
| name           | string   | ✅       | Unique rule identifier              |
| match          | RegExp   | ✅       | Pattern to match against each line  |
| threshold      | object   | —        | Count-based threshold config        |
| rateThreshold  | object   | —        | Rate-spike detection config         |
| cooldownMs     | number   | —        | Minimum ms between alerts (default 60000) |
| severity       | string   | —        | 'critical' / 'warning' / 'info'     |
| templates      | object   | —        | Per-adapter message templates       |

### Adapters
| Type      | Required config fields               |
|-----------|--------------------------------------|
| telegram  | token, chatId                        |
| slack     | webhookUrl                           |
| discord   | webhookUrl                           |
| email     | host, port, user, pass, from, to     |

## Writing a custom adapter

Install the nodewatchr package, extend BaseAdapter, export as default.
Publish to npm with a name starting `nodewatchr-` for discoverability.

## CLI flags

--config       Path to config file (default: ./nodewatchr.config.js)
--no-hot-reload  Disable live config reload
--dead-letter-dir  Directory for failed alert logs