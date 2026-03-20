// src/adapters/AdapterRegistry.js
import { TelegramAdapter } from './TelegramAdapter.js';
import { SlackAdapter }    from './SlackAdapter.js';
import { DiscordAdapter }  from './DiscordAdapter.js';
import { EmailAdapter }    from './EmailAdapter.js';
import { WebhookAdapter }  from './WebhookAdapter.js';

const BUILT_IN = {
  telegram: TelegramAdapter,
  slack:    SlackAdapter,
  discord:  DiscordAdapter,
  email:    EmailAdapter,
  webhook:  WebhookAdapter,
};

export async function resolveAdapters(adapterConfigs) {
  const adapters = [];

  for (const config of adapterConfigs) {
    let AdapterClass = BUILT_IN[config.type];

    if (!AdapterClass) {
      // Treat type as an npm package name and dynamic import it
      const mod = await import(config.type).catch(() => {
        throw new Error(
          `Unknown adapter "${config.type}". ` +
          `Is it installed? Run: pnpm add ${config.type}`
        );
      });
      AdapterClass = mod.default ?? mod[Object.keys(mod)[0]];
    }

    adapters.push(new AdapterClass(config));
  }

  return adapters;
}
